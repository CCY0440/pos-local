const fs = require('fs');
const initSqlJs = require('./node_modules/sql.js');

const PRODUCT_OPTIONS = {
  '909f6ee5-7b93-4575-95eb-dcdf30020f0a': [
    { label: '沾醬選擇', type: 'radio', choices: [{label:'招牌松露醬',price:0},{label:'經典番茄醬',price:0}] }
  ],
  '22a71b27-aea4-499e-a69b-d8bd364b968e': [
    { label: '辣度調整', type: 'radio', choices: [{label:'不辣',price:0},{label:'微辣',price:0},{label:'小辣',price:0},{label:'中辣',price:0},{label:'大辣',price:0}] }
  ],
  '10eac186-ee18-48a4-ad6f-1e21587431af': [
    { label: '沙拉客製化', type: 'multi', choices: [{label:'不要洋蔥',price:0},{label:'不要橄欖',price:0},{label:'不要蕃茄',price:0}] },
    { label: '沙拉加料', type: 'multi', choices: [{label:'加舒肥雞胸肉',price:30},{label:'加一顆水煮蛋',price:20}] }
  ],
  '39d7061a-c8d0-4f4c-be23-108cdb23094b': [
    { label: '升級加購', type: 'multi', choices: [{label:'酥烤法國麵包',price:30},{label:'雙倍起司',price:20}] }
  ],
  'fa8d3268-e4fe-49cf-ad55-6a8c14d8d54e': [
    { label: '尺寸選擇', type: 'radio', choices: [{label:'標準8吋',price:0},{label:'升級10吋',price:20}] }
  ],
  '25b03503-af3b-4fbd-bb95-e42551a8da51': [
    { label: '披薩客製化', type: 'multi', choices: [{label:'不要洋蔥',price:0},{label:'不要青椒',price:0},{label:'不要橄欖',price:0}] }
  ],
  'b56a2fff-1eb0-4c1c-b804-35e54fe9b7d3': [
    { label: '份量與加料', type: 'multi', choices: [{label:'麵量加大',price:20},{label:'加一顆溫泉蛋',price:15}] }
  ],
  '1d185018-96d3-475b-ab87-035545d6df0b': [
    { label: '麵條種類', type: 'radio', choices: [{label:'經典直面',price:0},{label:'筆管麵',price:0}] }
  ],
  'abf6dd4c-85a6-4b41-acb5-813c7bc451fb': [
    { label: '牛排熟度', type: 'radio', choices: [{label:'3分熟',price:0},{label:'5分熟',price:0},{label:'7分熟',price:0},{label:'全熟',price:0}] }
  ]
};

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateOptions(productId) {
  const opts = PRODUCT_OPTIONS[productId];
  if (!opts) return '[]';
  const result = [];
  for (const opt of opts) {
    if (opt.type === 'radio') {
      const choice = randomItem(opt.choices);
      result.push({ label: opt.label, value: choice.label, price: choice.price });
    } else {
      const selected = opt.choices.filter(() => Math.random() > 0.5);
      if (selected.length > 0) {
        selected.forEach(c => result.push({ label: opt.label, value: c.label, price: c.price }));
      }
    }
  }
  return JSON.stringify(result);
}

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/restaurant.db'));
  const items = db.exec('SELECT id, product_id FROM order_items');
  let updated = 0;
  for (const row of items[0].values) {
    const [id, productId] = row;
    const options = generateOptions(productId);
    db.run('UPDATE order_items SET options = ? WHERE id = ?', [options, id]);
    updated++;
  }
  const data = db.export();
  fs.writeFileSync('./data/restaurant.db', Buffer.from(data));
  db.close();
  console.log('完成！共更新', updated, '筆訂單明細');
});
