import { generateMonthlyReport } from '../services/service-reports';
import { runReportBatch } from '../services/service-telegram-report';

/**
 * Send monthly reports to all users with receipts
 * This function is triggered by Netlify cron schedule
 */
const sendMonthlyReports = async () => {
  try {
    const result = await runReportBatch('monthly', generateMonthlyReport);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Monthly reports processed',
        ...result
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