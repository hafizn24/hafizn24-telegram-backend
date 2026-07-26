import express from 'express';
import ControllerReports from '../controllers/controller-reports';

const router = express.Router();

router.get('/weekly/:userId', ControllerReports.getWeeklyReport);
router.get('/monthly/:userId', ControllerReports.getMonthlyReport);

export default router;