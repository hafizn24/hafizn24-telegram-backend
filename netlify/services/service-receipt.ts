import sharp from 'sharp';
import getSupabaseClient from '../supabase/supabase';

type ReceiptPayload = {
  imageBase64?: string;
  source?: string;
};

type ExtractedReceiptData = {
  merchantName: string;
  totalAmount: number | string;
  currency: string;
  notes: string;
  summary: string;
};

/**
 * Telegram doesn't send image bytes in the webhook payload — only a file_id.
 * This pulls the file_id out of a Telegram update (document or photo),
 * resolves it via getFile, downloads the bytes, and returns a base64 data URL.
 * Returns null if the payload isn't a Telegram update / has no file.
 */
export const getImageBase64FromTelegramUpdate = async (body: any): Promise<string | null> => {
  const fileId: string | undefined =
    body?.message?.document?.file_id ||
    (Array.isArray(body?.message?.photo) ? body.message.photo[body.message.photo.length - 1]?.file_id : undefined);

  if (!fileId) {
    return null;
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable.');
  }

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

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
  const fileRes = await fetch(fileUrl);

  if (!fileRes.ok) {
    throw new Error(`Failed to download Telegram file, status ${fileRes.status}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = body?.message?.document?.mime_type || 'image/png';

  return `data:${mimeType};base64,${base64}`;
};

export const compressImageToWebp = async (imageBase64: string) => {
  const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
  const inputBuffer = Buffer.from(base64Data, 'base64');

  const webpBuffer = await sharp(inputBuffer)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const fileName = `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

  return {
    buffer: webpBuffer,
    fileName
  };
};

export const uploadReceiptImage = async (buffer: Buffer, fileName: string) => {
  const bucket = process.env.SUPABASE_BUCKET;
  if (!bucket) {
    throw new Error('Missing SUPABASE_BUCKET environment variable. Add it to your .env file.');
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
            : 0,
      currency: typeof parsed.currency === 'string'
        ? parsed.currency
        : typeof parsed.currencyCode === 'string'
          ? parsed.currencyCode
          : 'MYR',
      notes: typeof parsed.notes === 'string'
        ? parsed.notes
        : typeof parsed.note === 'string'
          ? parsed.note
          : '',
      summary: typeof parsed.summary === 'string'
        ? parsed.summary
        : typeof parsed.aiSummary === 'string'
          ? parsed.aiSummary
          : typeof parsed.description === 'string'
            ? parsed.description
            : 'AI summary unavailable.'
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
                : 0,
          currency: typeof parsed.currency === 'string'
            ? parsed.currency
            : typeof parsed.currencyCode === 'string'
              ? parsed.currencyCode
              : 'MYR',
          notes: typeof parsed.notes === 'string'
            ? parsed.notes
            : typeof parsed.note === 'string'
              ? parsed.note
              : '',
          summary: typeof parsed.summary === 'string'
            ? parsed.summary
            : typeof parsed.aiSummary === 'string'
              ? parsed.aiSummary
              : typeof parsed.description === 'string'
                ? parsed.description
                : trimmedContent || 'AI summary unavailable.'
        };
      } catch (fallbackError) {
        console.error('parseExtractedReceiptData: fallback JSON parse error', fallbackError, cleanedContent);
      }
    }

    return {
      merchantName: 'Unknown',
      totalAmount: 0,
      currency: 'MYR',
      notes: '',
      summary: trimmedContent || 'AI summary unavailable.'
    };
  }
};

const fallbackReceiptData = (summary: string): ExtractedReceiptData => ({
  merchantName: 'Unknown',
  totalAmount: 0,
  currency: 'MYR',
  notes: '',
  summary
});

export const extractReceiptData = async (imageUrl?: string | null) => {
  const apiKey = process.env.ZAI_API_KEY;
  const apiUrl = process.env.ZAI_API_URL;
  const model = process.env.ZAI_MODEL;

  if (!apiKey) {
    return fallbackReceiptData('AI summary unavailable: ZAI_API_KEY is not configured.');
  }

  if (!apiUrl) {
    return fallbackReceiptData('AI summary unavailable: ZAI_API_URL is not configured.');
  }

  if (!model) {
    return fallbackReceiptData('AI summary unavailable: ZAI_MODEL is not configured.');
  }

  const prompt = [
    'You are a finance assistant analyzing a receipt image.',
    'Extract the receipt information from the image and return valid JSON only.',
    'Required keys: merchantName, totalAmount, currency, notes, summary.',
    'Use null for text values that are not visible and 0 for monetary values that are not visible.',
    'Do not wrap the response in markdown fences or extra commentary.',
    'Return exactly one JSON object with the keys merchantName, totalAmount, currency, notes, and summary.'
  ].join('\n');

  const userMessage = imageUrl
    ? `${prompt}\nImage URL: ${imageUrl}`
    : prompt;

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
            content: 'You extract receipt metadata from images and return structured JSON.'
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.2
      })
    });
  } catch (err) {
    console.error('extractReceiptData: network error calling AI service', err);
    return fallbackReceiptData('AI summary unavailable: could not reach the AI service.');
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`extractReceiptData: AI service returned ${response.status}`, errorBody);
    return fallbackReceiptData('AI summary unavailable: the AI service returned an error.');
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const messageContent = data.choices?.[0]?.message?.content;
  const content = extractMessageText(messageContent).trim();

  if (!content) {
    console.error('extractReceiptData: empty AI response', JSON.stringify(data));
    return fallbackReceiptData('AI summary unavailable: empty AI response.');
  }

  return parseExtractedReceiptData(content);
};