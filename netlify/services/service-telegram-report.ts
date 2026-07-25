import { getAllUsersWithReceipts } from './service-reports';

/**
 * Escape special characters for Telegram Markdown V1
 * Characters that need escaping: _, *, ``, [, ]
 */
const escapeMarkdownV1 = (text: string): string => {
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
};

/**
 * Send a report message to a Telegram user
 */
const sendTelegramReport = async (userId: number, report: string): Promise<void> => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram bot token not configured');
  }
  
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: userId,
        text: report,
        parse_mode: 'Markdown'
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json() as any;
    const errorMessage = errorData?.description || 'Unknown Telegram API error';
    throw new Error(`Telegram API error: ${errorMessage}`);
  }
};

/**
 * Run a report batch for weekly or monthly reports
 */
const runReportBatch = async (
  type: 'weekly' | 'monthly',
  generateReport: (userId: number) => Promise<string>
): Promise<{
  successCount: number;
  failureCount: number;
  totalUsers: number;
}> => {
  try {
    console.log(`Starting ${type} report generation...`);
    
    // Get all users with receipts
    const users = await getAllUsersWithReceipts();
    console.log(`Found ${users.length} users to send ${type} reports to`);
    
    if (users.length === 0) {
      console.log(`No users found with receipts for ${type} reports`);
      return {
        successCount: 0,
        failureCount: 0,
        totalUsers: 0
      };
    }
    
    // Send report to each user
    let successCount = 0;
    let failureCount = 0;
    
    for (const userId of users) {
      try {
        const report = await generateReport(userId);
        
        // Send the report via Telegram
        await sendTelegramReport(userId, report);
        successCount++;
        console.log(`${type} report sent to user ${userId}`);
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 40));
      } catch (error) {
        failureCount++;
        console.error(`Failed to send ${type} report to user ${userId}:`, error);
      }
    }
    
    console.log(`${type} report completed: ${successCount} successful, ${failureCount} failed`);
    
    return {
      successCount,
      failureCount,
      totalUsers: users.length
    };
  } catch (error) {
    console.error(`Error in ${type} report function:`, error);
    throw error;
  }
};

export {
  escapeMarkdownV1,
  sendTelegramReport,
  runReportBatch
};