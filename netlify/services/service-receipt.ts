import sharp from 'sharp';
import { createRequire } from 'module';
import getSupabaseClient from '../supabase/supabase';

// Used to resolve the PDF.js worker file at runtime. The project compiles to
// CommonJS, so import.meta is unavailable here.
const requireNode = createRequire(__filename);

type ExtractedReceiptData = {
  merchantName: string;
  totalAmount: number | string;
};

/**
 * Pulls the Telegram file_id + mime type out of a webhook update
 * (document or photo). Returns null when the payload has no file.
 * Photos have no mime_type, so they default to image/jpeg.
 */
export const getTelegramFileMeta = (body: any): { fileId: string; mimeType: string } | null => {
  const document = body?.message?.document;
  if (document?.file_id) {
    return { fileId: document.file_id, mimeType: document.mime_type || 'application/octet-stream' };
  }

  const photo = Array.isArray(body?.message?.photo) ? body.message.photo : null;
  if (photo && photo.length) {
    const last = photo[photo.length - 1];
    if (last?.file_id) {
      return { fileId: last.file_id, mimeType: 'image/jpeg' };
    }
  }

  return null;
};

/**
 * Resolves a Telegram file_id via getFile and downloads the raw bytes.
 * Shared by both the image and PDF paths.
 */
export const downloadTelegramFile = async (fileId: string): Promise<Buffer> => {
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
  return Buffer.from(arrayBuffer);
};

// Telegram file_ids can contain characters that are illegal/invalid as object
// keys (notably '/', '+', '='), which would otherwise create unintended path
// segments or collisions in the storage bucket. Sanitize them to a safe,
// still-deterministic form (same file_id -> same sanitized string).
const sanitizeStorageId = (id: string): string =>
  id.replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');

export const compressImageToWebp = async (imageBuffer: Buffer, deterministicId?: string) => {
  const webpBuffer = await sharp(imageBuffer)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  // If we were given a Telegram file_id, use it to build the filename so
  // reprocessing the exact same Telegram photo (e.g. a retried webhook)
  // overwrites the same object in the bucket instead of creating a new
  // duplicate file every time. Falls back to the old random name when no
  // id is available (e.g. uploads coming from the web app).
  const fileName = deterministicId
    ? `receipt-${sanitizeStorageId(deterministicId)}.webp`
    : `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

  return {
    buffer: webpBuffer,
    fileName
  };
};

// We pin the official PDF.js build (legacy) via unpdf. It relies on
// Promise.withResolvers / DOMMatrix at module load, which require Node >= 22
// (see node_version = "22" in netlify.toml). This only needs to be done once
// per process.
let pdfjsReady = false;
const ensurePdfJs = async () => {
  if (pdfjsReady) return;
  const { definePDFJSModule, setWorker } = await import('unpdf');
  // pdfjs-dist must be external (see netlify.toml) so this file is actually
  // present in the deployed bundle; otherwise PDF.js can't set up its
  // in-thread ("fake") worker and receipt processing fails with
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
  const workerSrc = requireNode.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  if (typeof setWorker === 'function') {
    setWorker(workerSrc);
  }
  await definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs'), { workerSrc });
  pdfjsReady = true;
};

/**
 * Rasterizes the FIRST page of a PDF to a webp image.
 * Uses pdfjs-dist (via unpdf) with @napi-rs/canvas as the rendering backend,
 * which ships prebuilt binaries and needs no system poppler/ghostscript —
 * so it works in serverless (Netlify Lambda). PDFs that can't be parsed
 * (e.g. encrypted/password protected) will throw and surface as an error.
 */
export const convertPdfToWebp = async (pdfBuffer: Buffer, deterministicId?: string) => {
  await ensurePdfJs();
  const { renderPageAsImage } = await import('unpdf');

  const image = await renderPageAsImage(new Uint8Array(pdfBuffer), 1, {
    canvasImport: () => import('@napi-rs/canvas'),
    scale: 2
  });

  // renderPageAsImage returns an ArrayBuffer (toDataURL is not set). Guard
  // against the string (data URL) branch so we never silently feed garbage
  // into sharp.
  if (typeof image === 'string') {
    throw Error('renderPageAsImage returned a data URL; expected an ArrayBuffer.');
  }

  const webpBuffer = await sharp(Buffer.from(image))
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const fileName = deterministicId
    ? `receipt-${sanitizeStorageId(deterministicId)}.webp`
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

/**
 * Extracts receipt metadata from an image URL using a multimodal AI model.
 * Both image and PDF inputs are now stored as webp images, so the AI always
 * receives an image_url (the old markdown/text branch has been removed).
 */
export const extractReceiptData = async (
  contentUrl?: string | null,
  imageBase64?: string | null
) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const apiUrl = process.env.OPENROUTER_API_URL;
  const model = process.env.OPENROUTER_MODEL;

  // Prefer an inline base64 image so extraction never depends on the AI
  // service being able to fetch a public Supabase URL (e.g. when the bucket
  // is private). Fall back to the public URL when base64 isn't supplied.
  const imageUrl = imageBase64
    ? `data:image/webp;base64,${imageBase64}`
    : contentUrl || undefined;

  if (!apiKey || !apiUrl || !model || !imageUrl) {
    return fallbackReceiptData();
  }

  const prompt = [
    'You are a finance assistant analyzing a receipt image.',
    'Extract the receipt information from the image and return valid JSON only.',
    'Required keys: merchantName, totalAmount.',
    'Use null for text values that are not visible and 0 for monetary values that are not visible.',
    'Do not wrap the response in markdown fences or extra commentary.',
    'Return exactly one JSON object with the keys merchantName and totalAmount.'
  ].join('\n');

  const userContent = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: imageUrl } }
  ];

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
