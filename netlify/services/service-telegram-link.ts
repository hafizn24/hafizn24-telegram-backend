import getSupabaseClient from '../supabase/supabase';

/**
 * Interface for telegram_links table
 */
interface TelegramLink {
  id: number;
  chat_id: string;
  user_id: number;
  linked_at: string;
}

/**
 * Get user ID by chat ID
 */
const getUserIdByChatId = async (chatId: string): Promise<number | null> => {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('telegram_links')
    .select('user_id')
    .eq('chat_id', chatId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No record found
      return null;
    }
    console.error('Error fetching telegram link:', error);
    throw new Error(`Failed to fetch telegram link: ${error.message}`);
  }
  
  return data?.user_id || null;
};

/**
 * Link chat ID to user ID (UPSERT operation)
 */
const linkChatToUser = async (chatId: string, userId: number): Promise<void> => {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('telegram_links')
    .upsert({
      chat_id: chatId,
      user_id: userId,
      linked_at: new Date().toISOString()
    }, {
      onConflict: 'chat_id'
    });
  
  if (error) {
    console.error('Error creating/updating telegram link:', error);
    throw new Error(`Failed to create/update telegram link: ${error.message}`);
  }
};

/**
 * Resolve token to get user ID (for deep linking)
 * This involves looking up and deleting a temporary token in an atomic operation
 * Tokens are one-time use and automatically expire after 24 hours
 */
const resolveToken = async (token: string): Promise<number> => {
  const supabase = getSupabaseClient();
  
  // Atomically fetch and delete the token to prevent race conditions
  const { data, error } = await supabase
    .from('telegram_tokens')
    .delete()
    .eq('token', token)
    .select('user_id, created_at')
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No record found - invalid or already used token
      throw new Error('Invalid or expired token. Please generate a new connection link.');
    }
    console.error('Error resolving token:', error);
    throw new Error(`Failed to resolve token: ${error.message}`);
  }
  
  // Check if token is expired (24 hours)
  const tokenAge = Date.now() - new Date(data.created_at).getTime();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  if (tokenAge > maxAge) {
    throw new Error('Token expired. Please generate a new connection link.');
  }
  
  return data.user_id;
};

/**
 * Check if a chat is already linked to a user
 */
const isChatLinked = async (chatId: string): Promise<boolean> => {
  const userId = await getUserIdByChatId(chatId);
  return userId !== null;
};

/**
 * Get all linked chat IDs
 */
const getAllLinkedChats = async (): Promise<string[]> => {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('telegram_links')
    .select('chat_id');
  
  if (error) {
    console.error('Error fetching linked chats:', error);
    throw new Error(`Failed to fetch linked chats: ${error.message}`);
  }
  
  return data?.map(link => link.chat_id) || [];
};

/**
 * Unlink a chat from a user
 */
const unlinkChat = async (chatId: string): Promise<void> => {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('telegram_links')
    .delete()
    .eq('chat_id', chatId);
  
  if (error) {
    console.error('Error unlinking chat:', error);
    throw new Error(`Failed to unlink chat: ${error.message}`);
  }
};

export {
  getUserIdByChatId,
  linkChatToUser,
  resolveToken,
  isChatLinked,
  getAllLinkedChats,
  unlinkChat,
  type TelegramLink
};