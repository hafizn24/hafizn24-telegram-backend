import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Declare global variable for bot launch tracking
declare global {
  var botLaunched: boolean;
}

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

// Check webhook secret
const checkWebhookSecret = (req: Request, res: Response): boolean => {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  
  if (secretToken) {
    // Secret is configured, validate it regardless of NODE_ENV
    const providedToken = req.headers['x-telegram-bot-api-secret-token'];
    if (providedToken !== secretToken) {
      console.error('❌ Invalid webhook secret token');
      res.status(403).json({ error: 'Invalid webhook secret' });
      return false;
    }
  } else if (process.env.NODE_ENV === 'production') {
    // No secret configured in production - fail closed
    console.error('❌ TELEGRAM_WEBHOOK_SECRET is required in production but not set');
    res.status(500).json({ error: 'Server configuration error: webhook secret not configured' });
    return false;
  }
  // No secret configured and not in production - allow (local dev)
  
  return true;
};

// Handle bot webhook requests in serverless environment
app.post('/telegram-webhook', async (req, res) => {
  try {
    // Verify webhook secret token
    if (!checkWebhookSecret(req, res)) {
      return;
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