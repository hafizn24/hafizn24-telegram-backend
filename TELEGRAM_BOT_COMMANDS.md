# Telegram Bot Commands for Weekly/Monthly Reports

This feature allows users to get their weekly and monthly reports directly through Telegram commands.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install telegraf
```

### 2. Environment Variables
Add to your `.env` file:
```
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/telegram-webhook
```

### 3. Database Setup
Create the `telegram_links` table in Supabase:

```sql
CREATE TABLE telegram_links (
  id SERIAL PRIMARY KEY,
  chat_id VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX idx_telegram_links_chat_id ON telegram_links(chat_id);
CREATE INDEX idx_telegram_links_user_id ON telegram_links(user_id);
```

### 4. Set Up Bot Commands
Message [@BotFather](https://t.me/BotFather) on Telegram:
1. `/mybots` → select your bot → `Edit Bot` → `Edit Commands`
2. Paste:
```
weekly - Get your weekly spending report
monthly - Get your monthly spending report
start - Link your Telegram account
help - Show available commands
```

### 5. Production Setup
For production, set up the webhook:
```bash
npm run setup:webhook
```

## Usage

### Development Mode
In development, the bot uses long polling (automatically handled).

### Production Mode
The bot uses webhooks for better performance and reliability.

## Features

### Commands
- `/start` - Link your Telegram account to your web app account
- `/weekly` - Get your weekly spending report
- `/monthly` - Get your monthly spending report
- `/help` - Show available commands

### Account Linking Flow
1. User logs into web app
2. User clicks "Connect Telegram" in settings
3. App generates a deep link: `https://t.me/YourBot?start=<token>`
4. User taps the link, bot links accounts
5. User can now use `/weekly` and `/monthly` commands

### Error Handling
- Invalid/expired tokens show helpful error messages
- Unlinked users are prompted to connect their account
- API errors are handled gracefully with user-friendly messages

## Implementation Details

### Architecture
- **ControllerReports**: Separates data logic from HTTP handling
- **TelegramLinkService**: Manages chatId ↔ userId mapping
- **Bot**: Handles Telegram commands and formatting
- **Formatters**: Formats reports for Telegram display

### Data Flow
1. User sends `/weekly` command
2. Bot checks if chat is linked to a user
3. If linked, calls `ControllerReports.getWeeklyReportData(userId)`
4. Formats the report for Telegram
5. Sends formatted response to user

### Security
- Tokens are one-time use (to be implemented)
- Chat IDs are stored securely in the database
- All user input is validated and sanitized

## Testing Checklist

- [ ] `/start <token>` correctly links accounts
- [ ] `/weekly` prompts to link if not connected
- [ ] `/weekly` returns formatted report after linking
- [ ] `/monthly` works similarly
- [ ] Error messages are user-friendly
- [ ] Webhook responds quickly in production
- [ ] Bot commands appear in Telegram menu

## Future Enhancements

- Rate limiting per chat ID
- Multi-account support (switch account command)
- More report formats (daily, yearly)
- Interactive report navigation