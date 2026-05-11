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

  const exp = (req.query.exp || '').trim();
  if (!exp) {
    return res.status(400).json({ error: 'missing_param', message: 'ต้องระบุ ?exp=<expansion_id>' });
  }

  try {
    const q = `expansion.id:${exp}`;
    const url = `${SCRYDEX_BASE}/ja/cards?q=${encodeURIComponent(q)}&page_size=250`;

    const upstream = await fetch(url, {
      headers: {
        'X-Api-Key': apiKey,
        'X-Team-ID': teamId,
        'Accept': 'application/json'
      }
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(upstream.status).json({
        error: 'upstream_error',
        status: upstream.status,
        message: body.slice(0, 500)
      });
    }

    const json = await upstream.json();
    const list = Array.isArray(json) ? json : (json.data || []);

    list.sort((a, b) => {
      const na = parseInt(a.number, 10) || 0;
      const nb = parseInt(b.number, 10) || 0;
      return na - nb;
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ data: list, count: list.length });
  } catch (err) {
    return res.status(500).json({ error: 'fetch_failed', message: err.message });
  }
}
