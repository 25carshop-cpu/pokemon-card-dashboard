// Fetch a single card page from scrydex.com and extract its price-history series
// for every grading company × variant combination.

const CHART_RE = /new Chartkick\["LineChart"\]\("([^"]+?)_([A-Za-z]+)_([a-z]+)_history",\s*(\[[\s\S]*?\]),\s*\{/g;
const META_BLOCK_RE = /<meta property="og:title" content="([^"]+)"/;

function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

function summarize(series) {
  // Pick last non-null value as current; first non-null as start; min/max over period
  const points = (series.data || []).filter(p => p && p[1] != null);
  if (!points.length) return null;
  const current = points[points.length - 1][1];
  const first = points[0][1];
  const values = points.map(p => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const change = first > 0 ? (current - first) / first : 0;
  return { current, first, min, max, change, count: points.length };
}

export default async function handler(req, res) {
  const id = (req.query?.id || '').toString().trim();
  const slug = (req.query?.slug || '-').toString().trim() || '-';
  const variant = (req.query?.variant || 'normal').toString().trim() || 'normal';
  if (!id) return res.status(400).json({ error: 'missing_id' });

  const url = `https://scrydex.com/pokemon/cards/${encodeURIComponent(slug)}/${encodeURIComponent(id)}?variant=${encodeURIComponent(variant)}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PokemonCardDashboard/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) {
      return res.status(r.status).json({ error: 'fetch_failed', status: r.status, url });
    }
    const html = await r.text();

    // Extract card name from og:title meta — format: "{Name} | Pokémon | Scrydex"
    let name = '';
    const titleMatch = META_BLOCK_RE.exec(html);
    if (titleMatch) {
      name = decodeHtmlEntities(titleMatch[1]).replace(/\s*\|\s*Pok[eé]mon\s*\|\s*Scrydex\s*$/, '').trim();
    }

    // Extract all chart series, grouped by variant → company
    const byVariantCompany = {};
    CHART_RE.lastIndex = 0;
    let m;
    while ((m = CHART_RE.exec(html)) !== null) {
      const [, , company, vrnt, jsonStr] = m;
      let series;
      try { series = JSON.parse(jsonStr); }
      catch { continue; }
      if (!Array.isArray(series)) continue;

      byVariantCompany[vrnt] = byVariantCompany[vrnt] || {};
      const enriched = series.map(s => ({
        name: s.name,
        data: s.data,
        summary: summarize(s),
      }));
      byVariantCompany[vrnt][company] = { series: enriched };
    }

    const variants = Object.keys(byVariantCompany);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
    return res.json({
      id, slug, variant, name,
      variants,
      byVariantCompany,
      hasData: variants.length > 0,
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal', message: String(err.message || err) });
  }
}
