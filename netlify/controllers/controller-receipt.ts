import { Request, Response } from 'express';
import supabase from '../supabase/supabase';

class ControllerReceipt {
  static async setTest(req: Request, res: Response) {
    const request = req.body?.data;

    if (!request) {
      return res.status(400).json({
        success: false,
        message: 'No data'
      });
    }

    try {
      const { error } = await supabase
        .from('test')
        .insert([{ value: request }])
        .select();

      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }

      return res.json({
        success: true,
        message: 'Data Inserted'
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