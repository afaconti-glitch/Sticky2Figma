import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoDataUrl = (() => {
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'Sticky2FigmaLogo.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return ''; }
})();

const PORT = process.env.PORT || 3000;
const SESSION_TTL = 15 * 60 * 1000; // 15 minutes

function getLocalIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const net of list)
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return '127.0.0.1';
}

const BASE_URL = process.env.RELAY_BASE_URL ?? `http://${getLocalIp()}:${PORT}`;

// sessionId -> { images: string[], expireAt: number }
const sessions = new Map();

// OAuth PKCE sessions: state -> { authCode: string|null, expireAt: number }
const oauthSessions = new Map();
const OAUTH_TTL = 10 * 60 * 1000; // 10 minutes

function generateId() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * 36)];
  return id;
}

function mobilePageHtml(sessionId) {
  const uploadUrl = `${BASE_URL}/upload/${sessionId}`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sticky2Figma — Send Photos</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f5; color: #333; min-height: 100vh;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 32px 24px;
            max-width: 360px; width: 100%; text-align: center;
            box-shadow: 0 2px 16px rgba(0,0,0,0.1); }
    .logo { width: 72px; height: 72px; border-radius: 14px; margin-bottom: 12px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; margin-bottom: 16px; line-height: 1.5; }
    .btn { display: block; width: 100%; padding: 16px;
           border: none; border-radius: 12px; font-size: 16px;
           font-weight: 600; cursor: pointer; margin-bottom: 10px; }
    .btn-camera { background: #18A0FB; color: #fff; }
    .btn-gallery { background: #f0f0f0; color: #333; }
    .btn:active { opacity: 0.8; }
    input[type="file"] { display: none; }
    #status { font-size: 14px; font-weight: 600; min-height: 20px; }
    #counter { font-size: 13px; color: #999; margin-top: 8px; }
    .sending { color: #f0a500; }
    .done { color: #22c55e; }
    .error { color: #f24822; }
  </style>
</head>
<body>
  <div class="card">
    ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" alt="Sticky2Figma">` : ''}
    <h1>Sticky2Figma</h1>
    <p>Photos will appear in FigJam automatically.</p>
    <label>
      <input type="file" id="camera-input" accept="image/*" capture="environment" multiple>
      <div class="btn btn-camera">Take Photo</div>
    </label>
    <label>
      <input type="file" id="gallery-input" accept="image/*" multiple>
      <div class="btn btn-gallery">Choose from Gallery</div>
    </label>
    <p id="status"></p>
    <p id="counter"></p>
  </div>
  <script>
    const uploadUrl = '${uploadUrl}';
    const MAX_PX = 1500;
    let totalSent = 0;
    const statusEl = document.getElementById('status');
    const counterEl = document.getElementById('counter');

    function resizeToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          let { width, height } = img;
          if (width > MAX_PX || height > MAX_PX) {
            const scale = MAX_PX / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = objectUrl;
      });
    }

    async function sendFile(file) {
      try {
        const dataUrl = await resizeToDataUrl(file);
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
        if (!res.ok) throw new Error('Server error ' + res.status);
        totalSent++;
        counterEl.textContent = totalSent + ' photo' + (totalSent !== 1 ? 's' : '') + ' sent to Figma';
        return true;
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.className = 'error';
        return false;
      }
    }

    async function handleFiles(e) {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      statusEl.textContent = 'Sending ' + files.length + ' photo' + (files.length !== 1 ? 's' : '') + '...';
      statusEl.className = 'sending';
      for (const file of files) await sendFile(file);
      statusEl.textContent = 'Sent! You can send more.';
      statusEl.className = 'done';
      e.target.value = '';
    }

    document.getElementById('camera-input').addEventListener('change', handleFiles);
    document.getElementById('gallery-input').addEventListener('change', handleFiles);
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  console.log(`[req] ${req.method} ${req.url}`);
  let pathname, parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://localhost`);
    pathname = parsedUrl.pathname;
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // CORS headers — required for plugin iframe (http://localhost) to call this server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check for Railway
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // GET /create-session
  if (req.method === 'GET' && pathname === '/create-session') {
    const sessionId = generateId();
    sessions.set(sessionId, { images: [], expireAt: Date.now() + SESSION_TTL });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sessionId,
      uploadUrl: `${BASE_URL}/${sessionId}`,
      pollUrl: `${BASE_URL}/poll/${sessionId}`,
    }));
    return;
  }

  // GET /:sessionId — mobile upload page
  if (req.method === 'GET' && /^\/[a-z0-9]{1,12}$/.test(pathname)) {
    const sessionId = pathname.slice(1);
    if (!sessions.has(sessionId)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>Session not found or expired</h1><p>Please go back to the plugin and scan a new QR code.</p>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(mobilePageHtml(sessionId));
    return;
  }

  // POST /upload/:sessionId — receive image from phone, store it for polling
  if (req.method === 'POST' && /^\/upload\/[a-z0-9]{1,12}$/.test(pathname)) {
    const sessionId = pathname.split('/').pop();
    const session = sessions.get(sessionId);

    if (!session || Date.now() > session.expireAt) {
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session expired' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { dataUrl } = JSON.parse(body);
        if (!dataUrl || !dataUrl.startsWith('data:image/')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid dataUrl' }));
          return;
        }
        session.images.push(dataUrl);
        console.log(`[upload] session=${sessionId} total=${session.images.length} size=${Math.round(dataUrl.length/1024)}KB`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: session.images.length }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /poll/:sessionId?since=N — plugin polls for new images
  if (req.method === 'GET' && /^\/poll\/[a-z0-9]{1,12}$/.test(pathname)) {
    const sessionId = pathname.split('/').pop();
    const session = sessions.get(sessionId);
    const since = parseInt(parsedUrl.searchParams.get('since') || '0', 10);

    if (!session || Date.now() > session.expireAt) {
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session expired' }));
      return;
    }

    const newImages = session.images.slice(since);
    if (newImages.length > 0) console.log(`[poll] session=${sessionId} delivering ${newImages.length} new image(s)`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ images: newImages, total: session.images.length }));
    return;
  }

  // POST /oauth/start — create an OAuth PKCE session
  if (req.method === 'POST' && pathname === '/oauth/start') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { code_challenge } = JSON.parse(body);
        if (!code_challenge) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'code_challenge required' }));
          return;
        }
        const state = generateId() + generateId(); // 12-char state token
        oauthSessions.set(state, { authCode: null, expireAt: Date.now() + OAUTH_TTL });
        const callbackUrl = `${BASE_URL}/oauth/callback`;
        const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${encodeURIComponent(code_challenge)}&code_challenge_method=S256&state=${state}`;
        console.log(`[oauth] started session state=${state}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ state, authUrl }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /oauth/callback — OpenRouter redirects here after user auth
  if (req.method === 'GET' && pathname === '/oauth/callback') {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const session = state ? oauthSessions.get(state) : null;

    if (!session || Date.now() > session.expireAt) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Session expired or invalid</h1><p>Please return to the Figma plugin and try again.</p>');
      return;
    }

    session.authCode = code;
    console.log(`[oauth] callback received for state=${state}`);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sticky2Figma — Authenticated</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; background: #f5f5f5; margin: 0; }
  .card { background: #fff; border-radius: 16px; padding: 32px 24px; max-width: 360px;
          text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.1); }
  .check { font-size: 48px; margin-bottom: 12px; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  p { color: #666; font-size: 14px; }
</style></head><body>
<div class="card">
  <div class="check">&#10003;</div>
  <h1>Authenticated!</h1>
  <p>You can close this tab and return to the Figma plugin.</p>
</div></body></html>`);
    return;
  }

  // GET /oauth/poll/:state — plugin polls for the auth code
  if (req.method === 'GET' && /^\/oauth\/poll\/[a-z0-9]{1,24}$/.test(pathname)) {
    const state = pathname.split('/').pop();
    const session = oauthSessions.get(state);

    if (!session || Date.now() > session.expireAt) {
      oauthSessions.delete(state);
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session expired' }));
      return;
    }

    if (session.authCode) {
      const code = session.authCode;
      oauthSessions.delete(state); // one-time use
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: true, code }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: false }));
    }
    return;
  }

  // DELETE /session/:sessionId — plugin cleanup on unmount
  if (req.method === 'DELETE' && /^\/session\/[a-z0-9]{1,12}$/.test(pathname)) {
    const sessionId = pathname.split('/').pop();
    sessions.delete(sessionId);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Session expiry cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions)
    if (now > s.expireAt) sessions.delete(id);
  for (const [id, s] of oauthSessions)
    if (now > s.expireAt) oauthSessions.delete(id);
}, 60_000);

server.on('error', (err) => console.error('[server error]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('SIGTERM', () => {
  console.log('[SIGTERM received] Railway is stopping this container');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nSticky2Figma relay v2 running (polling mode)`);
  console.log(`Sessions expire after 15 minutes\n`);
  console.log('1. In the plugin Settings, set Relay Server URL to:');
  console.log(`   http://localhost:${PORT}`);
  console.log('\n2. Phone QR codes will use:');
  console.log(`   ${BASE_URL}`);
  console.log('\n(Phone and computer must be on the same WiFi)\n');
});
