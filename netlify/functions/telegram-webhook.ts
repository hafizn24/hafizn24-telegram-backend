import { Handler } from '@netlify/functions';
import bot from '../bot';

// Set webhook handler
const handler: Handler = async (event, context) => {
  try {
    // Handle webhook requests
    if (event.httpMethod === 'POST' && event.path === '/telegram-webhook') {
      // Parse the update from Telegram
      const update = JSON.parse(event.body || '{}');
      
      // Process the update with the bot
      await bot.handleUpdate(update);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Webhook processed successfully' })
      };
    }
    
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

export { handler };