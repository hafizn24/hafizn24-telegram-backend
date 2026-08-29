# Telegram Backend Enhancement

This project has been enhanced to support monthly and weekly report messages based on user_id, with confirmation messages now including the extracted amount.

## Features

### 1. Confirmation Message Enhancement
- Fixed confirmation messages to include the extracted amount
- Format: `✅ Receipt processed successfully!\n\n🏪 **Merchant:** ${merchantName}\n💰 **Amount:** ${amount}`

### 2. On-Demand Reports
- **Weekly Reports**: `GET /api/reports/weekly/:userId` - Returns weekly report for the last 7 days
- **Monthly Reports**: `GET /api/reports/monthly/:userId` - Returns monthly report for the last 30 days

### 3. Automatic Scheduled Reports
- **Weekly Reports**: Sent every Sunday at 9 AM UTC
- **Monthly Reports**: Sent on the 1st of each month at 9 AM UTC

## API Endpoints

### Receipt Processing
- `POST /api/receipt/insert` - Process receipt images and PDFs

### Reports
- `GET /api/reports/weekly/:userId` - Get weekly report for a user
- `GET /api/reports/monthly/:userId` - Get monthly report for a user

## File Structure

```
netlify/
├── controllers/
│   ├── controller-receipt.ts      # Receipt processing controller
│   └── controller-reports.ts      # Report generation controller
├── services/
│   ├── service-receipt.ts        # Receipt + PDF processing service (images & PDFs -> webp)
│   └── service-reports.ts        # Report generation service
├── routes/
│   ├── route-receipt.ts          # Receipt API routes
│   └── route-reports.ts          # Report API routes
├── functions/
│   ├── api.ts                    # Main Express server
│   ├── reports-weekly.ts         # Weekly report scheduled function
│   └── reports-monthly.ts        # Monthly report scheduled function
└── supabase/
    └── supabase.ts               # Supabase client configuration
```

## Testing

Run the test suite:
```bash
npm test
```

The tests cover:
- Report generation logic
- Controller error handling
- Edge cases (empty receipts, invalid user IDs)

## Database Schema

The application uses the following schema for receipts:

```typescript
{
  merchant_name: string;
  total_amount: number;
  image_url: string;
  user_id: number;
  created_at: string;
}
```

## Environment Variables

Required environment variables:
- `TELEGRAM_BOT_TOKEN`: Telegram bot token for sending messages
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

## Deployment

The application is configured for deployment on Netlify with:
- Serverless functions
- Cron scheduling for automatic reports
- CORS enabled for API access

## Error Handling

The application includes comprehensive error handling for:
- Database operations
- Telegram API calls
- File processing
- User validation

## Performance Considerations

- Uses Supabase for efficient data querying
- Implements proper error handling and logging
- Handles rate limiting for Telegram API
- Optimized for concurrent request processing