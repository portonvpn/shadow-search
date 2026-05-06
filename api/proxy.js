// api/proxy.js — Full proxy: rewrites HTML + intercepts all JS fetch/XHR calls

module.exports = async function (req, res) {
  const target = req.query?.url;

  if (!target) return res.status(400).send('Missing ?url=');

  let parsed;
  try {
    parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).send('Bad protocol');
  } catch { return res.status(400).send('Invalid URL'); }

  // The base of our proxy — auto-detected from the request
  const proxyBase = `https://${req.headers.host}/api/proxy?url=`;

  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': parsed.origin + '/',
      },
      redirect: 'follow'
    });

    const contentType = r.headers.get('content-type') || '';

    // Always add these — strip frame blocking and open CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', '');

    // ── HTML: rewrite + inject interceptor
    if (contentType.includes('text/html')) {
      let html = await r.text();
      html = rewriteHtml(html, target, parsed.origin, proxyBase);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    // ── JavaScript: serve with open CORS so iframe can load it
    if (contentType.includes('javascript')) {
      const text = await r.text();
      res.setHeader('Content-Type', contentType);
      return res.status(200).send(text);
    }

    // ── CSS: rewrite url() references
    if (contentType.includes('text/css')) {
      let css = await r.text();
      css = css.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
        const full = resolveUrl(url, parsed.origin, target);
        if (!full) return match;
        return `url("${proxyBase}${encodeURIComponent(full)}")`;
      });
      res.setHeader('Content-Type', contentType);
      return res.status(200).send(css);
    }

    // ── Everything else (images, fonts, video, etc.) — pipe through
    const buffer = await r.arrayBuffer();
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    return res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    return res.status(502).send(`
      <html><body style="font-family:monospace;padding:2rem;background:#111;color:#aaa">
        <h2 style="color:#ff6b6b">Could not load</h2><p>${err.message}</p>
      </body></html>
    `);
  }
};

// ─────────────────────────────────────────────
// Rewrite HTML: inject interceptor + fix URLs
// ─────────────────────────────────────────────
function rewriteHtml(html, pageUrl, origin, proxyBase) {

  // Script injected into every proxied page:
  // - Overrides fetch/XHR so ALL API calls go through our proxy
  // - Silences cross-origin history errors
  const interceptor = `<script>
(function(){
  var PB = ${JSON.stringify(proxyBase)};
  var OR = ${JSON.stringify(origin)};

  function px(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) return url;
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('/')) url = OR + url;
    if (!url.startsWith('http')) return url;
    return PB + encodeURIComponent(url);
  }

  // Override fetch
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      if (init && init.mode === 'same-origin') init = Object.assign({}, init, {mode: 'cors'});
      input = px(input);
    } else if (input && input.url) {
      input = new Request(px(input.url), input);
    }
    return _fetch(input, init);
  };

  // Override XHR
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string') url = px(url);
    var args = Array.prototype.slice.call(arguments);
    args[1] = url;
    return _open.apply(this, args);
  };

  // Silence history errors from cross-origin JS
  ['pushState','replaceState'].forEach(function(fn) {
    var orig = history[fn];
    history[fn] = function() { try { orig.apply(this, arguments); } catch(e) {} };
  });

  // Fix window.location references in scripts
  Object.defineProperty(window, 'location', {
    get: function() { return window.__proxyLocation || location; },
    configurable: true
  });

})();
</script>`;

  // Inject interceptor as early as possible
  if (html.includes('<head>')) {
    html = html.replace('<head>', '<head>' + interceptor);
  } else if (html.includes('<HEAD>')) {
    html = html.replace('<HEAD>', '<HEAD>' + interceptor);
  } else {
    html = interceptor + html;
  }

  // Rewrite all src, href, action, srcset attributes
  html = html.replace(/(\s(?:src|href|action|srcset|data-src|data-href))\s*=\s*["']([^"']+)["']/gi, (match, attr, url) => {
    const full = resolveUrl(url.trim(), origin, pageUrl);
    if (!full) return match;
    return `${attr}="${proxyBase}${encodeURIComponent(full)}"`;
  });

  // Rewrite inline style url()
  html = html.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
    const full = resolveUrl(url, origin, pageUrl);
    if (!full) return match;
    return `url("${proxyBase}${encodeURIComponent(full)}")`;
  });

  return html;
}

// Resolve a URL to absolute, return null if it shouldn't be proxied
function resolveUrl(url, origin, pageUrl) {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('mailto:')) return null;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return origin + url;
  if (url.startsWith('http')) return url;
  // relative URL
  try {
    return new URL(url, pageUrl).href;
  } catch { return null; }
}