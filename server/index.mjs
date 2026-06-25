import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createAdminSessionStore, createAdminSessions } from './adminSession.mjs';
import { createAccountingSessions } from './accountingSession.mjs';
import { createAccountingStore } from './accountingStore.mjs';
import { createPostStore } from './postStore.mjs';
import { createUserStore } from './userStore.mjs';
import { createFileStore } from './fileStore.mjs';
import { createImageStore } from './imageStore.mjs';
import { createPostService } from './services/postService.mjs';
import { createFileService } from './services/fileService.mjs';
import { createImageService } from './services/imageService.mjs';
import { postsRoutes } from './routes/posts.mjs';
import { usersRoutes } from './routes/users.mjs';
import { adminRoutes } from './routes/admin.mjs';
import { accountingRoutes } from './routes/accounting.mjs';
import { filesRoutes } from './routes/files.mjs';
import { imagesRoutes } from './routes/images.mjs';
import { folderRoutes } from './routes/folders.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const postDbPath = process.env.POST_DB_PATH || './data/blog.sqlite';
const uploadDir = resolve(process.env.UPLOAD_DIR || './data/uploads');
const imageDir = resolve(process.env.IMAGE_DIR || './data/images');

// Initialize stores
const database = await createSqliteDatabase({ dbPath: postDbPath });
const adminSessionStore = createAdminSessionStore({ database });
const sessions = createAdminSessions({ store: adminSessionStore });
const store = await createPostStore({ database });
const userStore = createUserStore({ database });
const accountingStore = createAccountingStore({ database });
const accountingSessions = createAccountingSessions({ store: accountingStore });
const fileStore = createFileStore({ database, uploadDir });
const imageStore = createImageStore({ database, imageDir });
const postService = createPostService({ store });
const fileService = createFileService({ fileStore });
const imageService = createImageService({ imageStore });

const app = new Hono();

// Inject dependencies into context
app.use('*', async (c, next) => {
  c.set('sessions', sessions);
  c.set('store', store);
  c.set('postService', postService);
  c.set('userStore', userStore);
  c.set('accountingStore', accountingStore);
  c.set('accountingSessions', accountingSessions);
  c.set('fileStore', fileStore);
  c.set('fileService', fileService);
  c.set('imageStore', imageStore);
  c.set('imageService', imageService);
  c.set('adminPassword', adminPassword);
  await next();
});

// API routes
app.route('/api/admin', adminRoutes);
app.route('/api/posts', postsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/accounting', accountingRoutes);
app.route('/api/files', filesRoutes);
app.route('/api/images', imagesRoutes);
app.route('/api/file-folders', folderRoutes);

// Static file serving with SPA fallback
app.use('/assets/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ root: './dist', rewriteRequestPath: () => '/index.html' }));

serve({ fetch: app.fetch, port, hostname: host }, async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(`${packageJson.name} server listening on http://${host}:${port}`);
});
