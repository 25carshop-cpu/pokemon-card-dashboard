// Vercel function to OCR a card image via Google Cloud Vision API.
// Frontend posts { image: <base64 string with or without data: prefix> }.
// Returns { fullText, words[] } from Vision's TEXT_DETECTION feature.

export const config = {
  api: {
    bodyParser: { sizeLimit: '6mb' },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST' });
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'missing_credentials',
      message: 'ตั้งค่า GOOGLE_VISION_API_KEY ใน Vercel Environment Variables (เปิด Cloud Vision API ใน Google Cloud Console)',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const image = body?.image;
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'missing_image', message: 'Body must contain { image: <base64> }' });
  }

  const cleanImage = image.replace(/^data:image\/\w+;base64,/, '');

  try {
    const upstream = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: cleanImage },
            features: [{ type: 'TEXT_DETECTION', maxResults: 50 }],
          }],
        }),
      }
    );

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({
        error: 'vision_error',
        status: upstream.status,
        message: text.slice(0, 600),
      });
    }

    const json = await upstream.json();
    const ann = json?.responses?.[0]?.textAnnotations || [];
    const errMsg = json?.responses?.[0]?.error?.message;
    if (errMsg) {
      return res.status(400).json({ error: 'vision_response_error', message: errMsg });
    }
    const fullText = ann[0]?.description || '';
    const words = ann.slice(1).map(a => a.description).filter(Boolean);

    return res.status(200).json({ fullText, words });
  } catch (err) {
    return res.status(500).json({ error: 'fetch_failed', message: err.message });
  }
}
