// api/search.js — No API key required. Scrapes DuckDuckGo HTML server-side.
// Your Vercel server makes the request, so the user's IP is always hidden.

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.body?.q?.trim();
  if (!query) return res.status(400).json({ error: 'No query provided' });

  try {
    // POST to DuckDuckGo's HTML-only version (same request a browser makes)
    const ddgRes = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://html.duckduckgo.com/'
      },
      body: `q=${encodeURIComponent(query)}&kl=us-en&df=`
    });

    if (!ddgRes.ok) {
      return res.status(502).json({ error: `DuckDuckGo returned ${ddgRes.status}` });
    }

    const html = await ddgRes.text();
    const results = parseDDG(html);

    return res.status(200).json({ results });

  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Proxy error', details: err.message });
  }
};

function parseDDG(html) {
  // Extract result titles + URLs
  // DDG HTML pattern: <a rel="nofollow" class="result__a" href="URL">TITLE</a>
  const titleRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  // Extract descriptions
  // DDG HTML pattern: <a class="result__snippet" ...>DESCRIPTION</a>
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const pairs = [];
  let m;

  while ((m = titleRe.exec(html)) !== null) {
    const url = m[1];
    const title = stripTags(m[2]).trim();
    // Skip DDG's own internal links
    if (title && !url.includes('duckduckgo.com')) {
      pairs.push({ url, title });
    }
    if (pairs.length >= 10) break;
  }

  const snippets = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]).trim());
    if (snippets.length >= 10) break;
  }

  return pairs.map((p, i) => ({
    title: p.title,
    url: p.url,
    description: snippets[i] || ''
  }));
}

function stripTags(str) {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
