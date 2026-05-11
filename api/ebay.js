// Vercel function that proxies eBay Browse API search.
// Used by the Watchlist tab to fetch active US listings, especially
// for newly-released sets that CardTrader doesn't have yet.
//
// Env vars (set in Vercel):
//   EBAY_APP_ID  — App ID from developer.ebay.com (Production keyset)
//   EBAY_CERT_ID — Cert ID from the same keyset
//
// OAuth Client Credentials flow caches token in module memory (~2h).

const EBAY_BASE = 'https://api.ebay.com';
// Pokemon TCG Individual Cards category
const POKEMON_CATEGORY = '183454';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getEbayToken(appId, certId) {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  const auth = Buffer.from(`${appId}:${certId}`).toString('base64');
  const res = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`eBay OAuth ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in * 1000);
  return cachedToken;
}

export default async function handler(req, res) {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    return res.status(500).json({
      error: 'missing_credentials',
      message: 'ตั้งค่า EBAY_APP_ID และ EBAY_CERT_ID ใน Vercel Environment Variables',
    });
  }

  const query = (req.query.q || '').trim();
  const marketplace = (req.query.market || 'EBAY_US').toUpperCase();
  if (!query) {
    return res.status(400).json({ error: 'missing_param', message: 'ต้องระบุ ?q=<search>' });
  }

  try {
    const token = await getEbayToken(appId, certId);

    const url = `${EBAY_BASE}/buy/browse/v1/item_summary/search`
      + `?q=${encodeURIComponent('Pokemon ' + query)}`
      + `&filter=${encodeURIComponent('categoryIds:{' + POKEMON_CATEGORY + '}')}`
      + `&limit=50&sort=price`;

    const upstream = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplace,
        'Accept': 'application/json',
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({
        error: 'ebay_error',
        status: upstream.status,
        message: text.slice(0, 600),
      });
    }

    const json = await upstream.json();
    const items = (json.itemSummaries || []).map(i => ({
      id: i.itemId,
      title: i.title,
      price: parseFloat(i.price?.value || 0),
      currency: i.price?.currency || 'USD',
      condition: i.condition,
      url: i.itemWebUrl,
      image: i.image?.imageUrl,
      seller: i.seller?.username,
      country: i.itemLocation?.country,
    })).filter(i => i.price > 0);

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({
      query,
      marketplace,
      total: json.total || items.length,
      items: items.slice(0, 50),
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: 'fetch_failed', message: err.message });
  }
}
