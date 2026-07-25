import { Request, Response } from 'express';
import { generateWeeklyReport, generateMonthlyReport } from '../services/service-reports';

class ControllerReports {
  /**
   * Get weekly report for a user
   */
  static async getWeeklyReport(req: Request, res: Response) {
    try {
      const userId = parseInt((req.params as any).userId);
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
      
      const report = await generateWeeklyReport(userId);
      
      return res.json({
        success: true,
        report
      });
    } catch (error) {
      console.error('Error generating weekly report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate weekly report'
      });
    }
  }

  /**
   * Get monthly report for a user
   */
  static async getMonthlyReport(req: Request, res: Response) {
    try {
      const userId = parseInt((req.params as any).userId);
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
      
      const report = await generateMonthlyReport(userId);
      
      return res.json({
        success: true,
        report
      });
    } catch (error) {
      console.error('Error generating monthly report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate monthly report'
      });
    }
  }
}

export default ControllerReports;