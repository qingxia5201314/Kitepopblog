import { createId, sortPostsByDate, today, uniqueSlug } from './blogModel.mjs';
import { seedPosts } from './seedPosts.mjs';
import { createSqliteDatabase } from './sqliteDatabase.mjs';

function rowToPost(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: JSON.parse(row.tags_json),
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cover: row.cover,
    coverImage: row.cover_image || ''
  };
}

function rowToComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    nickname: row.nickname,
    role: row.role || '',
    content: row.content,
    createdAt: row.created_at
  };
}

function postToParams(post) {
  return [
    post.id,
    post.slug,
    post.title,
    post.summary,
    post.category,
    JSON.stringify(post.tags ?? []),
    post.content,
    post.status,
    post.createdAt,
    post.updatedAt,
    post.cover,
    post.coverImage ?? ''
  ];
}

function selectAll(db) {
  const rows = db.exec('SELECT * FROM posts');
  if (rows.length === 0) return [];

  const { columns, values } = rows[0];
  return values.map((value) => {
    const row = Object.fromEntries(columns.map((column, index) => [column, value[index]]));
    return rowToPost(row);
  });
}

function initSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cover TEXT NOT NULL,
      cover_image TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function selectComments(db, postId) {
  const rows = db.exec('SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at DESC', [postId]);
  if (rows.length === 0) return [];
  const { columns, values } = rows[0];
  return values.map((value) => rowToComment(Object.fromEntries(columns.map((column, index) => [column, value[index]]))));
}

function insertPost(db, post) {
  db.run(
    `INSERT INTO posts (
      id, slug, title, summary, category, tags_json, content, status, created_at, updated_at, cover, cover_image
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    postToParams(post)
  );
}

export async function createPostStore({ dbPath = './data/blog.sqlite', database } = {}) {
  const sqlite = database ?? (await createSqliteDatabase({ dbPath }));
  const { db } = sqlite;

  initSchema(db);

  if (selectAll(db).length === 0) {
    seedPosts.forEach((post) => insertPost(db, post));
    sqlite.persist();
  }

  return {
    list({ includeDrafts = false } = {}) {
      return sortPostsByDate(selectAll(db).filter((post) => includeDrafts || post.status === 'published'));
    },

    get(idOrSlug) {
      return selectAll(db).find((post) => post.id === idOrSlug || post.slug === idOrSlug);
    },

    create(draft) {
      const posts = selectAll(db);
      const now = today();
      const post = {
        ...draft,
        id: createId(),
        slug: uniqueSlug(draft.title, posts),
        createdAt: now,
        updatedAt: now
      };

      insertPost(db, post);
      sqlite.persist();
      return post;
    },

    update(id, patch) {
      const posts = selectAll(db);
      const current = posts.find((post) => post.id === id);
      if (!current) return undefined;

      const updated = {
        ...current,
        ...patch,
        slug: patch.title ? uniqueSlug(patch.title, posts, id) : current.slug,
        updatedAt: today()
      };

      db.run(
        `UPDATE posts SET
          slug = ?, title = ?, summary = ?, category = ?, tags_json = ?, content = ?,
          status = ?, updated_at = ?, cover = ?, cover_image = ?
        WHERE id = ?`,
        [
          updated.slug,
          updated.title,
          updated.summary,
          updated.category,
          JSON.stringify(updated.tags ?? []),
          updated.content,
          updated.status,
          updated.updatedAt,
          updated.cover,
          updated.coverImage ?? '',
          id
        ]
      );
      sqlite.persist();
      return updated;
    },

    remove(id) {
      const existing = this.get(id);
      if (!existing) return false;
      db.run('DELETE FROM posts WHERE id = ?', [id]);
      sqlite.persist();
      return true;
    },

    listComments(idOrSlug) {
      const post = this.get(idOrSlug);
      if (!post) return [];
      return selectComments(db, post.id);
    },

    createComment(idOrSlug, draft, user) {
      const post = this.get(idOrSlug);
      if (!post) return undefined;
      const content = String(draft.content || '').trim();
      if (!content) throw new Error('Comment content is required');
      const comment = {
        id: createId(),
        postId: post.id,
        nickname: String(user?.nickname || draft.nickname || '匿名访客').trim() || '匿名访客',
        role: String(user?.role || draft.role || '读者').trim() || '读者',
        content,
        createdAt: today()
      };
      db.run(
        `INSERT INTO post_comments (id, post_id, nickname, role, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [comment.id, comment.postId, comment.nickname, comment.role, comment.content, comment.createdAt]
      );
      sqlite.persist();
      return comment;
    }
  };
}
