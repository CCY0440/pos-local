'use strict';
const { app, Tray, Menu, shell, nativeImage, dialog, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const net = require('net');
const fs = require('fs');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

const userData = app.getPath('userData');
process.env.POS_DATA_DIR = userData;

if (app.isPackaged) {
  process.env.POS_WASM_PATH = path.join(process.resourcesPath, 'sql-wasm.wasm');
  process.env.POS_PUBLIC_DIR = path.join(process.resourcesPath, 'public');
}

const PORT = parseInt(process.env.PORT || '3000', 10);
let tray = null;

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function checkPort(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

function buildIcon() {
  const iconFile = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, 'build', 'icon.png');

  if (fs.existsSync(iconFile)) {
    const img = nativeImage.createFromPath(iconFile);
    return process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img.resize({ width: 16, height: 16 });
  }
  return buildFallbackIcon();
}

function buildFallbackIcon() {
  const zlib = require('zlib');

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0); }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const t = Buffer.from(type), len = Buffer.alloc(4), crcBuf = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcBuf]);
  }

  const size = 32;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  const raw = [];
  const cx = size / 2 - 0.5, cy = size / 2 - 0.5, r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const inside = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r;
      raw.push(inside ? 22 : 0, inside ? 163 : 0, inside ? 74 : 0, inside ? 255 : 0);
    }
  }

  const pngBuf = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0))
  ]);
  return nativeImage.createFromBuffer(pngBuf);
}

function createTray() {
  const ip = getLocalIP();
  const icon = buildIcon();

  tray = new Tray(icon);
  if (process.platform === 'darwin') tray.setIgnoreDoubleClickEvents(true);

  const menu = Menu.buildFromTemplate([
    { label: 'POS 點餐系統', enabled: false },
    { type: 'separator' },
    { label: `後台：http://localhost:${PORT}`, enabled: false },
    { label: `區網：http://${ip}:${PORT}`, enabled: false },
    { type: 'separator' },
    {
      label: '開啟後台管理',
      click: () => shell.openExternal(`http://localhost:${PORT}`)
    },
    {
      label: '複製區網網址（給顧客掃碼用）',
      click: () => clipboard.writeText(`http://${ip}:${PORT}`)
    },
    { type: 'separator' },
    {
      label: '關閉系統',
      click: () => app.quit()
    }
  ]);

  tray.setToolTip(`POS 點餐系統\n後台：http://localhost:${PORT}\n區網：http://${ip}:${PORT}`);
  tray.setContextMenu(menu);

  tray.on('click', () => {
    if (process.platform === 'win32') shell.openExternal(`http://localhost:${PORT}`);
    else tray.popUpContextMenu();
  });
}

app.whenReady().then(async () => {
  if (app.dock) app.dock.hide();

  const portOK = await checkPort(PORT);
  if (!portOK) {
    dialog.showErrorBox('Port 被佔用', `Port ${PORT} 已被其他程式佔用，請先關閉後再重試。`);
    app.quit();
    return;
  }

  try {
    const server = require('./server/server.js');
    await server.start();
    createTray();
    setTimeout(() => shell.openExternal(`http://localhost:${PORT}`), 800);
  } catch (err) {
    dialog.showErrorBox('啟動失敗', `伺服器啟動時發生錯誤：\n\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => { });

app.on('second-instance', () => {
  shell.openExternal(`http://localhost:${PORT}`);
});
