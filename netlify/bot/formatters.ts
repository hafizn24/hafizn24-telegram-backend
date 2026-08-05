/**
 * Format report data for Telegram display
 * These functions should match the data shape returned by getWeeklyReportData/getMonthlyReportData
 */

/**
 * Format weekly report for Telegram
 */
export const formatWeeklyReport = (report: string): string => {
  // The report is already formatted as a Markdown string from service-reports.ts
  // We apply Markdown V2 escaping to prevent parsing errors with special characters
  return escapeMarkdownV2(report);
};

/**
 * Format monthly report for Telegram
 */
export const formatMonthlyReport = (report: string): string => {
  // The report is already formatted as a Markdown string from service-reports.ts
  // We apply Markdown V2 escaping to prevent parsing errors with special characters
  return escapeMarkdownV2(report);
};

/**
 * Helper function to escape special characters for Telegram Markdown V2
 * Escapes all special characters according to Telegram's Markdown V2 spec
 */
export const escapeMarkdownV2 = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\') // Backslash (must be first)
    .replace(/_/g, '\\_')  // Underscore
    .replace(/\*/g, '\\*')  // Asterisk
    .replace(/\`/g, '\\`')  // Backtick
    .replace(/\[/g, '\\[')  // Opening bracket
    .replace(/\]/g, '\\]')  // Closing bracket
    .replace(/\(/g, '\\(')  // Opening parenthesis
    .replace(/\)/g, '\\)')  // Closing parenthesis
    .replace(/~/g, '\\~')   // Tilde
    .replace(>/g, '\\>')   // Greater than
    .replace(/#/g, '\\#')   // Hash
    .replace(/\+/g, '\\+')  // Plus
    .replace(/-/g, '\\-')   // Minus
    .replace(/=/g, '\\=')   // Equals
    .replace(/\|/g, '\\|')  // Pipe
    .replace(/\{/g, '\\{')  // Opening brace
    .replace(/\}/g, '\\}')  // Closing brace
    .replace(/\./g, '\\.')  // Period
    .replace(/!/g, '\\!');  // Exclamation mark
};

/**
 * Format error messages for Telegram
 */
export const formatErrorMessage = (error: string): string => {
  return `⚠️ *Error*: ${escapeMarkdownV2(error)}`;
};

/**
 * Format success messages for Telegram
 */
export const formatSuccessMessage = (message: string): string => {
  return `✅ *Success*: ${escapeMarkdownV2(message)}`;
};
