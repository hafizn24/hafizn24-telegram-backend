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

export const generateReceiptSummary = async (payload: ReceiptPayload, imageUrl?: string | null) => {
  const apiKey = process.env.ZAI_API_KEY;

  if (!apiKey) {
    return 'AI summary unavailable: ZAI_API_KEY is not configured.';
  }

  const prompt = [
    'You are a finance assistant. Summarize the receipt in a short, useful way.',
    `Merchant: ${payload.merchantName || 'Unknown'}`,
    `Total: ${payload.totalAmount || 'Unknown'}`,
    `Currency: ${payload.currency || 'MYR'}`,
    `Notes: ${payload.notes || 'No additional notes'}`,
    `Image URL: ${imageUrl || 'Not uploaded'}`
  ].join('\\n');

  const response = await fetch(process.env.ZAI_API_URL || '', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.ZAI_MODEL || '',
      messages: [
        {
          role: 'system',
          content: 'You summarize receipts clearly and concisely.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    return 'AI summary unavailable: the AI service returned an error.';
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  return content || 'AI summary unavailable.';
};