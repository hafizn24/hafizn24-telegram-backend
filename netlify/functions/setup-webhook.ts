import bot from '../bot';

/**
 * Setup Telegram webhook for production
 * This should be run once when deploying to production
 */
const setupWebhook = async () => {
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.error('TELEGRAM_WEBHOOK_URL environment variable is required');
    process.exit(1);
  }
  
  try {
    console.log('Setting up Telegram webhook...');
    
    // Set the webhook
    const response = await bot.telegram.setWebhook(webhookUrl);
    
    if (response) {
      console.log('✅ Webhook set successfully:', webhookUrl);
      
      // Get current webhook info for verification
      const webhookInfo = await bot.telegram.getWebhookInfo();
      console.log('📋 Webhook info:', webhookInfo);
    } else {
      console.error('❌ Failed to set webhook');
    }
  } catch (error) {
    console.error('Error setting up webhook:', error);
    process.exit(1);
  }
};

// Run setup if this file is executed directly
if (require.main === module) {
  setupWebhook();
}

export { setupWebhook };