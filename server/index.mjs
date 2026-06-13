import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createAdminSessions } from './adminSession.mjs';
import { createAccountingSessions } from './accountingSession.mjs';
import { createAccountingStore } from './accountingStore.mjs';
import { verifyAdminPassword } from './auth.mjs';
import { createPostStore } from './postStore.mjs';
import { createSqliteDatabase } from './sqliteDatabase.mjs';

const root = resolve('dist');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const postDbPath = process.env.POST_DB_PATH || './data/blog.sqlite';
const bodyLimitBytes = Number(process.env.REQUEST_BODY_LIMIT || 1024 * 1024);

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
    if (size > bodyLimitBytes) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleLogin(request, response, sessions) {
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
    sendJson(response, ok ? 200 : 401, ok ? { ok, token: sessions.issue() } : { ok });
  } catch {
    sendJson(response, 400, { ok: false, message: 'Invalid request body' });
  }
}

function isAdmin(request, sessions) {
  return sessions.verify(request.headers.authorization || '');
}

function getPostId(pathname) {
  const match = pathname.match(/^\/api\/posts\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getAccountingEntryId(pathname) {
  const match = pathname.match(/^\/api\/accounting\/entries\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function handlePosts(request, response, store, sessions) {
  const url = new URL(request.url || '/', 'http://localhost');
  const admin = isAdmin(request, sessions);

  if (url.pathname === '/api/posts' && request.method === 'GET') {
    const includeDrafts = url.searchParams.get('includeDrafts') === '1' && admin;
    sendJson(response, 200, { posts: store.list({ includeDrafts }) });
    return;
  }

  if (url.pathname === '/api/posts' && request.method === 'POST') {
    if (!admin) {
      sendJson(response, 401, { ok: false, message: 'Unauthorized' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      sendJson(response, 201, { post: store.create(body) });
    } catch {
      sendJson(response, 400, { ok: false, message: 'Invalid request body' });
    }
    return;
  }

  const postId = getPostId(url.pathname);
  if (!postId) {
    sendJson(response, 404, { ok: false, message: 'Not found' });
    return;
  }

  if (!admin) {
    sendJson(response, 401, { ok: false, message: 'Unauthorized' });
    return;
  }

  if (request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      const post = store.update(postId, body);
      sendJson(response, post ? 200 : 404, post ? { post } : { ok: false, message: 'Post not found' });
    } catch {
      sendJson(response, 400, { ok: false, message: 'Invalid request body' });
    }
    return;
  }

  if (request.method === 'DELETE') {
    const removed = store.remove(postId);
    sendJson(response, removed ? 200 : 404, removed ? { ok: true } : { ok: false, message: 'Post not found' });
    return;
  }

  sendJson(response, 405, { ok: false, message: 'Method not allowed' });
}

async function handleAccounting(request, response, accountingStore, accountingSessions) {
  const url = new URL(request.url || '/', 'http://localhost');

  if (url.pathname === '/api/accounting/login') {
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
      if (!ok) {
        sendJson(response, 401, { ok: false, message: '记账口令不正确' });
        return;
      }
      sendJson(response, 200, { ok: true, ...accountingSessions.issue() });
    } catch {
      sendJson(response, 400, { ok: false, message: 'Invalid request body' });
    }
    return;
  }

  const authenticated = accountingSessions.verify(request.headers.authorization || '');
  if (!authenticated) {
    sendJson(response, 401, { ok: false, message: 'Accounting session expired' });
    return;
  }

  if (url.pathname === '/api/accounting/session' && request.method === 'GET') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/accounting/month' && request.method === 'GET') {
    sendJson(response, 200, accountingStore.getMonthData({
      month: url.searchParams.get('month') || undefined,
      type: url.searchParams.get('type') || 'all',
      category: url.searchParams.get('category') || 'all'
    }));
    return;
  }

  if (url.pathname === '/api/accounting/entries' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 201, { entry: accountingStore.createEntry(body) });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Invalid request body' });
    }
    return;
  }

  const entryId = getAccountingEntryId(url.pathname);
  if (entryId && request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      const entry = accountingStore.updateEntry(entryId, body);
      sendJson(response, entry ? 200 : 404, entry ? { entry } : { ok: false, message: 'Entry not found' });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Invalid request body' });
    }
    return;
  }

  if (entryId && request.method === 'DELETE') {
    const removed = accountingStore.removeEntry(entryId);
    sendJson(response, removed ? 200 : 404, removed ? { ok: true } : { ok: false, message: 'Entry not found' });
    return;
  }

  if (url.pathname === '/api/accounting/settings' && request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      accountingStore.updateSettings(body);
      sendJson(response, 200, accountingStore.getMonthData({ month: body.month }));
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Invalid request body' });
    }
    return;
  }

  sendJson(response, 404, { ok: false, message: 'Not found' });
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

const sessions = createAdminSessions();
const database = await createSqliteDatabase({ dbPath: postDbPath });
const store = await createPostStore({ database });
const accountingStore = createAccountingStore({ database });
const accountingSessions = createAccountingSessions({ store: accountingStore });

createServer(async (request, response) => {
  if (request.url?.startsWith('/api/admin/login')) {
    await handleLogin(request, response, sessions);
    return;
  }

  if (request.url?.startsWith('/api/posts')) {
    await handlePosts(request, response, store, sessions);
    return;
  }

  if (request.url?.startsWith('/api/accounting')) {
    await handleAccounting(request, response, accountingStore, accountingSessions);
    return;
  }

  sendStatic(request, response);
}).listen(port, host, async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(`${packageJson.name} server listening on http://${host}:${port}`);
});
