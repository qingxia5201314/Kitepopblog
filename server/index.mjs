import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createAccountingStore } from './accountingStore.mjs';
import { createPostStore } from './postStore.mjs';
import { createRevisionStore } from './revisionStore.mjs';
import { createUserStore } from './userStore.mjs';
import { runAdminAuthMigration } from './migrations/adminAuthMigration.mjs';
import { createLoginRateLimiter } from './loginRateLimit.mjs';
import { writeSecurityEvent } from './securityLog.mjs';
import { createAboutStore } from './aboutStore.mjs';
import { createFileStore } from './fileStore.mjs';
import { createImageStore } from './imageStore.mjs';
import { createPostService } from './services/postService.mjs';
import { createPostRevisionService } from './services/postRevisionService.mjs';
import { createScheduledPublishService } from './services/scheduledPublishService.mjs';
import { createDraftService } from './services/draftService.mjs';
import { startScheduledPublishing } from './jobs/scheduledPublishing.mjs';
import { createFileService } from './services/fileService.mjs';
import { createImageService } from './services/imageService.mjs';
import { postsRoutes } from './routes/posts.mjs';
import { revisionsRoutes } from './routes/revisions.mjs';
import { usersRoutes } from './routes/users.mjs';
import { adminRoutes } from './routes/admin.mjs';
import { accountingRoutes } from './routes/accounting.mjs';
import { filesRoutes } from './routes/files.mjs';
import { imagesRoutes } from './routes/images.mjs';
import { folderRoutes } from './routes/folders.mjs';
import { aboutRoutes } from './routes/about.mjs';
import { renderRobots, renderRss, renderSeoPage, renderSitemap } from './seo.mjs';
import { PUBLIC_DYNAMIC_CACHE, PUBLIC_FEED_CACHE } from './httpCache.mjs';
import { apiNotFound } from './middleware/apiNotFound.mjs';
import { hydrateAuth } from './middleware/auth.mjs';
import { createOriginGuard } from './middleware/origin.mjs';

const supportedNodeEnvironments = new Set(['development', 'test', 'production']);
const nodeEnvironment = process.env.NODE_ENV;
if (!supportedNodeEnvironments.has(nodeEnvironment)) {
  throw new Error('NODE_ENV must be one of: development, test, production');
}

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const postDbPath = process.env.POST_DB_PATH || './data/blog.sqlite';
const uploadDir = resolve(process.env.UPLOAD_DIR || './data/uploads');
const imageDir = resolve(process.env.IMAGE_DIR || './data/images');
const production = nodeEnvironment === 'production';
const siteUrl = String(process.env.SITE_URL || '');
const authConfig = {
  secureCookies: production,
  siteUrl: String(process.env.SITE_URL || ''),
  trustProxy: process.env.TRUST_PROXY === '1'
};
const loginRateLimiter = createLoginRateLimiter();
const originGuard = createOriginGuard({ production, siteUrl });

function requestSiteUrl(c) {
  const configured = String(process.env.SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const url = new URL(c.req.url);
  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  return `${forwardedProto || url.protocol.replace(':', '')}://${forwardedHost || url.host}`;
}

async function readIndexHtml() {
  return readFile('./dist/index.html', 'utf8');
}

function queryOne(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    return statement.step() ? statement.getAsObject() : undefined;
  } finally {
    statement.free();
  }
}

function productionAdminCount(database) {
  const usersTable = queryOne(
    database.db,
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'users'",
  );
  if (!usersTable) return 0;
  return Number(queryOne(database.db, "SELECT COUNT(*) AS count FROM users WHERE permission = 'admin'").count);
}

let database;
let scheduler;
let server;
let cleanupPromise;

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    scheduler?.stop();
    if (server) {
      await new Promise((resolveClose) => {
        try {
          server.close(() => resolveClose());
        } catch {
          resolveClose();
        }
      });
    }
    database?.close();
  })();
  return cleanupPromise;
}

// Initialize stores
try {
database = await createSqliteDatabase({ dbPath: postDbPath });
if (production) {
  const adminCount = productionAdminCount(database);
  if (adminCount !== 1) {
    throw new Error(`Admin auth migration requires exactly one admin; found ${adminCount}`);
  }
}
const userStore = createUserStore({ database });
runAdminAuthMigration({
  database,
  requireSingleAdmin: production
});
const store = await createPostStore({ database });
const revisionStore = createRevisionStore({ database });
const postRevisionService = createPostRevisionService({ database, postStore: store, revisionStore });
const scheduledPublishService = createScheduledPublishService({
  database,
  postStore: store,
  revisionService: postRevisionService
});
const draftService = createDraftService({ postStore: store });
const aboutStore = createAboutStore({ database });
const accountingStore = createAccountingStore({ database });
const fileStore = createFileStore({ database, uploadDir });
const imageStore = createImageStore({ database, imageDir });
const postService = createPostService({ store, revisionService: postRevisionService });
const fileService = createFileService({ fileStore });
const imageService = createImageService({ imageStore });

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto === 'https' && process.env.ENABLE_HSTS === '1') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

// Inject dependencies into context
app.use('*', async (c, next) => {
  c.set('store', store);
  c.set('postService', postService);
  c.set('postRevisionService', postRevisionService);
  c.set('scheduledPublishService', scheduledPublishService);
  c.set('draftService', draftService);
  c.set('userStore', userStore);
  c.set('authConfig', authConfig);
  c.set('loginRateLimiter', loginRateLimiter);
  c.set('securityLog', writeSecurityEvent);
  c.set('aboutStore', aboutStore);
  c.set('accountingStore', accountingStore);
  c.set('fileStore', fileStore);
  c.set('fileService', fileService);
  c.set('imageStore', imageStore);
  c.set('imageService', imageService);
  await next();
});

app.use('/api/*', originGuard);
app.use('/api/*', hydrateAuth);
app.use('/api/*', async (c, next) => {
  await next();
  if (c.get('authSession')) c.header('Cache-Control', 'private, no-store');
});

// API routes
app.route('/api/admin', adminRoutes);
app.route('/api/about', aboutRoutes);
app.route('/api/admin/posts', revisionsRoutes);
app.route('/api/posts', postsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/accounting', accountingRoutes);
app.route('/api/files', filesRoutes);
app.route('/api/images', imagesRoutes);
app.route('/api/file-folders', folderRoutes);
app.all('/api/*', apiNotFound);

// Static file serving with SPA fallback
app.use('/assets/*', serveStatic({ root: './dist' }));
app.get('/favicon.png', serveStatic({ root: './dist' }));
app.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(renderRobots(requestSiteUrl(c)));
});
app.get('/sitemap.xml', (c) => {
  c.header('Content-Type', 'application/xml; charset=utf-8');
  c.header('Cache-Control', PUBLIC_FEED_CACHE);
  return c.body(renderSitemap(requestSiteUrl(c), postService.listPosts({ includeDrafts: false })));
});
app.get('/rss.xml', (c) => {
  c.header('Content-Type', 'application/rss+xml; charset=utf-8');
  c.header('Cache-Control', PUBLIC_FEED_CACHE);
  return c.body(renderRss(requestSiteUrl(c), postService.listPosts({ includeDrafts: false })));
});
app.get('/posts/:slug', async (c) => {
  const post = postService.getPost(c.req.param('slug'));
  if (!post || post.status !== 'published') return c.text('Post not found', 404);
  c.header('Cache-Control', PUBLIC_DYNAMIC_CACHE);
  return c.html(renderSeoPage(await readIndexHtml(), { siteUrl: requestSiteUrl(c), post }));
});
app.get('/', async (c) => {
  c.header('Cache-Control', PUBLIC_DYNAMIC_CACHE);
  return c.html(
    renderSeoPage(await readIndexHtml(), {
      siteUrl: requestSiteUrl(c),
      posts: postService.listPosts({ includeDrafts: false })
    })
  );
});
app.get('*', serveStatic({ root: './dist', rewriteRequestPath: () => '/index.html' }));

server = serve({ fetch: app.fetch, port, hostname: host });
await new Promise((resolveListening, rejectListening) => {
  server.once('listening', resolveListening);
  server.once('error', rejectListening);
});

scheduler = startScheduledPublishing({ service: scheduledPublishService });
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const address = server.address();
const listeningPort = typeof address === 'object' && address ? address.port : port;

const shutdown = async () => {
  await cleanup();
  if (process.connected) process.disconnect();
  process.exitCode = 0;
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
if (typeof process.send === 'function') {
  process.on('message', (message) => {
    if (message?.type === 'shutdown') shutdown();
  });
}
server.on('error', async (error) => {
  console.error(`Server error: ${error?.message || error}`);
  process.exitCode = 1;
  await cleanup();
});
console.log(`${packageJson.name} server listening on http://${host}:${listeningPort}`);
} catch (error) {
  await cleanup();
  console.error(`Server startup failed: ${error?.message || error}`);
  process.exitCode = 1;
}
