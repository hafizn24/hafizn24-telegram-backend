import express from 'express';
import ControllerReceipt from '../controllers/controller-receipt';

const router = express.Router();

router.post('/insert', ControllerReceipt.setReceipt);

export default router;