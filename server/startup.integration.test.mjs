import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const START_TIMEOUT_MS = 8_000;

let children;
let tempDir;

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function seedUsersDatabase(dbPath, adminCount) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'reader',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  for (let index = 1; index <= adminCount; index += 1) {
    db.run(
      `INSERT INTO users (id, username, password_hash, nickname, role, permission, created_at, updated_at)
       VALUES (?, ?, 'unused-hash', ?, 'admin', 'admin', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z')`,
      [`admin-${index}`, `admin-${index}`, `Admin ${index}`],
    );
  }
  await writeFile(dbPath, Buffer.from(db.export()));
  db.close();
}

function childEnvironment(dbPath, overrides = {}) {
  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    NODE_ENV: 'production',
    SITE_URL: 'https://blog.example',
    TRUST_PROXY: '0',
    HOST: '127.0.0.1',
    PORT: '0',
    POST_DB_PATH: dbPath,
    UPLOAD_DIR: join(tempDir, 'uploads'),
    IMAGE_DIR: join(tempDir, 'images'),
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return env;
}

function spawnServer(env) {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  const output = { stderr: '', stdout: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output.stderr += chunk;
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return { child, output };
}

function waitForExit(child, timeoutMs = START_TIMEOUT_MS) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`server child did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    const onExit = (code, signal) => {
      cleanup();
      resolve({ code, signal });
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
    };
    child.once('exit', onExit);
  });
}

function waitForListening(child, output, timeoutMs = START_TIMEOUT_MS) {
  if (output.stdout.includes('server listening on')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`server did not listen within ${timeoutMs}ms`)), timeoutMs);
    const onData = () => {
      if (output.stdout.includes('server listening on')) finish();
    };
    const onExit = () => finish(new Error(`server exited before listening: ${output.stderr}`));
    const finish = (error) => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve();
    };
    child.stdout.on('data', onData);
    child.once('exit', onExit);
    onData();
  });
}

async function stopChild(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return waitForExit(child);
  if (process.platform === 'win32' && child.connected) {
    child.send({ type: 'shutdown', signal });
    try {
      return await waitForExit(child, 3_000);
    } catch {
      child.kill('SIGTERM');
      return waitForExit(child);
    }
  }
  child.kill(signal);
  return waitForExit(child);
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { port: server.address().port, server };
}

async function migrationCount(dbPath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(dbPath));
  const result = db.exec(
    "SELECT COUNT(*) AS count FROM schema_migrations WHERE name = '2026-07-15-admin-auth-cookie'",
  );
  const count = result[0]?.values[0]?.[0];
  db.close();
  return count;
}

async function storedAdminCount(dbPath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(dbPath));
  const result = db.exec("SELECT COUNT(*) AS count FROM users WHERE permission = 'admin'");
  const count = result[0]?.values[0]?.[0];
  db.close();
  return count;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-startup-'));
  children = new Set();
});

afterEach(async () => {
  await Promise.all([...children].map((child) => stopChild(child).catch(() => undefined)));
  await rm(tempDir, { force: true, recursive: true });
});

describe('standalone server startup', () => {
  it('starts production with exactly one admin and repeats the migration idempotently', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    await seedUsersDatabase(dbPath, 1);

    for (const signal of ['SIGTERM', 'SIGINT']) {
      const { child, output } = spawnServer(childEnvironment(dbPath));
      await waitForListening(child, output);
      expect(await stopChild(child, signal)).toEqual({ code: 0, signal: null });
      expect(output.stderr).not.toContain('UV_HANDLE_CLOSING');
    }

    expect(await migrationCount(dbPath)).toBe(1);
    await expect(rm(dbPath)).resolves.toBeUndefined();
  }, 30_000);

  it.each([0, 2])('rejects production with %i admins before changing the database', async (adminCount) => {
    const dbPath = join(tempDir, `admins-${adminCount}.sqlite`);
    await seedUsersDatabase(dbPath, adminCount);
    const beforeHash = sha256(await readFile(dbPath));
    const { child, output } = spawnServer(childEnvironment(dbPath));

    const result = await waitForExit(child);

    expect(result.code).not.toBe(0);
    expect(output.stderr).toContain('requires exactly one admin');
    expect(sha256(await readFile(dbPath))).toBe(beforeHash);
    expect(await storedAdminCount(dbPath)).toBe(adminCount);
    await expect(rm(dbPath)).resolves.toBeUndefined();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'prodution'],
  ])('rejects %s NODE_ENV before opening the database', async (_label, nodeEnv) => {
    const dbPath = join(tempDir, 'must-not-exist.sqlite');
    const { child, output } = spawnServer(childEnvironment(dbPath, { NODE_ENV: nodeEnv }));

    const result = await waitForExit(child, 3_000);

    expect(result.code).not.toBe(0);
    expect(output.stderr).toContain('NODE_ENV');
    await expect(readFile(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('validates production SITE_URL before opening the database', async () => {
    const dbPath = join(tempDir, 'must-not-exist.sqlite');
    const { child, output } = spawnServer(childEnvironment(dbPath, { SITE_URL: 'not a URL' }));

    const result = await waitForExit(child);

    expect(result.code).not.toBe(0);
    expect(output.stderr).toContain('SITE_URL');
    await expect(readFile(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('exits promptly and releases its database when the listen port is occupied', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    await seedUsersDatabase(dbPath, 1);
    const { port, server } = await reservePort();
    const { child, output } = spawnServer(childEnvironment(dbPath, { PORT: String(port) }));

    try {
      const result = await waitForExit(child);
      expect(result.code).not.toBe(0);
      expect(output.stderr).toContain('EADDRINUSE');
      expect(output.stderr).not.toContain('UV_HANDLE_CLOSING');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    expect(await migrationCount(dbPath)).toBe(1);
    await expect(rm(dbPath)).resolves.toBeUndefined();
  });
});
