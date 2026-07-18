import sharp from 'sharp';
import supabase from '../supabase/supabase';

type ReceiptPayload = {
  imageBase64?: string;
  merchantName?: string;
  totalAmount?: number | string;
  currency?: string;
  notes?: string;
  source?: string;
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
  const bucket = process.env.SUPABASE_BUCKET || '';

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

const extractMessageText = (message: { content?: string; reasoning_content?: string }): string => {
  return message.content || message.reasoning_content || '';
};

const fallbackReceiptData = (error: string) => ({
  success: false,
  error,
  data: null
});

const parseExtractedReceiptData = (content: string) => {
  if (!content || content.includes('AI summary unavailable')) {
    return fallbackReceiptData('AI summary unavailable: empty AI response');
  }

  return {
    success: true,
    error: null,
    data: {
      ai_summary: content.trim()
    }
  };
};

export const generateReceiptSummary = async (payload: ReceiptPayload, imageUrl?: string | null) => {
  const apiKey = process.env.ZAI_API_KEY;
  const apiUrl = process.env.ZAI_API_URL;
  const model = process.env.ZAI_MODEL;

  if (!apiKey || !apiUrl || !model) {
    return 'AI summary unavailable: required environment variables are not configured.';
  }

  if (!imageUrl) {
    return fallbackReceiptData('AI summary unavailable: no image URL was provided to the AI service.');
  }

  const prompt = [
    'You are a finance assistant. Summarize the receipt in a short, useful way.',
    `Merchant: ${payload.merchantName || 'Unknown'}`,
    `Total: ${payload.totalAmount || 'Unknown'}`,
    `Currency: ${payload.currency || 'MYR'}`,
    `Notes: ${payload.notes || 'No additional notes'}`,
    `Image URL: ${imageUrl || 'Not uploaded'}`
  ].join('\\n');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'system',
          content: 'You summarize receipts clearly and concisely.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    return 'AI summary unavailable: the AI service returned an error.';
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } } & { finish_reason?: string }>;
  };

  let content = extractMessageText(data.choices?.[0]?.message || {});

  if (!content.trim()) {
    content = extractMessageText(data.choices?.[0]?.message || {});
  }

  if (!content) {
  console.error('AI response failed:', {
    finish_reason: (data as any).finish_reason || (data.choices?.[0] as any)?.finish_reason,
    raw_data: data
  });
    return 'AI summary unavailable: empty AI response.';
  }

  return parseExtractedReceiptData(content).data?.ai_summary || 'AI summary unavailable.';
};