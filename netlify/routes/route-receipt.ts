import express from 'express';
import ControllerReceipt from '../controllers/controller-receipt';

const router = express.Router();

router.post('/insert', ControllerReceipt.setTest);

export default router;