import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createAdminSessionStore, createAdminSessions } from './adminSession.mjs';
import { createAccountingSessions } from './accountingSession.mjs';
import { createAccountingStore } from './accountingStore.mjs';
import { verifyAdminPassword } from './auth.mjs';
import { createRawFileHeaders } from './fileDownloadHeaders.mjs';
import { createFileStore } from './fileStore.mjs';
import { createImageStore } from './imageStore.mjs';
import { createPostStore } from './postStore.mjs';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createUserStore } from './userStore.mjs';

const root = resolve('dist');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const postDbPath = process.env.POST_DB_PATH || './data/blog.sqlite';
const uploadDir = resolve(process.env.UPLOAD_DIR || './data/uploads');
const imageDir = resolve(process.env.IMAGE_DIR || './data/images');
const bodyLimitBytes = Number(process.env.REQUEST_BODY_LIMIT || 1024 * 1024);
const fileUploadLimitBytes = Number(process.env.FILE_UPLOAD_LIMIT || 50 * 1024 * 1024);
const imageUploadLimitBytes = Number(process.env.IMAGE_UPLOAD_LIMIT || 0);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
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

async function readRequestBytes(request, limitBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (limitBytes > 0 && size > limitBytes) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseMultipartFile(buffer, contentType) {
  const boundary = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ?? String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw new Error('Missing multipart boundary');

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(boundaryBuffer);
  let fileUpload = null;
  let folderId = '';
  while (cursor !== -1) {
    const partStart = cursor + boundaryBuffer.length;
    const nextBoundary = buffer.indexOf(boundaryBuffer, partStart);
    if (nextBoundary === -1) break;

    let part = buffer.subarray(partStart, nextBoundary);
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === '\r\n') part = part.subarray(0, part.length - 2);

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString('latin1');
      const body = part.subarray(headerEnd + 4);
      const disposition = headerText.match(/^content-disposition:\s*([^\r\n]+)/im)?.[1] || '';
      const fieldName = disposition.match(/name="([^"]*)"/i)?.[1] || disposition.match(/name=([^;\r\n]+)/i)?.[1] || '';
      const originalName = disposition.match(/filename="([^"]*)"/i)?.[1] || disposition.match(/filename=([^;\r\n]+)/i)?.[1];
      if (originalName) {
        const partContentType = headerText.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() || 'application/octet-stream';
        fileUpload = {
          originalName,
          contentType: partContentType,
          buffer: body
        };
      } else if (fieldName === 'folderId') {
        folderId = body.toString('utf8').trim();
      }
    }

    cursor = nextBoundary;
  }

  if (fileUpload) return { ...fileUpload, folderId };
  throw new Error('No file found in upload');
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
    if (!ok) {
      sendJson(response, 401, { ok });
      return;
    }
    const session = sessions.issue();
    sendJson(response, 200, typeof session === 'string' ? { ok, token: session } : { ok, ...session });
  } catch {
    sendJson(response, 400, { ok: false, message: 'Invalid request body' });
  }
}

function handleAdminSession(request, response, sessions) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { ok: false, message: 'Method not allowed' });
    return;
  }

  sendJson(response, sessions.verify(request.headers.authorization || '') ? 200 : 401, {
    ok: sessions.verify(request.headers.authorization || '')
  });
}

function isAdmin(request, sessions) {
  return sessions.verify(request.headers.authorization || '');
}

function getPostId(pathname) {
  const match = pathname.match(/^\/api\/posts\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getPostCommentsId(pathname) {
  const match = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getAccountingEntryId(pathname) {
  const match = pathname.match(/^\/api\/accounting\/entries\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getFileId(pathname) {
  const match = pathname.match(/^\/api\/files\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getFileLinkId(pathname) {
  const match = pathname.match(/^\/api\/files\/([^/]+)\/link$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getRawFileId(pathname) {
  const match = pathname.match(/^\/api\/files\/raw\/([^/]+)(?:\/[^/]*)?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getImageId(pathname) {
  const match = pathname.match(/^\/api\/images\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getRawImageId(pathname) {
  const match = pathname.match(/^\/api\/images\/raw\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getFolderId(pathname) {
  const match = pathname.match(/^\/api\/file-folders\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function publicFolder(folder) {
  return folder ? {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt
  } : null;
}

function publicFile(file) {
  return {
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
    folderId: file.folderId || ''
  };
}

function publicImage(image) {
  return {
    id: image.id,
    originalName: image.originalName,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    uploadedAt: image.uploadedAt,
    path: image.path
  };
}

function publicFolderView(view) {
  return {
    folder: publicFolder(view.folder),
    breadcrumbs: view.breadcrumbs.map(publicFolder),
    folders: view.folders.map(publicFolder),
    files: view.files.map(publicFile)
  };
}

async function handlePosts(request, response, store, sessions, userStore) {
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

  const commentsPostId = getPostCommentsId(url.pathname);
  if (commentsPostId) {
    if (request.method === 'GET') {
      sendJson(response, 200, { comments: store.listComments(commentsPostId) });
      return;
    }

    if (request.method === 'POST') {
      const user = userStore.verify(request.headers.authorization || '');
      if (!user) {
        sendJson(response, 401, { ok: false, message: '请先登录后再评论' });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const comment = store.createComment(commentsPostId, body, user);
        sendJson(response, comment ? 201 : 404, comment ? { comment } : { ok: false, message: 'Post not found' });
      } catch (error) {
        sendJson(response, 400, { ok: false, message: error?.message || 'Invalid request body' });
      }
      return;
    }

    sendJson(response, 405, { ok: false, message: 'Method not allowed' });
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

async function handleUsers(request, response, userStore) {
  const url = new URL(request.url || '/', 'http://localhost');

  if (url.pathname === '/api/users/register' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 201, { ok: true, ...userStore.register(body) });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error?.message || '注册失败' });
    }
    return;
  }

  if (url.pathname === '/api/users/login' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, ...userStore.login(body) });
    } catch (error) {
      sendJson(response, 401, { ok: false, message: error?.message || '登录失败' });
    }
    return;
  }

  if (url.pathname === '/api/users/me' && request.method === 'GET') {
    const user = userStore.verify(request.headers.authorization || '');
    sendJson(response, user ? 200 : 401, user ? { ok: true, user } : { ok: false, message: 'Unauthorized' });
    return;
  }

  sendJson(response, 404, { ok: false, message: 'Not found' });
}

async function handleAdminUsers(request, response, sessions, userStore) {
  const admin = isAdmin(request, sessions);
  if (!admin) {
    sendJson(response, 401, { ok: false, message: 'Unauthorized' });
    return;
  }

  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    sendJson(response, 200, { users: userStore.listUsers() });
    return;
  }

  const match = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (match && request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      const user = userStore.updateUser(decodeURIComponent(match[1]), body);
      sendJson(response, user ? 200 : 404, user ? { user } : { ok: false, message: 'User not found' });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error?.message || 'User update failed' });
    }
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

async function handleFiles(request, response, fileStore, sessions) {
  const url = new URL(request.url || '/', 'http://localhost');
  const rawFileId = getRawFileId(url.pathname);

  if (rawFileId && request.method === 'GET') {
    const file = fileStore.getFileForToken(rawFileId, url.searchParams.get('token') || '');
    if (!file) {
      sendJson(response, 404, { ok: false, message: 'File not found' });
      return;
    }

    response.writeHead(200, createRawFileHeaders(file));
    createReadStream(file.filePath).pipe(response);
    return;
  }

  if (!isAdmin(request, sessions)) {
    sendJson(response, 401, { ok: false, message: 'Unauthorized' });
    return;
  }

  if (url.pathname === '/api/files' && request.method === 'GET') {
    try {
      sendJson(response, 200, publicFolderView(fileStore.listFolder(url.searchParams.get('folderId') || '')));
    } catch (error) {
      sendJson(response, 404, { ok: false, message: error instanceof Error ? error.message : 'Folder not found' });
    }
    return;
  }

  if (url.pathname === '/api/files' && request.method === 'POST') {
    try {
      const body = await readRequestBytes(request, fileUploadLimitBytes);
      const upload = parseMultipartFile(body, request.headers['content-type']);
      const file = await fileStore.saveFile(upload);
      sendJson(response, 201, { file: publicFile(file) });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Upload failed' });
    }
    return;
  }

  const fileLinkId = getFileLinkId(url.pathname);
  if (fileLinkId && request.method === 'POST') {
    const link = fileStore.createAccessLink(fileLinkId);
    sendJson(response, link ? 200 : 404, link ? { link } : { ok: false, message: 'File not found' });
    return;
  }

  const fileId = getFileId(url.pathname);
  if (fileId && request.method === 'DELETE') {
    const removed = await fileStore.removeFile(fileId);
    sendJson(response, removed ? 200 : 404, removed ? { ok: true } : { ok: false, message: 'File not found' });
    return;
  }

  sendJson(response, 404, { ok: false, message: 'Not found' });
}

async function handleImages(request, response, imageStore, sessions) {
  const url = new URL(request.url || '/', 'http://localhost');
  const rawImageId = getRawImageId(url.pathname);

  if (rawImageId && request.method === 'GET') {
    const image = imageStore.getImage(rawImageId);
    if (!image) {
      sendJson(response, 404, { ok: false, message: 'Image not found' });
      return;
    }
    response.writeHead(200, createRawFileHeaders(image));
    createReadStream(image.filePath).pipe(response);
    return;
  }

  if (!isAdmin(request, sessions)) {
    sendJson(response, 401, { ok: false, message: 'Unauthorized' });
    return;
  }

  if (url.pathname === '/api/images' && request.method === 'GET') {
    sendJson(response, 200, { images: imageStore.listImages().map(publicImage) });
    return;
  }

  if (url.pathname === '/api/images' && request.method === 'POST') {
    try {
      const body = await readRequestBytes(request, imageUploadLimitBytes);
      const upload = parseMultipartFile(body, request.headers['content-type']);
      const image = await imageStore.saveImage(upload);
      sendJson(response, 201, { image: publicImage(image) });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Image upload failed' });
    }
    return;
  }

  const imageId = getImageId(url.pathname);
  if (imageId && request.method === 'DELETE') {
    const removed = await imageStore.removeImage(imageId);
    sendJson(response, removed ? 200 : 404, removed ? { ok: true } : { ok: false, message: 'Image not found' });
    return;
  }

  sendJson(response, 404, { ok: false, message: 'Not found' });
}

async function handleFileFolders(request, response, fileStore, sessions) {
  const url = new URL(request.url || '/', 'http://localhost');
  if (!isAdmin(request, sessions)) {
    sendJson(response, 401, { ok: false, message: 'Unauthorized' });
    return;
  }

  if (url.pathname === '/api/file-folders' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      const folder = fileStore.createFolder({
        name: body.name,
        parentId: body.parentId || ''
      });
      sendJson(response, 201, { folder: publicFolder(folder) });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Invalid folder' });
    }
    return;
  }

  const folderId = getFolderId(url.pathname);
  if (!folderId) {
    sendJson(response, 404, { ok: false, message: 'Not found' });
    return;
  }

  if (request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      const folder = fileStore.renameFolder(folderId, body.name);
      sendJson(response, folder ? 200 : 404, folder ? { folder: publicFolder(folder) } : { ok: false, message: 'Folder not found' });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Invalid folder' });
    }
    return;
  }

  if (request.method === 'DELETE') {
    try {
      const removed = fileStore.removeFolder(folderId);
      sendJson(response, removed ? 200 : 404, removed ? { ok: true } : { ok: false, message: 'Folder not found' });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'Folder delete failed' });
    }
    return;
  }

  sendJson(response, 405, { ok: false, message: 'Method not allowed' });
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

const database = await createSqliteDatabase({ dbPath: postDbPath });
const adminSessionStore = createAdminSessionStore({ database });
const sessions = createAdminSessions({ store: adminSessionStore });
const store = await createPostStore({ database });
const userStore = createUserStore({ database });
const accountingStore = createAccountingStore({ database });
const accountingSessions = createAccountingSessions({ store: accountingStore });
const fileStore = createFileStore({ database, uploadDir });
const imageStore = createImageStore({ database, imageDir });

createServer(async (request, response) => {
  if (request.url?.startsWith('/api/admin/session')) {
    handleAdminSession(request, response, sessions);
    return;
  }

  if (request.url?.startsWith('/api/admin/login')) {
    await handleLogin(request, response, sessions);
    return;
  }

  if (request.url?.startsWith('/api/admin/users')) {
    await handleAdminUsers(request, response, sessions, userStore);
    return;
  }

  if (request.url?.startsWith('/api/users')) {
    await handleUsers(request, response, userStore);
    return;
  }

  if (request.url?.startsWith('/api/posts')) {
    await handlePosts(request, response, store, sessions, userStore);
    return;
  }

  if (request.url?.startsWith('/api/accounting')) {
    await handleAccounting(request, response, accountingStore, accountingSessions);
    return;
  }

  if (request.url?.startsWith('/api/images')) {
    await handleImages(request, response, imageStore, sessions);
    return;
  }

  if (request.url?.startsWith('/api/files')) {
    await handleFiles(request, response, fileStore, sessions);
    return;
  }

  if (request.url?.startsWith('/api/file-folders')) {
    await handleFileFolders(request, response, fileStore, sessions);
    return;
  }

  sendStatic(request, response);
}).listen(port, host, async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(`${packageJson.name} server listening on http://${host}:${port}`);
});
