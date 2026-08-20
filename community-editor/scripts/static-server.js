#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   dika studio — Static Server with COOP/COEP headers
   
   Serves the app over HTTP with Cross-Origin Isolation headers
   required for SharedArrayBuffer support.
   
   Headers set:
   - Cross-Origin-Opener-Policy: same-origin
   - Cross-Origin-Embedder-Policy: require-corp
   
   Usage:
     node scripts/static-server.js [port]
   ═══════════════════════════════════════════════════════════════ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || process.env.DIKA_PORT || '8124', 10);
const ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.mjs':  'application/javascript; charset=utf-8',
  '.map':  'application/json'
};

const server = http.createServer(function(req, res) {
  // Parse URL, strip query string
  var urlPath = req.url.split('?')[0];
  /* COMMUNITY EDITION: "/" serves the BUNDLE. index.html loads 299 modules one at a time (the dev
     page, so a source edit shows on reload with no rebuild) and that is several hundred requests
     before the canvas appears. index.prod.html is one script tag and is what ships. Falls back to
     index.html when the bundle has not been built yet, rather than 404ing on a fresh checkout. */
  if (urlPath === '/') {
    urlPath = fs.existsSync(path.join(ROOT, 'index.prod.html')) ? '/index.prod.html' : '/index.html';
  }

  // Prevent directory traversal
  var safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  var filePath = path.join(ROOT, safePath);

  // Ensure the resolved path is within ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Set COOP/COEP headers on every response (required for SharedArrayBuffer)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  // Also allow CORS for local CDN resources
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Required for Worker/blob-URL contexts under COEP
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  fs.stat(filePath, function(err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }

    var ext = path.extname(filePath).toLowerCase();
    var contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Dev cache policy: NEVER cache code/markup (.html/.js/.mjs/.css/.json) so an edited
    // module/core file can never be served stale by the browser — this is the class of bug
    // that made the loader-loaded left panels look broken (old cached module css/js out of
    // sync with a freshly-changed app.js). Large binaries (wasm/media/fonts) keep no-cache
    // (revalidate) so they aren't needlessly re-downloaded every reload.
    var CODE = { '.html': 1, '.js': 1, '.mjs': 1, '.css': 1, '.json': 1, '.map': 1 };
    var cacheControl = CODE[ext] ? 'no-store, no-cache, must-revalidate' : 'no-cache';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': cacheControl
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, function() {
  console.log('');
  console.log('  dika studio Static Server');
  console.log('  ─────────────────────────────');
  console.log('  URL:   http://localhost:' + PORT);
  console.log('  Root:  ' + ROOT);
  console.log('  COOP:  same-origin');
  console.log('  COEP:  require-corp');
  console.log('  SAB:   enabled');
  console.log('');
});
