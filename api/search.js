// api/search.js — Uses public SearXNG instances (open source, free, proper JSON)
// No API key, no card, no signup needed at all.

const INSTANCES = [
  'https://searx.be',
  'https://paulgo.io',
  'https://search.bus-hit.me',
  'https://searxng.world',
  'https://searx.tiekoetter.com',
];

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.body?.q?.trim();
  if (!query) return res.status(400).json({ error: 'No query provided' });

  // Try each instance until one works
  for (const instance of INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`;

      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout per instance
      });

      if (!r.ok) continue; // try next instance

      const data = await r.json();

      if (!data.results || data.results.length === 0) continue;

      const results = data.results.slice(0, 10).map(item => ({
        title: item.title || '',
        url: item.url || '',
        description: item.content || ''
      }));

      return res.status(200).json({ results, _source: instance });

    } catch (err) {
      // This instance failed, try next
      console.log(`Instance ${instance} failed:`, err.message);
      continue;
    }
  }

  // All instances failed
  return res.status(502).json({
    error: 'All search instances are currently unavailable. Try again in a moment.',
    results: []
  });
};
