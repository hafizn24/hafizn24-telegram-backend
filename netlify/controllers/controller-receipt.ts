import { Request, Response } from 'express';
import getSupabaseClient from '../supabase/supabase';
import { compressImageToWebp, uploadReceiptImage, extractReceiptData, getTelegramFileMeta, downloadTelegramFile, convertPdfToWebp } from '../services/service-receipt';

/**
 * Sends confirmation message to Telegram user
 */
const sendTelegramConfirmation = async (telegramChatId: number, extractedData: any) => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) return;

  const message = `✅ Receipt processed successfully!\n\n🏪 **Merchant:** ${extractedData.merchantName}\n💰 **Amount:** ${extractedData.totalAmount}`;

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

    try {
      // Storage layout: receipts/<userId>/YYYY/MM/<fileId>.webp
      // (UTC month folder; deterministic fileId name so retries overwrite).
      const userId = telegramChatId || request.userId || 'web';
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

      let webp: { buffer: Buffer; fileName: string } | null = null;

      // 1) Incoming Telegram file (document or photo)?
      const meta = getTelegramFileMeta(req.body);
      if (meta) {
        const isPdf = meta.mimeType === 'application/pdf';
        const isImage = meta.mimeType.startsWith('image/');
        if (!isPdf && !isImage) {
          // Telegram must always get 2xx, otherwise it retries forever.
          return res.status(200).json({
            success: false,
            message: 'Unsupported file type. Please send an image or a PDF receipt.'
          });
        }

        const fileBuffer = await downloadTelegramFile(meta.fileId);
        // Both images and PDFs end up as webp. PDFs are rasterized to an
        // image (first page) so the AI reads them exactly like images —
        // this also fixes the old failure where scanned/encrypted PDFs
        // couldn't be parsed to markdown text.
        webp = meta.mimeType === 'application/pdf'
          ? await convertPdfToWebp(fileBuffer, meta.fileId)
          : await compressImageToWebp(fileBuffer, meta.fileId);
      } else if (request.imageBase64) {
        // 2) Web upload (base64) — no Telegram body.
        const base64Data = request.imageBase64.includes('base64,')
          ? request.imageBase64.split('base64,')[1]
          : request.imageBase64;
        const imageBuffer = Buffer.from(base64Data, 'base64');
        webp = await compressImageToWebp(imageBuffer, request.fileId);
      }

      if (!webp) {
        // Telegram must always get 2xx, otherwise it retries forever.
        return res.status(200).json({
          success: false,
          message: 'Image is required.'
        });
      }

      const fileName = `receipts/${userId}/${yyyy}/${mm}/${webp.fileName}`;
      const uploadResult = await uploadReceiptImage(webp.buffer, fileName);
      const contentUrl = uploadResult.publicUrl;

      const extractedData = await extractReceiptData(contentUrl);

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

        await sendTelegramError(telegramChatId, error.message || 'Database insert failed.');

        // CHANGED: 500 -> 200. This is the critical fix: Telegram must
        // never see a non-2xx status from this endpoint, or it will keep
        // resending the same update and re-uploading the same image.
        return res.status(200).json({
          success: false,
          message: error.message
        });
      }

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