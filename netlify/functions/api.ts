import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const routeReceipt = require('../routes/route-receipt').default;
const routeReports = require('../routes/route-reports').default;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/healthcheck', (_req: Request, res: Response) => {
  res.json({ message: 'Serverless server is running! 🚀' });
});

app.use('/api/receipt', routeReceipt);
app.use('/api/reports', routeReports);

export const handler = serverless(app);