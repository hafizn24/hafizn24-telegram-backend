import { Request, Response } from 'express';
import supabase from '../supabase/supabase';
import { compressImageToWebp, uploadReceiptImage, generateReceiptSummary } from '../services/service-receipt';

class ControllerReceipt {
  static async setTest(req: Request, res: Response) {
    const request = req.body?.data ?? req.body;

    if (!request) {
      return res.status(400).json({
        success: false,
        message: 'No data'
      });
    }

    try {
      let imageUrl: string | null = null;
      let aiSummary = 'No summary generated.';

      if (request.imageBase64) {
        const { buffer, fileName } = await compressImageToWebp(request.imageBase64);
        const uploadResult = await uploadReceiptImage(buffer, fileName);
        imageUrl = uploadResult.publicUrl;
        aiSummary = await generateReceiptSummary(request, imageUrl);
      }

      const payload = {
        merchant_name: request.merchantName || 'Unknown',
        total_amount: request.totalAmount || 0,
        currency: request.currency || 'MYR',
        notes: request.notes || null,
        image_url: imageUrl,
        ai_summary: aiSummary,
        source: request.source || 'web',
        created_at: new Date().toISOString()
      };

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
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({
        success: false,
        message
      });
    }
  }
}

export default ControllerReceipt;