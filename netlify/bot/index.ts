import { Telegraf, Context } from 'telegraf';
import { getWeeklyReportData, getMonthlyReportData } from '../controllers/controller-reports';
import { 
  getUserIdByChatId, 
  linkChatToUser, 
  resolveToken
} from '../services/service-telegram-link';
import { 
  formatWeeklyReport, 
  formatMonthlyReport, 
  formatErrorMessage 
} from './formatters';

/**
 * Helper function to send long messages in chunks
 */
async function sendChunked(ctx: Context, text: string, parseMode?: string): Promise<void> {
  const maxLength = 4096;
  let remainingText = text;
  
  while (remainingText.length > 0) {
    let chunk = remainingText.substring(0, maxLength);
    remainingText = remainingText.substring(maxLength);
    
    // Try to split at newline to avoid breaking MarkdownV2 formatting
    if (remainingText.length > 0 && chunk.length === maxLength) {
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline > 0 && lastNewline < maxLength - 100) {
        remainingText = chunk.substring(lastNewline + 1) + remainingText;
        chunk = chunk.substring(0, lastNewline);
      }
    }
    
    await ctx.reply(chunk, { parse_mode: parseMode });
  }
}

// Validate bot token
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
}

// Create bot instance
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

/**
 * Helper function to resolve userId or prompt linking
 */
async function requireUser(ctx: Context): Promise<number | null> {
  const chatId = ctx.chat?.id.toString();
  if (!chatId) {
    await ctx.reply('❌ Unable to identify chat. Please try again.');
    return null;
  }

  const userId = await getUserIdByChatId(chatId);
  if (!userId) {
    await ctx.reply(
      '🔗 You need to link your account first.\n\n' +
      '1. Go to your web app\n' +
      '2. Navigate to Settings → Connect Telegram\n' +
      '3. Click the link provided to connect your account'
    );
    return null;
  }

  return userId;
}

/**
 * /start command - Account linking
 */
bot.start(async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  if (!chatId) {
    return ctx.reply('❌ Unable to identify chat. Please try again.');
  }

  const token = ctx.startPayload;
  
  if (!token) {
    return ctx.reply(
      '👋 Welcome to the Receipt Bot!\n\n' +
      'To get started, please connect your Telegram account from the web app:\n\n' +
      '1. Log in to your account\n' +
      '2. Go to Settings → Connect Telegram\n' +
      '3. Click the connection link'
    );
  }

  try {
    // Resolve token to get userId (implement this in your service)
    const userId = await resolveToken(token);
    
    // Link the chat to the user
    await linkChatToUser(chatId, userId);
    
    await ctx.reply(
      '✅ Your Telegram account is now linked to your web account!\n\n' +
      'You can now use commands like:\n' +
      '/weekly - Get your weekly report\n' +
      '/monthly - Get your monthly report'
    );
  } catch (error) {
    console.error('Error in /start command:', error);
    await ctx.reply(
      '❌ That link is invalid or expired.\n\n' +
      'Please generate a new connection link from the web app:\n' +
      '1. Go to Settings → Connect Telegram\n' +
      '2. Click the connection link'
    );
  }
});

/**
 * /weekly command - Get weekly report
 */
bot.command('weekly', async (ctx) => {
  const userId = await requireUser(ctx);
  if (!userId) return;

  try {
    const report = await getWeeklyReportData(userId);
    const formattedReport = formatWeeklyReport(report);
    await sendChunked(ctx, formattedReport, 'MarkdownV2');
  } catch (error) {
    console.error('Error in /weekly command:', error);
    await ctx.reply(
      '⚠️ Could not fetch your weekly report right now. Please try again later.'
    );
  }
});

/**
 * /monthly command - Get monthly report
 */
bot.command('monthly', async (ctx) => {
  const userId = await requireUser(ctx);
  if (!userId) return;

  try {
    const report = await getMonthlyReportData(userId);
    const formattedReport = formatMonthlyReport(report);
    await sendChunked(ctx, formattedReport, 'MarkdownV2');
  } catch (error) {
    console.error('Error in /monthly command:', error);
    await ctx.reply(
      '⚠️ Could not fetch your monthly report right now. Please try again later.'
    );
  }
});

/**
 * /help command - Show available commands
 */
bot.command('help', async (ctx) => {
    await ctx.reply(
      '🤖 *Receipt Bot Commands*\n\n' +
      '• /start - Link your Telegram account\n' +
      '• /weekly - Get your weekly spending report\n' +
      '• /monthly - Get your monthly spending report\n' +
      '• /help - Show this help message\n\n' +
      'Make sure your account is linked first with /start!',
      { parse_mode: 'MarkdownV2' }
    );
});

/**
 * Handle unknown commands
 */
bot.on('text', (ctx) => {
  if (ctx.message?.text?.startsWith('/')) {
    ctx.reply(
      '❓ Unknown command. Use /help to see available commands.'
    );
  }
});

/**
 * Error handler
 */
bot.catch((err, ctx) => {
  console.error('Telegram Bot Error:', err);
  
  // Try to inform the user about the error
  if (ctx.chat) {
    ctx.reply(
      '⚠️ Something went wrong with the bot. Please try again later.'
    ).catch(() => {
      // If we can't reply to the user, just log the error
      console.error('Failed to send error message to user');
    });
  }
});

export default bot;