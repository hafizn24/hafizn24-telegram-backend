import sharp from 'sharp';
import getSupabaseClient from '../supabase/supabase';

type ReceiptPayload = {
  imageBase64?: string;
};

type ExtractedReceiptData = {
  merchantName: string;
  totalAmount: number | string;
};

/**
 * Telegram doesn't send image bytes in the webhook payload — only a file_id.
 * This pulls the file_id out of a Telegram update (document or photo),
 * resolves it via getFile, downloads the bytes, and returns a base64 data URL.
 * Returns null if the payload isn't a Telegram update / has no file.
 */
export const getImageBase64FromTelegramUpdate = async (
  body: any
): Promise<{ base64: string; fileId: string } | null> => {
  const fileId: string | undefined =
    body?.message?.document?.file_id ||
    (Array.isArray(body?.message?.photo) ? body.message.photo[body.message.photo.length - 1]?.file_id : undefined);

  if (!fileId) {
    return null;
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    throw Error('Missing TELEGRAM_BOT_TOKEN environment variable.');
  }

  const getFileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  );

  if (!getFileRes.ok) {
    throw Error(`Telegram getFile failed with status ${getFileRes.status}`);
  }

  const fileData = await getFileRes.json() as { ok: boolean; result?: { file_path?: string } };

  if (!fileData.ok || !fileData.result?.file_path) {
    throw Error('Telegram getFile did not return a file_path.');
  }

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
  const fileRes = await fetch(fileUrl);

  if (!fileRes.ok) {
    throw Error(`Failed to download Telegram file, status ${fileRes.status}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = body?.message?.document?.mime_type || 'image/png';

  return { base64: `data:${mimeType};base64,${base64}`, fileId };
};

/**
 * Checks if the Telegram update contains a PDF file
 */
export const isPdfDocument = (body: any): boolean => {
  return body?.message?.document?.mime_type === 'application/pdf';
};

/**
 * Extracts PDF file ID from Telegram update
 */
export const getPdfFileId = (body: any): string | undefined => {
  return body?.message?.document?.file_id;
};

export const compressImageToWebp = async (imageBase64: string, deterministicId?: string) => {
  const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
  const inputBuffer = Buffer.from(base64Data, 'base64');

  const webpBuffer = await sharp(inputBuffer)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  // If we were given a Telegram file_id, use it to build the filename so
  // reprocessing the exact same Telegram photo (e.g. a retried webhook)
  // overwrites the same object in the bucket instead of creating a new
  // duplicate file every time. Falls back to the old random name when no
  // id is available (e.g. uploads coming from the web app).
  const fileName = deterministicId
    ? `receipt-${deterministicId}.webp`
    : `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

  return {
    buffer: webpBuffer,
    fileName
  };
};

export const uploadReceiptImage = async (buffer: Buffer, fileName: string) => {
  const bucket = process.env.SUPABASE_BUCKET;
  if (!bucket) {
    throw Error('Missing SUPABASE_BUCKET environment variable. Add it to your .env file.');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(fileName, buffer, {
    contentType: 'image/webp',
    upsert: true
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);

  return {
    fileName,
    publicUrl: data.publicUrl
  };
};

const extractMessageText = (messageContent: unknown): string => {
  if (typeof messageContent === 'string') {
    return messageContent;
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => extractMessageText(item))
      .filter(Boolean)
      .join('\n');
  }
  if (messageContent && typeof messageContent === 'object') {
    const asRecord = messageContent as Record<string, unknown>;
    if (typeof asRecord.text === 'string') {
      return asRecord.text;
    }
    return Object.values(asRecord)
      .map((value) => extractMessageText(value))
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const parseExtractedReceiptData = (content: string): ExtractedReceiptData => {
  const trimmedContent = content.trim();
  const cleanedContent = trimmedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || trimmedContent;

  try {
    const parsed = JSON.parse(cleanedContent) as Record<string, unknown>;

return {
      merchantName: typeof parsed.merchantName === 'string'
        ? parsed.merchantName
        : typeof parsed.merchant === 'string'
          ? parsed.merchant
          : typeof parsed.vendor === 'string'
            ? parsed.vendor
            : 'Unknown',
      totalAmount: typeof parsed.totalAmount === 'number' || typeof parsed.totalAmount === 'string'
        ? parsed.totalAmount
        : typeof parsed.total === 'number' || typeof parsed.total === 'string'
          ? parsed.total
          : typeof parsed.amount === 'number' || typeof parsed.amount === 'string'
            ? parsed.amount
            : 0
    };
  } catch (error) {
    const fallbackJson = cleanedContent.match(/\{[\s\S]*\}/);
    if (fallbackJson) {
      try {
        const parsed = JSON.parse(fallbackJson[0]) as Record<string, unknown>;
return {
        merchantName: typeof parsed.merchantName === 'string'
          ? parsed.merchantName
          : typeof parsed.merchant === 'string'
            ? parsed.merchant
            : typeof parsed.vendor === 'string'
              ? parsed.vendor
              : 'Unknown',
        totalAmount: typeof parsed.totalAmount === 'number' || typeof parsed.totalAmount === 'string'
          ? parsed.totalAmount
          : typeof parsed.total === 'number' || typeof parsed.total === 'string'
            ? parsed.total
            : typeof parsed.amount === 'number' || typeof parsed.amount === 'string'
              ? parsed.amount
              : 0
        };
      } catch (fallbackError) {
        console.error('parseExtractedReceiptData: fallback JSON parse error', fallbackError, cleanedContent);
      }
    }

    return {
      merchantName: 'Unknown',
      totalAmount: 0
    };
  }
};

const fallbackReceiptData = (): ExtractedReceiptData => ({
  merchantName: 'Unknown',
  totalAmount: 0
});

export const extractReceiptData = async (contentUrl?: string | null, contentType: 'image' | 'pdf' = 'image') => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const apiUrl = process.env.OPENROUTER_API_URL;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey) {
    return fallbackReceiptData();
  }

  if (!apiUrl) {
    return fallbackReceiptData();
  }

  if (!model) {
    return fallbackReceiptData();
  }

  if (!contentUrl) {
    return fallbackReceiptData();
  }

  let prompt: string;
  let userContent: any;

  if (contentType === 'pdf') {
    // For PDF content, send the markdown text directly
    prompt = [
      'You are a finance assistant analyzing a receipt document (PDF converted to text).',
      'Extract the receipt information from the text content and return valid JSON only.',
      'Required keys: merchantName, totalAmount.',
      'Use null for text values that are not visible and 0 for monetary values that are not visible.',
      'Do not wrap the response in markdown fences or extra commentary.',
      'Return exactly one JSON object with the keys merchantName and totalAmount.'
    ].join('\n');

    // Fetch the markdown content
    const markdownResponse = await fetch(contentUrl!);
    const markdownText = await markdownResponse.text();
    
    userContent = [
      { type: 'text', text: prompt },
      { type: 'text', text: `\n\nReceipt Content:\n${markdownText}` }
    ];
  } else {
    // For image content, use the existing multimodal approach
    prompt = [
      'You are a finance assistant analyzing a receipt image.',
      'Extract the receipt information from the image and return valid JSON only.',
      'Required keys: merchantName, totalAmount.',
      'Use null for text values that are not visible and 0 for monetary values that are not visible.',
      'Do not wrap the response in markdown fences or extra commentary.',
      'Return exactly one JSON object with the keys merchantName and totalAmount.'
    ].join('\n');

    userContent = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: contentUrl! } }
    ];
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: contentType === 'pdf' 
              ? 'You extract receipt metadata from text documents and return structured JSON.'
              : 'You extract receipt metadata from images and return structured JSON.'
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        temperature: 0.2,
        max_tokens: 1024,
        thinking: { type: 'disabled' }
      })
    });
  } catch (err) {
    console.error('extractReceiptData: network error calling AI service', err);
    return fallbackReceiptData();
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`extractReceiptData: AI service returned ${response.status}`, errorBody);
    return fallbackReceiptData();
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: unknown };
      finish_reason?: string;
    }>;
  };

  const messageContent = data.choices?.[0]?.message?.content;
  let extractedContent = extractMessageText(messageContent).trim();

  // Fallback: some GLM responses still put text in reasoning_content even with
  // thinking disabled, or truncate content if max_tokens is hit mid-thought.
  if (!extractedContent) {
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content;
    extractedContent = extractMessageText(reasoningContent).trim();
  }

  if (!extractedContent) {
    console.error(
      'extractReceiptData: empty AI response',
      JSON.stringify({ finishReason: data.choices?.[0]?.finish_reason, data })
    );
    return fallbackReceiptData();
  }

  return parseExtractedReceiptData(extractedContent);
};