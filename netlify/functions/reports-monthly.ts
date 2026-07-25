import { generateMonthlyReport, getAllUsersWithReceipts } from '../services/service-reports';

/**
 * Send monthly reports to all users with receipts
 * This function is triggered by Netlify cron schedule
 */
const sendMonthlyReports = async () => {
  try {
    console.log('Starting monthly report generation...');
    
    // Get all users with receipts
    const users = await getAllUsersWithReceipts();
    console.log(`Found ${users.length} users to send monthly reports to`);
    
    if (users.length === 0) {
      console.log('No users found with receipts');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No users found with receipts' })
      };
    }
    
    // Send report to each user
    let successCount = 0;
    let failureCount = 0;
    
    for (const userId of users) {
      try {
        const report = await generateMonthlyReport(userId);
        
        // Send the report via Telegram
        await sendTelegramReport(userId, report);
        successCount++;
        console.log(`Monthly report sent to user ${userId}`);
      } catch (error) {
        failureCount++;
        console.error(`Failed to send monthly report to user ${userId}:`, error);
      }
    }
    
    console.log(`Monthly report completed: ${successCount} successful, ${failureCount} failed`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Monthly reports processed',
        successCount,
        failureCount,
        totalUsers: users.length
      })
    };
  } catch (error) {
    console.error('Error in monthly report function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Error processing monthly reports',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Send a report message to a Telegram user
 */
const sendTelegramReport = async (userId: number, report: string) => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram bot token not configured');
  }
  
  await fetch(
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
};

// Export the handler for Netlify
export { sendMonthlyReports as handler };

// For local testing
if (require.main === module) {
  sendMonthlyReports().then(result => {
    console.log('Result:', result);
  }).catch(error => {
    console.error('Error:', error);
  });
}