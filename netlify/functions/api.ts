import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const routeReceipt = require('../routes/route-receipt').default;
const routeReports = require('../routes/route-reports').default;
const bot = require('../bot').default;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/healthcheck', (_req: Request, res: Response) => {
  res.json({ message: 'Serverless server is running! 🚀' });
});

app.use('/api/receipt', routeReceipt);
app.use('/api/reports', routeReports);

// Handle bot webhook requests in serverless environment
app.post('/telegram-webhook', async (req, res) => {
  try {
    // Verify webhook secret token if configured
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken) {
      const providedToken = req.headers['x-telegram-bot-api-secret-token'];
      if (providedToken !== secretToken) {
        console.error('Invalid webhook secret token');
        return res.status(403).json({ error: 'Invalid webhook secret' });
      }
    }
    
    await bot.handleUpdate(req.body);
    res.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// For development mode, launch the bot with long polling
// Use a module-level flag to prevent multiple launches during hot reload
if (process.env.NODE_ENV !== 'production' && !global.botLaunched) {
  global.botLaunched = true;
  bot.launch();
  
  // Graceful shutdown
  process.once('SIGINT', () => {
    global.botLaunched = false;
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    global.botLaunched = false;
    bot.stop('SIGTERM');
  });
}

export const handler = serverless(app);