import { generateWeeklyReport } from '../services/service-reports';
import { runReportBatch } from '../services/service-telegram-report';

/**
 * Send weekly reports to all users with receipts
 * This function is triggered by Netlify cron schedule
 */
const sendWeeklyReports = async () => {
  try {
    const result = await runReportBatch('weekly', generateWeeklyReport);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Weekly reports processed',
        ...result
      })
    };
  } catch (error) {
    console.error('Error in weekly report function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Error processing weekly reports',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Export the handler for Netlify
export { sendWeeklyReports as handler };

// For local testing
if (require.main === module) {
  sendWeeklyReports().then(result => {
    console.log('Result:', result);
  }).catch(error => {
    console.error('Error:', error);
  });
}