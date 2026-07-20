import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import getSupabaseClient from '../supabase/supabase';

/**
 * Downloads a PDF file from Telegram and saves it locally
 */
export const downloadPdfFromTelegram = async (fileId: string): Promise<string> => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable.');
  }

  // Get file path from Telegram
  const getFileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  );

  if (!getFileRes.ok) {
    throw new Error(`Telegram getFile failed with status ${getFileRes.status}`);
  }

  const fileData = await getFileRes.json() as { ok: boolean; result?: { file_path?: string } };

  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error('Telegram getFile did not return a file_path.');
  }

  // Download the file
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
  const fileRes = await fetch(fileUrl);

  if (!fileRes.ok) {
    throw new Error(`Failed to download Telegram file, status ${fileRes.status}`);
  }

  // Save file locally
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const filePath = path.join(tempDir, fileName);
  const arrayBuffer = await fileRes.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

  return filePath;
};

/**
 * Converts PDF text to Markdown format
 */
export const convertPdfToMarkdown = async (pdfPath: string): Promise<string> => {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(pdfBuffer);
    
    // Convert extracted text to markdown format
    let markdownContent = data.text;
    
    // Add page markers if we can detect page breaks
    const pages = markdownContent.split('\f'); // Form feed character often indicates page breaks
    if (pages.length > 1) {
      markdownContent = pages.map((page, index) => `## Page ${index + 1}\n\n${page.trim()}`).join('\n\n---\n\n');
    }

    return markdownContent.trim();
  } catch (error) {
    throw new Error(`Failed to convert PDF to Markdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Uploads Markdown content to Supabase storage
 */
export const uploadMarkdownToStorage = async (markdownContent: string): Promise<string> => {
  const bucket = process.env.SUPABASE_BUCKET;
  if (!bucket) {
    throw new Error('Missing SUPABASE_BUCKET environment variable.');
  }

  const fileName = `receipt-md-${Date.now()}-${Math.random().toString(36).slice(2)}.md`;
  const supabase = getSupabaseClient();

  // Upload markdown content
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, Buffer.from(markdownContent), {
      contentType: 'text/markdown',
      upsert: true
    });

  if (error) {
    throw error;
  }

  // Get public URL
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
};

/**
 * Processes a PDF file from Telegram and returns Markdown content URL
 */
export const processPdfFromTelegram = async (fileId: string): Promise<{ markdownUrl: string; tempFilePath: string }> => {
  try {
    // Download PDF
    const tempFilePath = await downloadPdfFromTelegram(fileId);
    
    // Convert to Markdown
    const markdownContent = await convertPdfToMarkdown(tempFilePath);
    
    // Upload to storage
    const markdownUrl = await uploadMarkdownToStorage(markdownContent);
    
    return { markdownUrl, tempFilePath };
  } catch (error) {
    throw error;
  }
};

/**
 * Cleanup temporary files
 */
export const cleanupTempFiles = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup temporary file:', error);
  }
};