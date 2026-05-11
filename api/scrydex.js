const SLUG_MAP = {
  'm4_ja':  { slug: 'ninja-spinner',  name: 'Ninja Spinner'  },
  'm3_ja':  { slug: 'nihil-zero',     name: 'Nihil Zero'     },
  'm2a_ja': { slug: 'mega-dream-ex',  name: 'MEGA Dream ex'  },
};

const CARD_RE = /<a[^>]+href="\/pokemon\/cards\/([^\/"]+)\/([^"?]+)(?:\?variant=([^"]+))?"[\s\S]*?<div[^>]+class="[^"]*\bcard\b[^"]*"[^>]+data-id="([^"]+)"[\s\S]*?<img[^>]+src="(https:\/\/images\.scrydex\.com\/pokemon\/[^"]+?)\/medium"[\s\S]*?<span[^>]*>([^<]+?#[\w]+?)<\/span>/g;

const NAME_NUMBER_RE = /^(.+?)\s*#(\w+)\s*$/;

function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export default async function handler(req, res) {
  const id = (req.query?.id || '').toString();
  const meta = SLUG_MAP[id];
  if (!meta) {
    return res.status(400).json({ error: 'unknown_id', id, supported: Object.keys(SLUG_MAP) });
  }

  const url = `https://scrydex.com/pokemon/expansions/${meta.slug}/${id}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PokemonCardDashboard/1.0; +https://github.com/25carshop-cpu/pokemon-card-dashboard)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) {
      return res.status(r.status).json({ error: 'fetch_failed', status: r.status, url });
    }
    const html = await r.text();

    const seen = new Set();
    const cards = [];
    let m;
    CARD_RE.lastIndex = 0;
    while ((m = CARD_RE.exec(html)) !== null) {
      const [, nameSlug, cardId, variant, , imgBase, nameWithNum] = m;
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const decoded = decodeHtmlEntities(nameWithNum).trim();
      const nm = NAME_NUMBER_RE.exec(decoded);
      const name = nm ? nm[1].trim() : decoded;
      const localId = nm ? nm[2] : '';
      cards.push({
        id: cardId,
        name,
        localId,
        slug: nameSlug,
        image: imgBase,
        variant: variant || 'normal',
      });
    }

    // Sort by numeric localId when possible
    cards.sort((a, b) => {
      const an = parseInt(a.localId, 10);
      const bn = parseInt(b.localId, 10);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return String(a.localId).localeCompare(String(b.localId));
    });

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    return res.json({
      id,
      slug: meta.slug,
      name: meta.name,
      source: 'scrydex',
      cardCount: cards.length,
      cards,
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal', message: String(err.message || err) });
  }
}
