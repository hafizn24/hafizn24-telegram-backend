import { Request, Response } from 'express';
import getSupabaseClient from '../supabase/supabase';
import { compressImageToWebp, uploadReceiptImage, extractReceiptData, getImageBase64FromTelegramUpdate, isPdfDocument, getPdfFileId } from '../services/service-receipt';
import { processPdfFromTelegram, cleanupTempFiles } from '../services/service-pdf';

/**
 * Sends confirmation message to Telegram user
 */
const sendTelegramConfirmation = async (telegramChatId: number, extractedData: any) => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) return;

  const message = `✅ Receipt processed successfully!\n\n🏪 **Merchant:** ${extractedData.merchantName}`;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: message,
          parse_mode: 'Markdown'
        })
      }
    );
  } catch (error) {
    console.error('Failed to send confirmation:', error);
  }
};

// NEW: also used to report failures back to the user in Telegram instead of
// leaving them with silence, and so we can see failures without relying on
// Telegram retries.
const sendTelegramError = async (telegramChatId: number | undefined, errorMessage: string) => {
  if (!telegramChatId) return;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: `⚠️ Sorry, I couldn't process that receipt.\n\nReason: ${errorMessage}`
        })
      }
    );
  } catch (error) {
    console.error('Failed to send error notification:', error);
  }
};

class ControllerReceipt {
  static async setReceipt(req: any, res: Response) {
    const request = req.body?.data ?? req.body;

    // NOTE: changed from 400 -> 200. Telegram webhooks must always get 2xx,
    // otherwise Telegram will retry this exact update forever.
    if (!request) {
      return res.status(200).json({
        success: false,
        message: 'No data'
      });
    }

    // CHANGED: use chat.id (correct target for sendMessage) instead of
    // message.from.id (the sender's user id, which is only coincidentally
    // the same as chat.id in 1:1 chats).
    const telegramChatId = req.body?.message?.chat?.id;
    let tempFilePath: string | null = null;

    try {
      let contentUrl: string | null = null;
      let contentType: 'image' | 'pdf' = 'image';

      if (isPdfDocument(req.body)) {
        const fileId = getPdfFileId(req.body);
        if (!fileId) {
          // CHANGED: 400 -> 200
          return res.status(200).json({
            success: false,
            message: 'PDF file ID not found'
          });
        }

        const { markdownUrl, tempFilePath: pdfTempPath } = await processPdfFromTelegram(fileId);
        contentUrl = markdownUrl;
        contentType = 'pdf';
        tempFilePath = pdfTempPath;
      } else {
        let imageBase64 = request.imageBase64;
        let source = request.source || 'web';
        let telegramFileId: string | undefined;

        if (!imageBase64) {
          const telegramImage = await getImageBase64FromTelegramUpdate(req.body);
          if (telegramImage) {
            imageBase64 = telegramImage.base64;
            telegramFileId = telegramImage.fileId;
            source = 'telegram';
          }
        }

        if (!imageBase64) {
          // CHANGED: 400 -> 200
          return res.status(200).json({
            success: false,
            message: 'Image is required.'
          });
        }

        // CHANGED: pass telegramFileId so the uploaded filename is
        // deterministic (same Telegram file -> same storage filename).
        // This means retries overwrite the same object in the bucket
        // instead of creating a new one every time.
        const { buffer, fileName } = await compressImageToWebp(imageBase64, telegramFileId);
        const uploadResult = await uploadReceiptImage(buffer, fileName);
        contentUrl = uploadResult.publicUrl;
        source = source || (req.body ? 'telegram' : 'web');
      }

      const extractedData = await extractReceiptData(contentUrl, contentType === 'pdf' ? 'pdf' : 'image');

      const payload = {
        merchant_name: extractedData.merchantName,
        // CHANGED: force to a number so a numeric DB column never rejects
        // a string like "12.50" coming back from the AI.
        total_amount: Number(extractedData.totalAmount) || 0,
        image_url: contentUrl,
        user_id: telegramChatId || null,
        created_at: new Date().toISOString()
      };

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('receipts')
        .insert([payload])
        .select();

      if (error) {
        // CHANGED: log the FULL error object (not just .message) so the
        // real root cause (RLS denial, column type mismatch, etc.) shows
        // up in Netlify function logs.
        console.error('Supabase insert failed:', JSON.stringify(error, null, 2));

        if (tempFilePath) cleanupTempFiles(tempFilePath);

        await sendTelegramError(telegramChatId, error.message || 'Database insert failed.');

        // CHANGED: 500 -> 200. This is the critical fix: Telegram must
        // never see a non-2xx status from this endpoint, or it will keep
        // resending the same update and re-uploading the same image.
        return res.status(200).json({
          success: false,
          message: error.message
        });
      }

      if (tempFilePath) cleanupTempFiles(tempFilePath);

      if (telegramChatId) {
        await sendTelegramConfirmation(telegramChatId, extractedData);
      }

      return res.status(200).json({
        success: true,
        message: 'Receipt processed',
        data: payload
      });
    } catch (err) {
      // CHANGED: log full error + stack trace for debugging.
      console.error('setReceipt failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (tempFilePath) cleanupTempFiles(tempFilePath);

      await sendTelegramError(telegramChatId, message);

      // CHANGED: 500 -> 200 (critical fix, see explanation above).
      return res.status(200).json({
        success: false,
        message
      });
    }
  }
}

export default ControllerReceipt;