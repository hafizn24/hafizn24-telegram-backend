/**
 * Format report data for Telegram display
 * These functions should match the data shape returned by getWeeklyReportData/getMonthlyReportData
 */

/**
 * Format weekly report for Telegram
 */
export const formatWeeklyReport = (report: string): string => {
  // The report is already formatted as a Markdown string from service-reports.ts
  // We just need to ensure it's properly escaped for Telegram
  return report;
};

/**
 * Format monthly report for Telegram
 */
export const formatMonthlyReport = (report: string): string => {
  // The report is already formatted as a Markdown string from service-reports.ts
  // We just need to ensure it's properly escaped for Telegram
  return report;
};

/**
 * Helper function to escape special characters for Telegram Markdown V2
 * This is more comprehensive than the V1 version used elsewhere
 */
export const escapeMarkdownV2 = (text: string): string => {
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
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