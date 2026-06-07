# POS 點餐系統

適合中小型餐廳使用的本地 QR Code 點餐系統。顧客掃描 QR Code 自助點餐，訂單即時顯示在後台。所有資料儲存在本機，不需要網路、不需要月費。

## 功能特色

- 顧客掃 QR Code 用手機點餐，不需要下載 App
- 訂單即時推送到後台（Server-Sent Events）
- 支援多桌同時點餐
- 菜單管理：新增 / 編輯 / 上傳圖片 / 上下架
- 店家設定：Logo、店名、地址
- 資料完全本地化，斷網也能運作
- 系統匣常駐，不占用桌面

---

## 下載安裝

前往 [Releases 頁面](https://github.com/CCY0440/pos-local/releases) 下載最新版。

| 平台 | 檔案 | 說明 |
|------|------|------|
| Windows 10/11 | `POS.Setup.x.x.x.exe` | 雙擊安裝，不需要 Node.js |

安裝後桌面出現「POS點餐系統」捷徑，雙擊即可啟動。

---

## 首次使用

1. 雙擊桌面捷徑啟動系統
2. 右下角系統匣出現圖示，瀏覽器自動開啟後台
3. 點「註冊」建立管理員帳號
4. 前往「店家設定」填寫店名、上傳 Logo
5. 前往「菜單管理」新增品項
6. 將顧客點餐頁面的 QR Code 列印或顯示在桌上
7. 顧客掃碼點餐後，後台即時收到訂單通知

---

## 區網多設備共用

同一 WiFi 下的手機、平板、其他電腦都可以存取：

| 角色 | 網址 |
|------|------|
| 後台管理 | `http://電腦IP:3000/dashboard.html` |
| 顧客點餐 | `http://電腦IP:3000` |

啟動後系統匣圖示可以「複製區網網址」，直接傳給同事。

---

## 資料備份與還原

資料存放位置：

```
C:\Users\你的帳號\AppData\Roaming\pos-local\data\
├── restaurant.db    ← 所有資料（帳號、菜單、訂單）
└── uploads\         ← 上傳的圖片
```

**備份：** 複製整個 `data\` 資料夾到安全的地方。

**還原：** 把 `restaurant.db` 貼回相同路徑，重新啟動程式即可。

---

## 常見問題

**Q：程式關掉了顧客還能點餐嗎？**

不行。需要保持程式在系統匣執行，顧客才能存取。

**Q：可以多台電腦同時開後台嗎？**

可以。只要連同一個 WiFi，用任何設備的瀏覽器開啟後台網址即可。資料集中在伺服器那台電腦上。

**Q：資料會上傳到雲端嗎？**

不會。所有資料只存在你的電腦，完全離線運作。

**Q：Port 3000 被佔用怎麼辦？**

在 PowerShell 執行：

```powershell
$env:PORT=3001; npm start
```

---

## 開發者

### 環境需求

- Node.js 18+
- Windows（打包 .exe）或 Mac（打包 .dmg）

### 從原始碼執行

```bash
git clone https://github.com/CCY0440/pos-local.git
cd pos-local
git checkout claude/adoring-curie-JeCTK
npm install
npm start
```

### 打包安裝檔

```bash
node build/create-icon.js   # 產生圖示
npm run build:win            # Windows .exe（需在 Windows 執行）
npm run build:mac            # Mac .dmg（需在 Mac 執行）
```

### 專案結構

```
pos-local/
├── main.js           # Electron 主程序（系統匣、單一實例）
├── package.json      # 根目錄相依套件 + electron-builder 設定
├── server/
│   ├── server.js     # Express API + sql.js 資料庫
│   └── package.json  # server 獨立執行時的設定
├── public/           # 前端 HTML / JS / CSS
└── build/
    └── create-icon.js  # 純 Node.js 圖示產生器
```

### 環境變數

| 變數 | 說明 | 預設 |
|------|------|------|
| `PORT` | 伺服器 Port | `3000` |
| `POS_DATA_DIR` | 資料根目錄（Electron 自動設定） | `server/data/` |
| `POS_PUBLIC_DIR` | 前端靜態資源目錄 | `public/` |
| `POS_WASM_PATH` | sql-wasm.wasm 路徑（Electron 自動設定） | 自動偵測 |
