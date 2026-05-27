const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const wasm = fs.readFileSync(path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
initSqlJs({ wasmBinary: wasm }).then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/restaurant.db'));
  db.run("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id = 'bb8e96b4-bc83-4daa-b96c-367212faec36' AND created_at LIKE '2026-05-19%')");
  db.run("DELETE FROM orders WHERE store_id = 'bb8e96b4-bc83-4daa-b96c-367212faec36' AND created_at LIKE '2026-05-19%'");
  const d = db.export();
  fs.writeFileSync('./data/restaurant.db', Buffer.from(d));
  db.close();
  console.log('完成');
});