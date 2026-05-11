const CT_BASE = 'https://api.cardtrader.com/api/v2';
const POKEMON_GAME_ID = 5;

let expansionMapCache = null;
let expansionMapCacheAt = 0;
const blueprintCache = new Map();

async function ctFetch(path, token) {
  const res = await fetch(`${CT_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
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
  const map = {};
  for (const e of all) {
    if (e.game_id === POKEMON_GAME_ID && e.code) {
      map[e.code.toLowerCase()] = { id: e.id, name: e.name, code: e.code };
    }
  }
  expansionMapCache = map;
  expansionMapCacheAt = Date.now();
  return map;
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
  const collectorNumber = String(req.query.collector_number || '').trim();
  if (!expansionCode || !collectorNumber) {
    return res.status(400).json({
      error: 'missing_param',
      message: 'ต้องระบุ ?expansion_code=<code>&collector_number=<num>'
    });
  }

  try {
    const map = await getExpansionMap(token);
    const expansion = map[expansionCode];
    if (!expansion) {
      return res.status(404).json({
        error: 'expansion_not_found',
        message: `CardTrader ไม่มี expansion code "${expansionCode}" ในเกม Pokemon`
      });
    }

    const blueprints = await getBlueprints(expansion.id, token);
    const matched = findBlueprintsForCard(blueprints, collectorNumber);
    if (matched.length === 0) {
      res.setHeader('Cache-Control', 's-maxage=86400');
      return res.status(200).json({
        expansion,
        blueprints: [],
        message: `ไม่พบ blueprint สำหรับ #${collectorNumber} ใน ${expansion.name}`
      });
    }

    const blueprintIds = matched.map(b => b.id).slice(0, 5);
    const idsParam = blueprintIds.join(',');
    const market = await ctFetch(`/marketplace/products?blueprint_ids=${idsParam}`, token);

    const result = matched.map(bp => {
      const listings = (market[String(bp.id)] || []).filter(l =>
        l.properties_hash?.pokemon_language === 'jp'
      );
      const sampleListings = listings
        .slice()
        .sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0))
        .slice(0, 5)
        .map(l => ({
          price: (l.price_cents || 0) / 100,
          currency: l.price_currency,
          formatted: l.price?.formatted || `${l.price_currency} ${(l.price_cents || 0) / 100}`,
          condition: l.properties_hash?.condition || 'Near Mint',
          rarity: l.properties_hash?.pokemon_rarity || '',
          seller: l.user?.username || '',
          country: l.user?.country_code || '',
          quantity: l.quantity || 1,
        }));
      return {
        blueprint_id: bp.id,
        name_en: bp.name,
        version: bp.version,
        rarity: bp.fixed_properties?.pokemon_rarity || null,
        stats: summarizeListings(listings),
        sample_listings: sampleListings,
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
