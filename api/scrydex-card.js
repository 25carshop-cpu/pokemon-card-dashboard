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

const TYPE_NAMES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'dragon', 'fairy', 'colorless'];

function extractCardDetail(html) {
  const detail = {};

  // Simple labeled fields: artist, rarity, language, printed_number
  const FIELD_RE = /<div class="text-body-16 text-mono-4">([^<]+)<\/div>[\s\S]{0,300}?<div data-field="([a-z_]+)"/g;
  let m;
  while ((m = FIELD_RE.exec(html)) !== null) {
    detail[m[2]] = decodeHtmlEntities(m[1]).trim();
  }

  // HP
  const hpMatch = /<span class="text-white">HP\s+(\d+)<\/span>/.exec(html);
  if (hpMatch) detail.hp = parseInt(hpMatch[1], 10);

  // Types: pokemon type icons (e.g. fire-{hash}.png) near data-field="types"
  const typesIdx = html.indexOf('data-field="types"');
  if (typesIdx >= 0) {
    const sliceStart = Math.max(0, typesIdx - 600);
    const slice = html.slice(sliceStart, typesIdx + 200);
    const types = [];
    for (const t of TYPE_NAMES) {
      if (new RegExp(`/assets/${t}-[a-f0-9]+\\.png`).test(slice)) {
        types.push(t.charAt(0).toUpperCase() + t.slice(1));
      }
    }
    if (types.length) detail.types = types;
  }

  // Supertype + subtypes: chips in the "Subtypes" block
  const stIdx = html.indexOf('class="sr-only">Subtypes');
  if (stIdx >= 0) {
    const nextSection = html.indexOf('<div class="mt-', stIdx + 30);
    const block = html.slice(stIdx, nextSection > stIdx ? nextSection : stIdx + 4000);
    const chipRe = /<div class="border border-mono-2[^"]*"><div>([^<]+)<\/div>/g;
    const chips = [];
    let cm;
    while ((cm = chipRe.exec(block)) !== null) {
      chips.push(decodeHtmlEntities(cm[1]).trim());
    }
    if (chips.length > 0) {
      detail.supertype = chips[0];
      detail.subtypes = chips.slice(1);
    }
  }

  return detail;
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

  const VARIANT_FALLBACKS = ['normal', 'holofoil', 'reverse', 'first_edition', 'reverse_holofoil'];
  const tryVariants = [variant, ...VARIANT_FALLBACKS.filter(v => v !== variant)];

  let html = null;
  let triedUrl = null;
  let lastStatus = 0;
  for (const v of tryVariants) {
    triedUrl = `https://scrydex.com/pokemon/cards/${encodeURIComponent(slug)}/${encodeURIComponent(id)}?variant=${encodeURIComponent(v)}`;
    try {
      const r = await fetch(triedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PokemonCardDashboard/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      lastStatus = r.status;
      if (!r.ok) continue;
      html = await r.text();
      // If this page has any chart, stop. Otherwise try next variant.
      if (/new Chartkick\["LineChart"\]/.test(html)) break;
    } catch {}
  }
  if (!html) {
    return res.status(lastStatus || 502).json({ error: 'fetch_failed', status: lastStatus, url: triedUrl });
  }

  try {

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
    const detail = extractCardDetail(html);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
    return res.json({
      id, slug, variant, name,
      variants,
      byVariantCompany,
      detail,
      hasData: variants.length > 0,
      hasDetail: Object.keys(detail).length > 0,
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal', message: String(err.message || err) });
  }
}
