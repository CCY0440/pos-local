const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const wasm = fs.readFileSync(path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
initSqlJs({ wasmBinary: wasm }).then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/restaurant.db'));
  const r = db.exec("SELECT COUNT(*) FROM orders WHERE created_at LIKE '2026-05-20%'");
  console.log(JSON.stringify(r));
  db.close();
});