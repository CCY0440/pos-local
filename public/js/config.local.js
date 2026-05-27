// =============================================
// config.local.js — 本地伺服器版設定
// 取代原本的 config.js (Supabase 版)
// =============================================

// 伺服器位址：測試時改成 iPad 的 IP
// 例如：'http://192.168.1.100:3000'
window.LOCAL_API_BASE = window.location.origin;

// supabase-shim.js 會讀取 LOCAL_API_BASE
// 並建立 window.supabaseClient，讓原本的程式碼不用改

// getSupabaseImageUrl 也在 supabase-shim.js 裡定義了
