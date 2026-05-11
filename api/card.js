const SCRYDEX_BASE = 'https://api.scrydex.com/pokemon/v1';

export default async function handler(req, res) {
  const apiKey = process.env.SCRYDEX_API_KEY;
  const teamId = process.env.SCRYDEX_TEAM_ID;

  if (!apiKey || !teamId) {
    return res.status(500).json({
      error: 'missing_credentials',
      message: 'ตั้งค่า SCRYDEX_API_KEY และ SCRYDEX_TEAM_ID ใน Environment Variables ของ Vercel'
    });
  }

  const id = (req.query.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'missing_param', message: 'ต้องระบุ ?id=<card_id>' });
  }

  const headers = {
    'X-Api-Key': apiKey,
    'X-Team-ID': teamId,
    'Accept': 'application/json'
  };

  try {
    const cardUrl = `${SCRYDEX_BASE}/ja/cards/${encodeURIComponent(id)}`;
    const priceUrl = `${SCRYDEX_BASE}/price-history?card_id=${encodeURIComponent(id)}`;

    const [cardRes, priceRes] = await Promise.all([
      fetch(cardUrl, { headers }),
      fetch(priceUrl, { headers }).catch(() => null)
    ]);

    if (!cardRes.ok) {
      const body = await cardRes.text();
      return res.status(cardRes.status).json({
        error: 'upstream_error',
        status: cardRes.status,
        message: body.slice(0, 500)
      });
    }

    const cardJson = await cardRes.json();
    const card = cardJson.data || cardJson;

    let prices = null;
    if (priceRes && priceRes.ok) {
      const pj = await priceRes.json().catch(() => null);
      prices = pj?.data || pj || null;
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ card, prices });
  } catch (err) {
    return res.status(500).json({ error: 'fetch_failed', message: err.message });
  }
}
