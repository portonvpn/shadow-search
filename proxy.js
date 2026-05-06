// api/proxy.js — Fetches a webpage and strips X-Frame-Options so it loads in an iframe
// Usage: /api/proxy?url=https://example.com

module.exports = async function (req, res) {
  const target = req.query?.url;

  if (!target) {
    return res.status(400).send('Missing ?url= parameter');
  }

  // Only allow http/https
  let parsedUrl;
  try {
    parsedUrl = new URL(target);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }
  } catch {
    return res.status(400).send('Invalid URL');
  }

  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow'
    });

    const contentType = r.headers.get('content-type') || 'text/html';

    // For non-HTML (images, PDFs, etc.) — stream directly
    if (!contentType.includes('text/html')) {
      const buffer = await r.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      // Remove frame-blocking headers
      res.removeHeader('X-Frame-Options');
      return res.status(200).send(Buffer.from(buffer));
    }

    let html = await r.text();

    // Inject <base> tag so relative links resolve correctly
    const base = `<base href="${parsedUrl.origin}${parsedUrl.pathname}">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${base}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>${base}`);
    } else {
      html = base + html;
    }

    // Send back with frame-blocking headers removed
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', '');
    return res.status(200).send(html);

  } catch (err) {
    return res.status(502).send(`
      <html><body style="font-family:monospace;padding:2rem;background:#111;color:#aaa;">
        <h2 style="color:#ff6b6b">Could not load page</h2>
        <p>${err.message}</p>
        <p>This site may be blocking external access entirely.</p>
      </body></html>
    `);
  }
};
