const fs = require('fs');
const initSqlJs = require('./node_modules/sql.js');
const STORE_ID = 'bb8e96b4-bc83-4daa-b96c-367212faec36';
const DB_PATH = './data/restaurant.db';
const PRODUCTS = [
  { id: '909f6ee5-7b93-4575-95eb-dcdf30020f0a', name: '松露帕瑪森脆薯', price: 180 },
  { id: '22a71b27-aea4-499e-a69b-d8bd364b968e', name: '香蒜白酒炒蛤蜊', price: 250 },
  { id: '10eac186-ee18-48a4-ad6f-1e21587431af', name: '煙燻鮭魚油醋沙拉', price: 220 },
  { id: '39d7061a-c8d0-4f4c-be23-108cdb23094b', name: '法式經典洋蔥濃湯', price: 160 },
  { id: 'fa8d3268-e4fe-49cf-ad55-6a8c14d8d54e', name: '瑪格麗特披薩', price: 280 },
  { id: '25b03503-af3b-4fbd-bb95-e42551a8da51', name: '義式臘腸雙拼披薩', price: 320 },
  { id: 'b56a2fff-1eb0-4c1c-b804-35e54fe9b7d3', name: '奶油明太子海鮮麵', price: 320 },
  { id: '1d185018-96d3-475b-ab87-035545d6df0b', name: '清炒蒜香培根義大利麵', price: 260 },
  { id: 'abf6dd4c-85a6-4b41-acb5-813c7bc451fb', name: '炙烤翼板牛排', price: 480 },
  { id: '6522d7e5-9bf2-41bc-aeda-713cff2ec31a', name: '經典提拉米蘇', price: 150 },
];
const TABLES = ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2'];
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
function isWeekday(date) { const day = date.getDay(); return day !== 0 && day !== 6; }
function generateDates() {
  const dates = [];
  for (let d = 1; d <= 30; d++) { const date = new Date(2025, 3, d); if (isWeekday(date)) dates.push({ year: 2026, month: 4, day: d }); }
  for (let d = 1; d <= 20; d++) { const date = new Date(2025, 4, d); if (isWeekday(date)) dates.push({ year: 2026, month: 5, day: d }); }
  return dates;
}
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const dates = generateDates();
  let totalOrders = 0;
  for (const { year, month, day } of dates) {
    const ordersPerDay = randomInt(8, 18);
    for (let i = 0; i < ordersPerDay; i++) {
      const hour = randomInt(9, 20);
      const minute = randomInt(0, 59);
      const second = randomInt(0, 59);
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;
      const isCancelled = Math.random() < 0.1;
      const status = isCancelled ? 'cancelled' : 'completed';
      const isPaid = isCancelled ? 0 : 1;
      const tableName = TABLES[randomInt(0, TABLES.length - 1)];
      const orderId = uuid();
      const itemCount = randomInt(1, 4);
      let totalPrice = 0;
      const selectedProducts = [];
      for (let j = 0; j < itemCount; j++) {
        const product = PRODUCTS[randomInt(0, PRODUCTS.length - 1)];
        const quantity = randomInt(1, 3);
        const subtotal = product.price * quantity;
        totalPrice += subtotal;
        selectedProducts.push({ product, quantity, subtotal });
      }
      db.run(`INSERT INTO orders (id, store_id, table_name, status, total_price, payment_method, is_paid, daily_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'cash', ?, ?, ?, ?)`,
        [orderId, STORE_ID, tableName, status, totalPrice, isPaid, i+1, dateStr, dateStr]);
      for (const { product, quantity, subtotal } of selectedProducts) {
        db.run(`INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity, subtotal, options) VALUES (?, ?, ?, ?, ?, ?, ?, '[]')`,
          [uuid(), orderId, product.id, product.name, product.price, quantity, subtotal]);
      }
      totalOrders++;
    }
  }
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();
  console.log('完成！共生成', totalOrders, '筆訂單');
});
