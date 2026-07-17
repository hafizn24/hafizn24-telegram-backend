import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import dotenv from 'dotenv';
import routeReceipt from '../routes/route-receipt';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/healthcheck', (_req: Request, res: Response) => {
  res.json({ message: 'Serverless server is running! 🚀' });
});

app.use('/api/test', routeReceipt);

export const handler = serverless(app);