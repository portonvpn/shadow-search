// api/search.js — Uses DDG Lite beter fix

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.body?.q?.trim();
  if (!query) return res.status(400).json({ error: 'No query provided' });

  try {
    const ddgRes = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://lite.duckduckgo.com',
        'Referer': 'https://lite.duckduckgo.com/'
      },
      body: `q=${encodeURIComponent(query)}&kl=us-en`
    });

    if (!ddgRes.ok) {
      return res.status(502).json({ error: `DDG returned status ${ddgRes.status}` });
    }

    const html = await ddgRes.text();

    // DEBUG: uncomment the next line temporarily if still no results
    // return res.status(200).json({ debug: html.slice(0, 3000) });

    const results = parseLite(html);

    if (results.length === 0) {
      // Return a snippet of raw HTML so you can see what DDG is sending back
      return res.status(200).json({
        results: [],
        _debug: 'No results parsed. Raw HTML sample: ' + html.slice(0, 500)
      });
    }

    return res.status(200).json({ results });

  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Proxy error', details: err.message });
  }
};

function parseLite(html) {
  const results = [];

  // DDG Lite HTML structure:
  // <a class="result-link" href="URL">TITLE</a>
  // <td class="result-snippet">DESCRIPTION</td>

  // Step 1: get all result links (title + url)
  const linkRe = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Step 2: get all snippets
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links = [];
  let m;

  while ((m = linkRe.exec(html)) !== null) {
    links.push({
      url: m[1].trim(),
      title: clean(m[2])
    });
    if (links.length >= 10) break;
  }

  const snippets = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(clean(m[1]));
    if (snippets.length >= 10) break;
  }

  return links.map((l, i) => ({
    title: l.title,
    url: l.url,
    description: snippets[i] || ''
  }));
}

function clean(str) {
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
