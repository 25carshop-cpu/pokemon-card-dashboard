const CT_BASE = 'https://api.cardtrader.com/api/v2';
const POKEMON_GAME_ID = 5;
const MAX_LISTINGS_PER_BLUEPRINT = 60;

let expansionMapCache = null;
let expansionMapCacheAt = 0;
const blueprintCache = new Map();

async function ctFetch(path, token, { allow404 = false } = {}) {
  const res = await fetch(`${CT_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  if (res.status === 404 && allow404) return null;
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`CardTrader ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function getExpansionMap(token) {
  if (expansionMapCache && Date.now() - expansionMapCacheAt < 7 * 24 * 3600 * 1000) {
    return expansionMapCache;
  }
  const all = await ctFetch('/expansions', token);
  const byCode = {};
  const byName = {};
  for (const e of all) {
    if (e.game_id === POKEMON_GAME_ID && e.code) {
      const entry = { id: e.id, name: e.name, code: e.code };
      byCode[e.code.toLowerCase()] = entry;
      byName[normalizeName(e.name)] = entry;
    }
  }
  expansionMapCache = { byCode, byName };
  expansionMapCacheAt = Date.now();
  return expansionMapCache;
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findExpansion(map, { code, name }) {
  if (code) {
    const c = code.toLowerCase();
    if (map.byCode[c]) return map.byCode[c];
    // Try without trailing letter (sv10.5w → sv10)
    const trimmed = c.replace(/\.\d+[a-z]?$/, '').replace(/[a-z]$/, '');
    if (trimmed !== c && map.byCode[trimmed]) return map.byCode[trimmed];
  }
  if (name) {
    const n = normalizeName(name);
    if (map.byName[n]) return map.byName[n];
    // Try fuzzy match: contains
    for (const [key, entry] of Object.entries(map.byName)) {
      if (key === n || key.includes(n) || n.includes(key)) return entry;
    }
  }
  return null;
}

async function getBlueprints(expansionId, token) {
  const cached = blueprintCache.get(expansionId);
  if (cached && Date.now() - cached.at < 24 * 3600 * 1000) return cached.data;
  const data = await ctFetch(`/blueprints/export?expansion_id=${expansionId}`, token);
  blueprintCache.set(expansionId, { data, at: Date.now() });
  return data;
}

function findBlueprintsForCard(blueprints, collectorNumber) {
  const target = String(collectorNumber).replace(/^0+/, '');
  return blueprints.filter(bp => {
    const cn = bp.fixed_properties?.collector_number;
    if (!cn) return false;
    return String(cn).replace(/^0+/, '') === target;
  });
}

const GRADING_REGEX = /\b(PSA|BGS|CGC|ACE|GRAAD|HGA|SGC|TAG|GMA|MNT|ARS)\s*\.?\s*(10(?:\.0)?|[0-9]\.?[0-9]?)\b/i;

function parseGrading(description) {
  if (!description) return null;
  const m = String(description).match(GRADING_REGEX);
  if (!m) return null;
  const company = m[1].toUpperCase();
  const grade = parseFloat(m[2]);
  if (!Number.isFinite(grade)) return null;
  return { company, grade, label: `${company} ${grade}` };
}

function summarizeListings(listings) {
  if (!listings.length) return null;
  const cents = listings.map(l => l.price_cents).filter(Number.isFinite).sort((a, b) => a - b);
  if (!cents.length) return null;
  const sum = cents.reduce((a, b) => a + b, 0);
  const avg = sum / cents.length;
  const median = cents[Math.floor(cents.length / 2)];
  const currency = listings[0].price_currency || 'USD';
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';
  return {
    currency,
    symbol,
    count: listings.length,
    lowest: cents[0] / 100,
    average: avg / 100,
    median: median / 100,
    highest: cents[cents.length - 1] / 100,
  };
}

export default async function handler(req, res) {
  const token = process.env.CARDTRADER_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: 'missing_credentials',
      message: 'ตั้งค่า CARDTRADER_TOKEN ใน Vercel Environment Variables'
    });
  }

  const expansionCode = String(req.query.expansion_code || '').toLowerCase().trim();
  const expansionName = String(req.query.expansion_name || '').trim();
  const collectorNumber = String(req.query.collector_number || '').trim();
  const language = (String(req.query.language || 'jp').toLowerCase().trim()) || 'jp';
  if ((!expansionCode && !expansionName) || !collectorNumber) {
    return res.status(400).json({
      error: 'missing_param',
      message: 'ต้องระบุ ?expansion_code=<code> หรือ ?expansion_name=<name> + ?collector_number=<num>'
    });
  }

  try {
    const map = await getExpansionMap(token);
    const expansion = findExpansion(map, { code: expansionCode, name: expansionName });
    if (!expansion) {
      return res.status(404).json({
        error: 'expansion_not_found',
        message: `CardTrader ไม่มี expansion ที่ตรงกับ code="${expansionCode}" name="${expansionName}"`
      });
    }

    const blueprints = await getBlueprints(expansion.id, token);
    const matched = findBlueprintsForCard(blueprints, collectorNumber);
    if (matched.length === 0) {
      res.setHeader('Cache-Control', 's-maxage=86400');
      return res.status(200).json({
        expansion,
        results: [],
        message: `ไม่พบ blueprint สำหรับ #${collectorNumber} ใน ${expansion.name}`
      });
    }

    const top = matched.slice(0, 5);
    const marketResponses = await Promise.all(
      top.map(bp => ctFetch(`/marketplace/products?blueprint_id=${bp.id}`, token, { allow404: true }))
    );

    const result = top.map((bp, i) => {
      const market = marketResponses[i] || {};
      const raw = (market[String(bp.id)] || []).filter(l =>
        l.properties_hash?.pokemon_language === language
      );

      const enriched = raw
        .slice()
        .sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0))
        .slice(0, MAX_LISTINGS_PER_BLUEPRINT)
        .map(l => {
          const grading = parseGrading(l.description) || (l.graded ? { company: '?', grade: 0, label: 'Graded (unknown)' } : null);
          return {
            id: l.id,
            price: (l.price_cents || 0) / 100,
            price_cents: l.price_cents,
            currency: l.price_currency,
            formatted: l.price?.formatted || `${l.price_currency} ${(l.price_cents || 0) / 100}`,
            condition: l.properties_hash?.condition || 'Near Mint',
            rarity: l.properties_hash?.pokemon_rarity || '',
            seller: l.user?.username || '',
            country: l.user?.country_code || '',
            quantity: l.quantity || 1,
            graded: l.graded || !!grading,
            grading,
            description: l.description || '',
          };
        });

      const stats = summarizeListings(enriched.map(l => ({ price_cents: l.price_cents, price_currency: l.currency })));

      return {
        blueprint_id: bp.id,
        name_en: bp.name,
        version: bp.version,
        rarity: bp.fixed_properties?.pokemon_rarity || null,
        stats,
        listings: enriched,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ expansion, results: result });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: 'fetch_failed',
      message: err.message
    });
  }
}
