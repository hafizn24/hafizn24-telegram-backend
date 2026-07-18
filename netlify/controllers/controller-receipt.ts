import { Request, Response } from 'express';
import getSupabaseClient from '../supabase/supabase';
import { compressImageToWebp, uploadReceiptImage, extractReceiptData, getImageBase64FromTelegramUpdate } from '../services/service-receipt';

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
      // If imageBase64 wasn't sent directly, check if this is a Telegram update
      // (Telegram only sends a file_id, not the image bytes) and fetch it.
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
      const extractedData = await extractReceiptData(uploadResult.publicUrl);

      const payload = {
        merchant_name: extractedData.merchantName,
        total_amount: extractedData.totalAmount,
        currency: extractedData.currency,
        notes: extractedData.notes || null,
        image_url: uploadResult.publicUrl,
        ai_summary: extractedData.summary,
        source,
        created_at: new Date().toISOString()
      };

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('receipts')
        .insert([payload])
        .select();

      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
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