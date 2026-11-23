/**
 * =============================================================================
 * VAX AI SERVER & CORS PROXY GATEWAY (Node.js + Cloudflare Worker Compatible)
 * -----------------------------------------------------------------------------
 * 1. GET/POST /proxy?url=<encoded_url>
 *    -> Vượt mọi rào cản CORS, gắn custom Referer / Origin / User-Agent / Cookie
 *       theo yêu cầu của các plugin VAX (Dexter, Film4K, Danet, HHPanda...).
 * 2. POST /api/convert-plugin
 *    -> Nhận vào { targetUrl, provider, apiKey, model } -> Tự động cào trang chủ
 *       và trang chi tiết phim của website đích, gọi LLM (Gemini / OpenAI / Claude)
 *       để sinh ra code plugin VAX hoàn chỉnh.
 * =============================================================================
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const WWW_DIR = path.join(__dirname, '..', 'www');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-Headers, X-VAX-YB, X-F4K-PT, api-key'
};

function fetchRemote(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const reqOpts = {
        method: options.method || 'GET',
        headers: Object.assign({
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
          'Accept': '*/*',
          'Referer': parsed.origin + '/',
          'Origin': parsed.origin
        }, options.headers || {}),
        timeout: 20000
      };

      const req = client.request(parsed, reqOpts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, targetUrl).toString();
          return resolve(fetchRemote(redirectUrl, options));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: buffer.toString('utf8'),
            rawBuffer: buffer
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) req.write(options.body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // 1. Endpoint CORS Proxy đa năng cho VAX Plugins & HLS Stream
  if (reqUrl.pathname === '/proxy') {
    const targetUrl = reqUrl.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
      return res.end(JSON.stringify({ error: 'Missing url parameter' }));
    }

    let bodyChunks = [];
    req.on('data', (c) => bodyChunks.push(c));
    req.on('end', async () => {
      try {
        const bodyBuf = bodyChunks.length ? Buffer.concat(bodyChunks) : null;
        let customHeaders = {};
        if (req.headers['x-target-headers']) {
          try { customHeaders = JSON.parse(req.headers['x-target-headers']); } catch (e) {}
        }
        const remoteRes = await fetchRemote(targetUrl, {
          method: req.method,
          headers: customHeaders,
          body: bodyBuf
        });
        res.writeHead(remoteRes.status || 200, Object.assign({
          'Content-Type': remoteRes.headers['content-type'] || 'text/plain; charset=utf-8'
        }, CORS_HEADERS));
        res.end(remoteRes.rawBuffer);
      } catch (e) {
        res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 2. Phục vụ Static Web App từ thư mục www/
  let filePath = path.join(WWW_DIR, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png'
    };
    res.writeHead(200, Object.assign({ 'Content-Type': mimeMap[ext] || 'application/octet-stream' }, CORS_HEADERS));
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`🚀 VAX Film App & AI Proxy Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`🔗 Điền địa chỉ Proxy này vào Cài đặt App nếu cần: http://localhost:${PORT}/proxy?url={url}`);
});
