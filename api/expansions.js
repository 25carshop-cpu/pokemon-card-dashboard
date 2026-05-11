const SCRYDEX_BASE = 'https://api.scrydex.com/pokemon/v1';
const YEAR_MIN = 2023;
const YEAR_MAX = 2026;

export default async function handler(req, res) {
  const apiKey = process.env.SCRYDEX_API_KEY;
  const teamId = process.env.SCRYDEX_TEAM_ID;

  if (!apiKey || !teamId) {
    return res.status(500).json({
      error: 'missing_credentials',
      message: 'ตั้งค่า SCRYDEX_API_KEY และ SCRYDEX_TEAM_ID ใน Environment Variables ของ Vercel'
    });
  }

  try {
    const url = `${SCRYDEX_BASE}/ja/expansions?page_size=250`;
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

    const filtered = list.filter(exp => {
      const dateStr = exp.release_date || exp.released_at || '';
      const year = parseInt(String(dateStr).slice(0, 4), 10);
      return year >= YEAR_MIN && year <= YEAR_MAX;
    });

    filtered.sort((a, b) => String(b.release_date || '').localeCompare(String(a.release_date || '')));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ data: filtered, count: filtered.length });
  } catch (err) {
    return res.status(500).json({ error: 'fetch_failed', message: err.message });
  }
}
