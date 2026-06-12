import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';
import { verifyAdminPassword } from './auth.mjs';

const root = resolve('dist');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const adminPassword = process.env.ADMIN_PASSWORD || '';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleLogin(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { ok: false, message: 'Method not allowed' });
    return;
  }

  if (!adminPassword) {
    sendJson(response, 503, { ok: false, message: '服务端未配置 ADMIN_PASSWORD' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const ok = verifyAdminPassword(String(body.password || ''), adminPassword);
    sendJson(response, ok ? 200 : 401, { ok });
  } catch {
    sendJson(response, 400, { ok: false, message: 'Invalid request body' });
  }
}

function sendStatic(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');
  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, requestedPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, 'index.html');
  }

  response.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] || 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
}

createServer(async (request, response) => {
  if (request.url?.startsWith('/api/admin/login')) {
    await handleLogin(request, response);
    return;
  }

  sendStatic(request, response);
}).listen(port, host, async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(`${packageJson.name} server listening on http://${host}:${port}`);
});
