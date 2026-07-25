import getSupabaseClient from '../supabase/supabase';

/**
 * Interface for receipt data
 */
interface ReceiptData {
  merchant_name: string;
  total_amount: number;
  created_at: string;
}

/**
 * Interface for report data
 */
interface ReportData {
  merchant: string;
  amount: number;
}

/**
 * Fetch receipts for a specific user and date range
 */
const getUserReceipts = async (userId: number, startDate: string, endDate: string): Promise<ReceiptData[]> => {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('receipts')
    .select('merchant_name, total_amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching receipts:', error);
    throw new Error(`Failed to fetch receipts: ${error.message}`);
  }
  
  return data || [];
};

/**
 * Generate weekly report for a user
 */
const generateWeeklyReport = async (userId: number): Promise<string> => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 7);
  
  const receipts = await getUserReceipts(userId, startDate.toISOString(), endDate.toISOString());
  
  if (receipts.length === 0) {
    return '📊 No receipts found in the last 7 days.';
  }
  
  const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
  
  let message = `📊 *Weekly Report (Last 7 Days)*\n\n`;
  message += `💰 *Total Spent:* ${totalAmount.toFixed(2)}\n\n`;
  message += `📋 *Transactions:*\n`;
  
  receipts.forEach((receipt, index) => {
    const date = new Date(receipt.created_at).toLocaleDateString();
    message += `${index + 1}. 🏪 ${receipt.merchant_name} - 💰 ${receipt.total_amount.toFixed(2)} (${date})\n`;
  });
  
  return message;
};

/**
 * Generate monthly report for a user
 */
const generateMonthlyReport = async (userId: number): Promise<string> => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);
  
  const receipts = await getUserReceipts(userId, startDate.toISOString(), endDate.toISOString());
  
  if (receipts.length === 0) {
    return '📊 No receipts found in the last 30 days.';
  }
  
  const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
  
  let message = `📊 *Monthly Report (Last 30 Days)*\n\n`;
  message += `💰 *Total Spent:* ${totalAmount.toFixed(2)}\n\n`;
  message += `📋 *Transactions:*\n`;
  
  receipts.forEach((receipt, index) => {
    const date = new Date(receipt.created_at).toLocaleDateString();
    message += `${index + 1}. 🏪 ${receipt.merchant_name} - 💰 ${receipt.total_amount.toFixed(2)} (${date})\n`;
  });
  
  return message;
};

/**
 * Get all users with receipts in the database
 */
const getAllUsersWithReceipts = async (): Promise<number[]> => {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('receipts')
    .select('user_id')
    .distinct();
  
  if (error) {
    console.error('Error fetching users:', error);
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
  
  return data?.map(user => user.user_id) || [];
};

export {
  getUserReceipts,
  generateWeeklyReport,
  generateMonthlyReport,
  getAllUsersWithReceipts,
  type ReceiptData,
  type ReportData
};