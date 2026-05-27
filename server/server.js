// =============================================
// server.js — 本地 POS 伺服器 (取代 Supabase)
// Express + sql.js (純 JS SQLite，不需要編譯)
// =============================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const initSqlJs = require('sql.js');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.POS_DATA_DIR
  ? path.join(process.env.POS_DATA_DIR, 'data')
  : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'restaurant.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = process.env.POS_PUBLIC_DIR || path.join(__dirname, '..', 'public');

// ── 目錄確保存在 ──────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'product-images'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'store-logos'), { recursive: true });

// ── Middleware ────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

// ── 檔案上傳設定 ──────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const bucket = req.params.bucket;
    cb(null, path.join(UPLOADS_DIR, bucket));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Session 管理 (記憶體，重啟會清空) ─────────
const sessions = new Map(); // token → { userId, email }

function getSession(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  // 先查記憶體
  if (sessions.has(token)) return sessions.get(token);
  // 再查資料庫
  const row = dbGet('SELECT * FROM sessions WHERE token = ?', [token]);
  if (row) {
    sessions.set(token, { userId: row.user_id, email: row.email });
    return sessions.get(token);
  }
  return null;
}

// ── SSE 即時通知 ──────────────────────────────
const sseClients = new Map(); // storeId → Set of res objects

function sendSSE(storeId, event, payload) {
  const clients = sseClients.get(storeId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify({ event, ...payload })}\n\n`;
  clients.forEach(res => {
    try { res.write(msg); } catch (e) { clients.delete(res); }
  });
}

// ── 資料庫 ─────────────────────────────────────
let db;

function saveDB() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  } catch (e) {
    console.error('DB 儲存失敗:', e.message);
  }
}

function dbRun(sql, params = []) {
  db.run(sql, params);
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      description TEXT,
      logo_url TEXT,
      is_open INTEGER DEFAULT 1,
      allow_addon INTEGER DEFAULT 0,
      is_initialized INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      category_id TEXT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT,
      image_url TEXT,
      is_available INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS product_options (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      choices TEXT,
      required INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      table_name TEXT,
      status TEXT DEFAULT 'pending',
      total_price INTEGER DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      is_paid INTEGER DEFAULT 0,
      note TEXT,
      daily_number INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      product_price INTEGER,
      quantity INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      options TEXT
    );
    CREATE TABLE IF NOT EXISTS tables_list (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS store_staff (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      name TEXT,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  saveDB();
  console.log('✅ 資料表建立完成');
}

// ── 輔助函式 ──────────────────────────────────
function parseRow(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && (k === 'options' || k === 'choices')) {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    } else if (typeof v === 'number' && (k === 'is_open' || k === 'is_available' || k === 'is_paid' || k === 'is_initialized' || k === 'allow_addon' || k === 'required')) {
      out[k] = v === 1;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseRows(rows) {
  return rows.map(parseRow);
}

function getOrdersWithItems(whereSql, params) {
  const orders = dbAll(`SELECT * FROM orders WHERE ${whereSql} ORDER BY created_at DESC`, params);
  return parseRows(orders).map(order => {
    const items = dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    return { ...order, order_items: parseRows(items) };
  });
}

function getNextDailyNumber(storeId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = dbGet(
    `SELECT MAX(daily_number) as max_num FROM orders WHERE store_id = ? AND date(created_at) = ?`,
    [storeId, today]
  );
  return (row?.max_num || 0) + 1;
}

// ════════════════════════════════════════════════
// AUTH 路由
// ════════════════════════════════════════════════

// 註冊 (storeName 選填，可之後再建立 store)
app.post('/auth/register', async (req, res) => {
  const { email, password, storeName } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: '缺少必要欄位' });

  const existing = dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 8);
  const userId = uuidv4();
  dbRun('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [userId, email, hash]);
  saveDB();

  // 如果有帶 storeName，同時建立 store
  if (storeName) {
    const storeId = uuidv4();
    dbRun('INSERT INTO stores (id, owner_id, name, allow_addon) VALUES (?, ?, ?, 0)', [storeId, userId, storeName]);
  }

  const token = uuidv4();
  sessions.set(token, { userId, email });
  dbRun('INSERT OR REPLACE INTO sessions (token, user_id, email) VALUES (?, ?, ?)', [token, userId, email]);

  res.json({ data: { user: { id: userId, email }, session: { access_token: token } }, error: null });
});

// 登入
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = dbGet('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).json({ error: 'Invalid login credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid login credentials' });

  const token = uuidv4();
  sessions.set(token, { userId: user.id, email: user.email });
  dbRun('INSERT OR REPLACE INTO sessions (token, user_id, email) VALUES (?, ?, ?)', [token, user.id, user.email]);
  saveDB();

  res.json({ data: { user: { id: user.id, email: user.email }, session: { access_token: token } }, error: null });
});

// 取得目前使用者
app.get('/auth/user', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ data: { user: null }, error: null });
  res.json({ data: { user: { id: session.userId, email: session.email } }, error: null });
});

// 登出
app.post('/auth/logout', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  sessions.delete(token);
  dbRun('DELETE FROM sessions WHERE token = ?', [token]); res.json({
    error: null
  });
});

// 修改密碼
app.post('/auth/update-password', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: '未登入' });
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '缺少密碼' });
  const hash = await bcrypt.hash(password, 8);
  dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hash, session.userId]);
  res.json({ error: null });
});

app.post('/auth/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword)
    return res.status(400).json({ error: '缺少必要欄位' });

  const user = dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (!user) return res.status(404).json({ error: '找不到此 Email 的帳號' });

  const hash = await bcrypt.hash(newPassword, 10);
  dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);

  res.json({ error: null });
});

// ════════════════════════════════════════════════
// STORES 路由
// ════════════════════════════════════════════════

// 取得店家 (有 token 用 owner，沒有 token 用 id query param，供顧客頁使用)
app.get('/api/stores', (req, res) => {
  const session = getSession(req);
  const { id, owner_id } = req.query;

  let store;
  if (id) {
    // 公開查詢 (顧客頁)
    store = dbGet('SELECT * FROM stores WHERE id = ?', [id]);
  } else if (owner_id) {
    // 直接信任 owner_id，本地伺服器不需要嚴格驗證
    store = dbGet('SELECT * FROM stores WHERE owner_id = ?', [owner_id]);
  } else if (session) {
    store = dbGet('SELECT * FROM stores WHERE owner_id = ?', [session.userId]);
  } else {
    return res.status(401).json({ error: '未登入' });
  }

  res.json({ data: parseRow(store), error: null });
});

app.get('/api/stores/:id', (req, res) => {
  const store = dbGet('SELECT * FROM stores WHERE id = ?', [req.params.id]);
  if (!store) return res.status(404).json({ data: null, error: { message: '找不到店家' } });
  res.json({ data: parseRow(store), error: null });
});

// 建立店家 (auth.js 註冊後呼叫)
app.post('/api/stores', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: '未登入' });

  const items = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];
  items.forEach(s => {
    const id = uuidv4();
    const ownerId = s.owner_id || session.userId;
    dbRun('INSERT INTO stores (id, owner_id, name, allow_addon) VALUES (?, ?, ?, 0)', [id, ownerId, s.name]);
    inserted.push({ id, owner_id: ownerId, name: s.name });
  });
  res.json({ data: inserted, error: null });
});

app.patch('/api/stores/me', (req, res) => {
  const session = getSession(req);

  // 從 body 的 filters 或 session 取得 owner_id
  const ownerId = req.body?.filters?.eq_owner_id || session?.userId;
  if (!ownerId) return res.status(401).json({ error: '未登入' });

  const store = dbGet('SELECT id FROM stores WHERE owner_id = ?', [ownerId]);
  if (!store) return res.status(404).json({ error: '找不到店家' });

  const fields = { ...req.body.data || req.body };
  delete fields.filters;
  ['is_open', 'allow_addon', 'is_initialized'].forEach(k => {
    if (k in fields) fields[k] = fields[k] ? 1 : 0;
  });
  if (Object.keys(fields).length === 0) return res.json({ error: null });
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  dbRun(`UPDATE stores SET ${sets} WHERE id = ?`, [...Object.values(fields), store.id]);
  res.json({ error: null });
});

app.patch('/api/stores/:id', (req, res) => {
  const fields = { ...req.body };
  // boolean 轉換
  ['is_open', 'allow_addon', 'is_initialized'].forEach(k => {
    if (k in
      fields) fields[k] = fields[k] ? 1 : 0;
  });
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  dbRun(`UPDATE stores SET ${sets} WHERE id = ?`, [...Object.values(fields), req.params.id]);
  res.json({ error: null });
});

// ════════════════════════════════════════════════
// CATEGORIES 路由
// ════════════════════════════════════════════════

app.get('/api/categories', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: '缺少 store_id' });
  const rows = dbAll('SELECT * FROM categories WHERE store_id = ? ORDER BY sort_order ASC', [store_id]);
  res.json({ data: parseRows(rows), error: null });
});

app.post('/api/categories', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];
  items.forEach(item => {
    const id = uuidv4();
    const store_id = item.store_id || null;
    const name = item.name || '';
    const sort_order = item.sort_order ?? 0;
    dbRun('INSERT INTO categories (id, store_id, name, sort_order) VALUES (?, ?, ?, ?)',
      [id, store_id, name, sort_order]);
    inserted.push({ id, store_id, name, sort_order });
  });
  res.json({ data: inserted, error: null });
});

app.patch('/api/categories/:id', (req, res) => {
  const fields = req.body;
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  dbRun(`UPDATE categories SET ${sets} WHERE id = ?`, [...Object.values(fields), req.params.id]);
  res.json({ error: null });
});

app.delete('/api/categories', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: '缺少 store_id' });
  dbRun('DELETE FROM products WHERE store_id = ?', [store_id]);
  dbRun('DELETE FROM categories WHERE store_id = ?', [store_id]);
  res.json({ error: null });
});

app.delete('/api/categories/:id', (req, res) => {
  dbRun('DELETE FROM products WHERE category_id = ?', [req.params.id]);
  dbRun('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ error: null });
});

// ════════════════════════════════════════════════
// PRODUCTS 路由
// ════════════════════════════════════════════════

app.get('/api/products', (req, res) => {
  const { store_id, is_available } = req.query;
  if (!store_id) return res.status(400).json({ error: '缺少 store_id' });

  let sql = 'SELECT * FROM products WHERE store_id = ?';
  const params = [store_id];
  if (is_available === 'true') { sql += ' AND is_available = 1'; }
  sql += ' ORDER BY name ASC';

  const rows = dbAll(sql, params);
  res.json({ data: parseRows(rows), error: null });
});

app.post('/api/products', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];
  items.forEach(item => {
    const id = uuidv4();
    const store_id = item.store_id || null;
    const category_id = item.category_id || null;
    const name = item.name || '';
    const price = item.price ?? 0;
    const description = item.description || null;
    const image_url = item.image_url || null;
    const is_available = item.is_available !== false ? 1 : 0;
    dbRun(
      'INSERT INTO products (id, store_id, category_id, name, price, description, image_url, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, store_id, category_id, name, price, description, image_url, is_available]
    );
    inserted.push({ id, store_id, category_id, name, price, description, image_url, is_available: is_available === 1 });
  });
  res.json({ data: inserted, error: null });
});

app.patch('/api/products/:id', (req, res) => {
  const body = { ...req.body };
  if ('is_available' in body) body.is_available = body.is_available ? 1 : 0;
  const sets = Object.keys(body).map(k => `${k} = ?`).join(', ');
  dbRun(`UPDATE products SET ${sets} WHERE id = ?`, [...Object.values(body), req.params.id]);
  res.json({ error: null });
});

app.delete('/api/products/:id', (req, res) => {
  dbRun('DELETE FROM product_options WHERE product_id = ?', [req.params.id]);
  dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ error: null });
});

// ════════════════════════════════════════════════
// PRODUCT OPTIONS 路由
// ════════════════════════════════════════════════

app.get('/api/product_options', (req, res) => {
  const { store_id, product_id } = req.query;
  let sql = 'SELECT * FROM product_options WHERE 1=1';
  const params = [];
  if (store_id) { sql += ' AND store_id = ?'; params.push(store_id); }
  if (product_id) { sql += ' AND product_id = ?'; params.push(product_id); }
  sql += ' ORDER BY sort_order ASC';
  const rows = dbAll(sql, params);
  res.json({ data: parseRows(rows), error: null });
});

app.post('/api/product_options', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];
  items.forEach(opt => {
    const id = opt.id || uuidv4();
    dbRun(
      'INSERT OR REPLACE INTO product_options (id, store_id, product_id, label, type, choices, required, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, opt.store_id, opt.product_id, opt.label, opt.type, JSON.stringify(opt.choices || []), opt.required ? 1 : 0, opt.sort_order || 0]
    );
    inserted.push({ id, ...opt });
  });
  res.json({ data: inserted, error: null });
});

app.delete('/api/product_options', (req, res) => {
  const { product_id } = req.query;
  if (!product_id) return res.status(400).json({ error: '缺少 product_id' });
  dbRun('DELETE FROM product_options WHERE product_id = ?', [product_id]);
  res.json({ error: null });
});

// ════════════════════════════════════════════════
// ORDERS 路由
// ════════════════════════════════════════════════

app.get('/api/orders', (req, res) => {
  const { store_id, gte_created_at, lte_created_at, id_in } = req.query;
  if (!store_id && !id_in) return res.status(400).json({ error: '缺少參數' });

  let whereParts = [];
  const params = [];

  if (store_id) { whereParts.push('store_id = ?'); params.push(store_id); }
  if (gte_created_at) { whereParts.push("created_at >= ?"); params.push(gte_created_at); }
  if (lte_created_at) { whereParts.push("created_at <= ?"); params.push(lte_created_at); }
  if (id_in) {
    const ids = id_in.split(',').map(id => `'${id.trim()}'`).join(',');
    whereParts.push(`id IN (${ids})`);
  }

  const where = whereParts.join(' AND ') || '1=1';
  const orders = getOrdersWithItems(where, params);
  res.json({ data: orders, error: null });
});

app.get('/api/orders/:id', (req, res) => {
  const order = dbGet('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.json({ data: null, error: { message: '找不到訂單' } });
  const items = dbAll('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
  res.json({ data: { ...parseRow(order), order_items: parseRows(items) }, error: null });
});

app.post('/api/orders', (req, res) => {
  const { store_id, table_name, status = 'pending', total_price, payment_method = 'cash', is_paid = false, note } = req.body;
  const id = uuidv4();
  const daily_number = getNextDailyNumber(store_id);
  const created_at = new Date().toISOString();

  dbRun(
    'INSERT INTO orders (id, store_id, table_name, status, total_price, payment_method, is_paid, note, daily_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, store_id, table_name, status, total_price, payment_method, is_paid ? 1 : 0, note || null, daily_number, created_at, created_at]
  );

  const newOrder = parseRow(dbGet('SELECT * FROM orders WHERE id = ?', [id]));

  // SSE 通知
  setTimeout(() => sendSSE(store_id, 'INSERT', { table: 'orders', new: newOrder }), 100);

  res.json({ data: newOrder, error: null });
});

app.patch('/api/orders/:id', (req, res) => {
  const body = { ...req.body };
  if ('is_paid' in body) body.is_paid = body.is_paid ? 1 : 0;
  body.updated_at = new Date().toISOString();

  const sets = Object.keys(body).map(k => `${k} = ?`).join(', ');
  dbRun(`UPDATE orders SET ${sets} WHERE id = ?`, [...Object.values(body), req.params.id]);

  const updated = parseRow(dbGet('SELECT * FROM orders WHERE id = ?', [req.params.id]));
  if (updated) sendSSE(updated.store_id, 'UPDATE', { table: 'orders', new: updated });

  res.json({ data: updated, error: null });
});

// ════════════════════════════════════════════════
// ORDER ITEMS 路由
// ════════════════════════════════════════════════

app.post('/api/order_items', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  items.forEach(item => {
    dbRun(
      'INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity, subtotal, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), item.order_id, item.product_id || null, item.product_name, item.product_price || 0, item.quantity, item.subtotal, item.options ? JSON.stringify(item.options) : null]
    );
  });
  res.json({ data: items, error: null });
});

// ════════════════════════════════════════════════
// TABLES (桌號) 路由
// ════════════════════════════════════════════════

app.get('/api/tables', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: '缺少 store_id' });
  const rows = dbAll(`SELECT * FROM tables_list WHERE store_id = ? ORDER BY CAST(REPLACE(table_name, "桌號", "") AS INTEGER) ASC`, [store_id]);
  res.json({ data: parseRows(rows), error: null });
});

app.post('/api/tables', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];
  items.forEach(t => {
    const id = uuidv4();
    dbRun('INSERT INTO tables_list (id, store_id, table_name) VALUES (?, ?, ?)', [id, t.store_id, t.table_name]);
    inserted.push({ id, store_id: t.store_id, table_name: t.table_name });
  });
  res.json({ data: inserted, error: null });
});

app.delete('/api/tables/:id', (req, res) => {
  dbRun('DELETE FROM tables_list WHERE id = ?', [req.params.id]);
  res.json({ error: null });
});

app.delete('/api/tables', (req, res) => {
  const { store_id, id_in } = req.query;
  if (id_in) {
    const ids = id_in.split(',').map(id => `'${id.trim()}'`).join(',');
    dbRun(`DELETE FROM tables_list WHERE id IN (${ids})`);
    return res.json({ error: null });
  }
  if (!store_id) return res.status(400).json({ error: '缺少 store_id' });
  dbRun('DELETE FROM tables_list WHERE store_id = ?', [store_id]);
  res.json({ error: null });
});

// ════════════════════════════════════════════════
// STORE STAFF 路由
// ════════════════════════════════════════════════

app.get('/api/store_staff', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: '缺少 store_id' });
  const rows = dbAll('SELECT * FROM store_staff WHERE store_id = ? ORDER BY created_at ASC', [store_id]);
  res.json({ data: parseRows(rows), error: null });
});

app.post('/api/store_staff', (req, res) => {
  const { store_id, name, email, role = 'staff' } = req.body;
  const id = uuidv4();
  dbRun('INSERT INTO store_staff (id, store_id, name, email, role) VALUES (?, ?, ?, ?, ?)', [id, store_id, name || null, email, role]);
  res.json({ data: { id, store_id, name, email, role }, error: null });
});

app.delete('/api/store_staff/:id', (req, res) => {
  dbRun('DELETE FROM store_staff WHERE id = ?', [req.params.id]);
  res.json({ error: null });
});

// ════════════════════════════════════════════════
// STORAGE 路由
// ════════════════════════════════════════════════

app.post('/storage/:bucket', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '沒有收到檔案' });
  const bucket = req.params.bucket;
  const intendedPath = req.body.filePath;

  if (intendedPath) {
    const targetDir = path.join(UPLOADS_DIR, bucket, path.dirname(intendedPath));
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(UPLOADS_DIR, bucket, intendedPath);
    fs.renameSync(req.file.path, targetPath);
    res.json({ data: { path: `${bucket}/${intendedPath}` }, error: null });
  } else {
    res.json({ data: { path: `${bucket}/${req.file.filename}` }, error: null });
  }
});

app.delete('/storage/:bucket', (req, res) => {
  const { paths } = req.body;
  (paths || []).forEach(p => {
    const full = path.join(UPLOADS_DIR, p.replace(/^[^/]+\//, ''));
    try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (e) { }
  });
  res.json({ error: null });
});

// ════════════════════════════════════════════════
// SSE 即時通知
// ════════════════════════════════════════════════

app.get('/api/realtime/events', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(store_id)) sseClients.set(store_id, new Set());
  sseClients.get(store_id).add(res);

  res.write('data: {"event":"connected"}\n\n');

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = sseClients.get(store_id);
    if (clients) clients.delete(res);
  });
});

app.get("/api/popular-products", (req, res) => { const store_id = req.query.store_id; if (!store_id) return res.json({ data: [], error: null }); const rows = dbAll("SELECT product_id, product_name, SUM(quantity) as total FROM order_items WHERE product_id IN (SELECT id FROM products WHERE store_id = ? AND is_available = 1) GROUP BY product_id ORDER BY total DESC LIMIT 5", [store_id]); res.json({ data: rows, error: null }); });
app.get("/api/server-ip", async (req, res) => { const ip = await getLocalIP(); res.json({ ip, port: PORT }); });
// ── SPA fallback ──────────────────────────────
app.get('*', (req, res) => {
  const file = path.join(PUBLIC_DIR, req.path);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.sendFile(file);
  } else {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
});

// ════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════

function getLocalIP() {
  try {
    const dgram = require('dgram');
    const socket = dgram.createSocket('udp4');
    socket.connect(53, '1.1.1.1', () => { });
    const ip = socket.address ? socket.address().address : null;
    socket.close();
    if (ip && ip !== '0.0.0.0') return ip;
  } catch (e) { }
  return '192.168.137.1';
}

app.get('/api/server-ip', async (req, res) => {
  const ip = await getLocalIP();
  res.json({ ip, port: PORT });
});

async function start() {
  console.log('🔄 初始化資料庫...');
  const wasmPath = process.env.POS_WASM_PATH
    || path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
const SQL = await initSqlJs({ wasmBinary });

  if (fs.existsSync(DB_FILE)) {
    const buf = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buf);
    console.log('✅ 載入現有資料庫');
  } else {
    db = new SQL.Database();
    console.log('✅ 建立新資料庫');
  }

  createTables();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 POS 伺服器已啟動！`);
    console.log(`   本機：  http://localhost:${PORT}`);
    console.log(`   區網：  http://<你的IP>:${PORT}`);
    console.log(`\n📱 顧客掃 QR Code 請用區網 IP`);
    console.log(`💾 資料庫位置：${DB_FILE}\n`);
  });
}

if (require.main === module) {
  start().catch(console.error);
} else {
  module.exports = { start, app, PORT };
}
