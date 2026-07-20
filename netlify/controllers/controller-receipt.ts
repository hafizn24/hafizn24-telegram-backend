import { Request, Response } from 'express';
import getSupabaseClient from '../supabase/supabase';
import { compressImageToWebp, uploadReceiptImage, extractReceiptData, getImageBase64FromTelegramUpdate, isPdfDocument, getPdfFileId } from '../services/service-receipt';
import { processPdfFromTelegram, cleanupTempFiles } from '../services/service-pdf';

/**
 * Sends confirmation message to Telegram user
 */
const sendTelegramConfirmation = async (telegramUserId: number, summary: string) => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) return;

  const message = `✅ Receipt processed successfully!\n\n📊 **Summary:**\n${summary}`;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramUserId,
          text: message,
          parse_mode: 'Markdown'
        })
      }
    );
  } catch (error) {
    console.error('Failed to send confirmation:', error);
  }
};

class ControllerReceipt {
  static async setReceipt(req: any, res: Response) {
    const request = req.body?.data ?? req.body;

    if (!request) {
      return res.status(400).json({
        success: false,
        message: 'No data'
      });
    }

    try {
      // Extract user ID from Telegram update if available
      const telegramUserId = req.body?.message?.from?.id;
      
      // Check if this is a PDF from Telegram
      let contentUrl = null;
      let contentType = 'image';
      let tempFilePath = null;

      if (isPdfDocument(req.body)) {
        // Process PDF
        const fileId = getPdfFileId(req.body);
        if (!fileId) {
          return res.status(400).json({
            success: false,
            message: 'PDF file ID not found'
          });
        }

        const { markdownUrl, tempFilePath: pdfTempPath } = await processPdfFromTelegram(fileId);
        contentUrl = markdownUrl;
        contentType = 'pdf';
        tempFilePath = pdfTempPath;
      } else {
        // Process image (existing logic)
        let imageBase64 = request.imageBase64;
        let source = request.source || 'web';

        if (!imageBase64) {
          const telegramImage = await getImageBase64FromTelegramUpdate(req.body);
          if (telegramImage) {
            imageBase64 = telegramImage;
            source = 'telegram';
          }
        }

        if (!imageBase64) {
          return res.status(400).json({
            success: false,
            message: 'Image is required.'
          });
        }

        const { buffer, fileName } = await compressImageToWebp(imageBase64);
        const uploadResult = await uploadReceiptImage(buffer, fileName);
        contentUrl = uploadResult.publicUrl;
        source = source || (req.body ? 'telegram' : 'web');
      }

      // Extract receipt data based on content type
      const extractedData = await extractReceiptData(contentUrl, contentType === 'pdf' ? 'pdf' : 'image');

      const payload = {
        merchant_name: extractedData.merchantName,
        total_amount: extractedData.totalAmount,
        currency: extractedData.currency,
        notes: extractedData.notes || null,
        image_url: contentUrl,
        ai_summary: extractedData.summary,
        source: contentType === 'pdf' ? 'pdf' : (request.source || 'web'),
        user_id: telegramUserId || null, // Add user_id field
        created_at: new Date().toISOString()
      };

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('receipts')
        .insert([payload])
        .select();

      if (error) {
        // Cleanup temp file if it exists
        if (tempFilePath) {
          cleanupTempFiles(tempFilePath);
        }
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }

      // Cleanup temp file if it exists
      if (tempFilePath) {
        cleanupTempFiles(tempFilePath);
      }

      // Send confirmation to Telegram user if available
      if (telegramUserId) {
        await sendTelegramConfirmation(telegramUserId, extractedData.summary);
      }

      return res.json({
        success: true,
        message: 'Receipt processed',
        data: payload
      });
    } catch (err) {
      console.error('setReceipt failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({
        success: false,
        message
      });
    }
  }
}

export default ControllerReceipt;