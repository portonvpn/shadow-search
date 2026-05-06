// api/search.js — Serper.dev (real Google results, 2500 free searches, no card)
// Add SERPER_API_KEY in Vercel → Settings → Environment Variables

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.body?.q?.trim();
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Add SERPER_API_KEY in Vercel → Settings → Environment Variables'
    });
  }

  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: 10 })
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data.message || 'Serper error' });
    }

    const results = (data.organic || []).map(item => ({
      title: item.title || '',
      url: item.link || '',
      description: item.snippet || ''
    }));

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', details: err.message });
  }
};
