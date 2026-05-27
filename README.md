# POS 本地伺服器 — iSH 安裝說明

## 架構說明

```
iPad 上的 iSH App
├── Node.js + Express     ← 接收顧客訂單、提供菜單
├── sql.js (純 JS SQLite) ← 儲存所有資料，不需要網路
└── 你的前端 HTML         ← 直接從 iSH 提供給所有設備

顧客手機 → 掃 QR Code → 連到 iPad 的 iSH server → 訂單存入 SQLite
iPad Safari → 連到 iSH server → 後台管理介面
```

---

## 第一步：在 iPad 安裝 iSH

App Store 搜尋「iSH Shell」，免費安裝。

---

## 第二步：在 iSH 安裝 Node.js

打開 iSH，依序執行：

```sh
# 更新套件清單
apk update

# 安裝 Node.js 和 npm
apk add nodejs npm

# 確認版本（會比較慢，請耐心等待）
node --version
npm --version
```

> ⚠️ iSH 速度很慢，apk update 可能需要 3-5 分鐘，請耐心等待。

---

## 第三步：把專案傳到 iSH

**方法 A：從電腦用 SCP 傳**

在電腦執行：
```bash
# 先把專案壓縮
cd /path/to/pos-local
tar -czf pos-local.tar.gz .

# 傳到 iPad（需要 iSH 的 SSH，或用其他方式）
```

**方法 B：直接在 iSH 用 wget 下載（如果有放到某個地方）**

**方法 C（推薦 Demo 用）：直接在 iSH 裡建立檔案**

```sh
mkdir -p ~/pos/server/data/uploads/product-images
mkdir -p ~/pos/server/data/uploads/store-logos
mkdir -p ~/pos/public/js
cd ~/pos/server
```

然後把 server.js 和 package.json 複製貼上到 iSH 的 nano 編輯器：
```sh
nano package.json   # 貼上 package.json 內容，Ctrl+X 儲存
nano server.js      # 貼上 server.js 內容，Ctrl+X 儲存
```

---

## 第四步：安裝 npm 套件

```sh
cd ~/pos/server
npm install
```

> ⚠️ 這一步在 iSH 上可能需要 10-20 分鐘。
> sql.js 是純 JS/WASM，不需要 native 編譯，但下載本身很慢。

**這裡就是你要測試速度的關鍵點：**
- 如果 npm install 超過 30 分鐘 → iSH 可能不適合
- 如果在 10-20 分鐘內完成 → 繼續測試

---

## 第五步：啟動伺服器

```sh
cd ~/pos/server
node server.js
```

看到這個就代表成功：
```
🚀 POS 伺服器已啟動！
   本機：  http://localhost:3000
   區網：  http://192.168.x.x:3000
```

---

## 第六步：把前端檔案放到 public 資料夾

把你所有的 HTML/JS/CSS 檔案放到 `~/pos/public/`，
並把每個 HTML 檔案裡的：

```html
<!-- 原本 -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js"></script>

<!-- 換成 -->
<script src="js/config.local.js"></script>
<script src="js/supabase-shim.js"></script>
```

---

## 測試流程

1. iPad iSH 啟動 `node server.js`
2. 手機和 iPad 連同一個 WiFi 熱點
3. 手機瀏覽器開啟 `http://[iPad的IP]:3000`
4. 測試點餐流程
5. iPad Safari 開啟後台 `http://localhost:3000/dashboard.html`
6. 確認訂單是否即時出現

---

## 速度判斷標準

| 操作 | 可接受 | 太慢 |
|------|--------|------|
| npm install | < 20 分鐘 | > 30 分鐘 |
| node server.js 啟動 | < 30 秒 | > 2 分鐘 |
| 開啟菜單頁 | < 3 秒 | > 8 秒 |
| 送出訂單 | < 2 秒 | > 5 秒 |
| 訂單出現在後台 | < 3 秒 | > 8 秒 |

---

## 如果 iSH 太慢的替代方案

1. **Android 平板 + Termux** → 原生 Linux，速度正常
2. **Raspberry Pi** → 小型電腦，永遠開著，最穩定
3. **Windows 平板** → 跟一般電腦完全一樣
