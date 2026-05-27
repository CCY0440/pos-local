// =============================================
// table.js — 桌號與 QR Code 管理模組 (RWD 完美防擠壓版)
// =============================================
(async function initTablesModule() {
    async function getStoreId() {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) return null;
        const { data: store } = await window.supabaseClient
            .from('stores').select('id').eq('owner_id', user.id).single();
        return store ? store.id : null;
    }

    let currentStoreId = null;

    async function getOrderUrl(storeId, tableName) {
        try {
            const res = await fetch('/api/server-ip');
            const { ip, port } = await res.json();
            return `http://${ip}:${port}/order.html?store_id=${storeId}&table=${encodeURIComponent(tableName)}`;
        } catch {
            return `${window.location.origin}/order.html?store_id=${storeId}&table=${encodeURIComponent(tableName)}`;
        }
    }

    window.loadTables = async function () {
        const grid = document.getElementById('tables-grid');
        const countBadge = document.getElementById('tables-count');
        if (!grid) return;

        grid.innerHTML = `
            <div class="col-span-full flex justify-center py-20">
                <i data-lucide="loader" class="w-8 h-8 text-emerald-500 animate-spin"></i>
            </div>`;
        lucide.createIcons();

        currentStoreId = await getStoreId();
        if (!currentStoreId) {
            grid.innerHTML = '<p class="col-span-full text-center text-red-500 py-20 font-bold">無法取得店家資訊，請重新整理。</p>';
            return;
        }

        const { data: tables, error } = await window.supabaseClient
            .from('tables')
            .select('*')
            .eq('store_id', currentStoreId)
            ;

        if (error) {
            grid.innerHTML = '<p class="col-span-full text-center text-red-500 py-20 font-bold">載入失敗，請重新整理。</p>';
            return;
        }

        if (tables) tables.sort((a, b) => { const numA = parseInt(a.table_name.replace(/[^0-9]/g, "")) || 0; const numB = parseInt(b.table_name.replace(/[^0-9]/g, "")) || 0; return numA - numB; });
        if (countBadge) countBadge.textContent = tables ? tables.length : 0;

        const countInput = document.getElementById('input-table-count');
        if (countInput && tables) countInput.value = tables.length;

        if (!tables || tables.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-24 text-gray-400 fade-in">
                    <div class="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-5">
                        <i data-lucide="qr-code" class="w-10 h-10 text-gray-300"></i>
                    </div>
                    <p class="font-bold text-gray-500 mb-1 text-lg">尚未建立任何桌號</p>
                    <p class="text-sm text-gray-400 mb-6">點擊右上角輸入桌數開始設定</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        renderCards(tables);
    };

    function renderCards(tables) {
        const grid = document.getElementById('tables-grid');
        // 🌟 修正斷點：將 xl (1280px) 移到 2xl (1536px)，避免在 1280~1306px 區間擠壓成 4 欄
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5';
        grid.innerHTML = '';

        tables.forEach(async (table) => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-3xl border border-gray-100 shadow-sm p-3 sm:p-4 w-full flex flex-row items-center gap-3 sm:gap-4 hover:shadow-md hover:border-emerald-200 transition-all duration-200 group fade-in';
            card.dataset.tableId = table.id;

            const qrUrl = await getOrderUrl(currentStoreId, table.table_name);

            // 🌟 加入 break-all whitespace-normal 確保極端情況下文字直接換行不截斷
            card.innerHTML = `
                <div class="relative w-[100px] h-[100px] sm:w-[116px] sm:h-[116px] shrink-0 flex items-center justify-center">
                    <div id="qr-${table.id}" class="w-full h-full rounded-xl overflow-hidden flex items-center justify-center bg-white border border-gray-100 p-1.5"></div>
                    <div class="absolute inset-0 rounded-xl border-2 border-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                </div>

                <div class="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
                    <div class="flex justify-between items-start w-full">
                        <span class="font-black text-gray-800 break-all whitespace-normal leading-tight text-sm sm:text-base pt-1 pr-2">${table.table_name}</span>
                        <button class="btn-delete-table p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                            data-id="${table.id}" data-name="${table.table_name}" title="刪除桌號">
                            <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                        </button>
                    </div>

                    <div class="flex flex-col gap-1.5 w-full mt-auto">
                        <button class="btn-preview-qr w-full text-xs font-bold py-2 px-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-100 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
                            data-url="${qrUrl}" title="預覽點餐頁">
                            <i data-lucide="eye" class="w-3.5 h-3.5 pointer-events-none shrink-0"></i> 預覽
                        </button>
                        <button class="btn-download-qr w-full text-xs font-bold py-2 px-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
                            data-id="${table.id}" data-name="${table.table_name}">
                            <i data-lucide="download" class="w-3.5 h-3.5 pointer-events-none shrink-0"></i> 下載
                        </button>
                    </div>
                </div>`;

            grid.appendChild(card);
            const previewBtn = card.querySelector(".btn-preview-qr");
            if (previewBtn) previewBtn.addEventListener("click", () => { const url = previewBtn.dataset.url; if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); document.body.removeChild(a); } });
            const downloadBtn = card.querySelector(".btn-download-qr");
            if (downloadBtn) downloadBtn.addEventListener("click", () => { const qrEl = document.getElementById("qr-" + downloadBtn.dataset.id); if (!qrEl) return; const img = qrEl.querySelector("img"); if (!img) return; const canvas = document.createElement("canvas"); canvas.width = img.width || 104; canvas.height = img.height || 104; const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); canvas.toBlob((blob) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "QRCode_" + downloadBtn.dataset.name + ".png"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000); }, "image/png"); });

            setTimeout(() => {
                const qrEl = document.getElementById(`qr-${table.id}`);
                if (qrEl && typeof QRCode !== 'undefined') {
                    new QRCode(qrEl, {
                        text: qrUrl,
                        width: 104,
                        height: 104,
                        colorDark: '#111827',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.M
                    });
                }
            }, 50);
        });

        lucide.createIcons();

        grid.querySelectorAll('.btn-preview-qr').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
            });
        });

        grid.querySelectorAll('.btn-delete-table').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = await window.AppDialog.confirm(
                    `確定要刪除「${btn.dataset.name}」嗎？刪除後無法恢復。`, 'danger', '刪除桌號');
                if (!confirmed) return;

                const { error } = await window.supabaseClient.from('tables').delete().eq('id', btn.dataset.id);
                if (error) { window.AppDialog.alert('刪除失敗：' + error.message, 'danger'); return; }

                const card = btn.closest('[data-table-id]');
                card.style.transition = 'opacity 0.3s, transform 0.3s';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    card.remove();
                    const remaining = grid.querySelectorAll('[data-table-id]').length;
                    const countBadge = document.getElementById('tables-count');
                    if (countBadge) countBadge.textContent = remaining;
                    const countInput = document.getElementById('input-table-count');
                    if (countInput) countInput.value = remaining;
                    if (typeof window.checkSetupNotifications === 'function') window.checkSetupNotifications();
                    if (remaining === 0) window.loadTables();
                }, 300);
            });
        });

        grid.querySelectorAll('.btn-download-qr').forEach(btn => {
            btn.addEventListener('click', () => {
                const qrEl = document.getElementById(`qr-${btn.dataset.id}`);
                if (!qrEl) return;
                const canvas = qrEl.querySelector('canvas');
                if (!canvas) { window.AppDialog.alert('QR Code 尚未生成，請稍等片刻再試。', 'warning'); return; }

                const finalCanvas = document.createElement('canvas');
                const pad = 20;
                finalCanvas.width = canvas.width + pad * 2;
                finalCanvas.height = canvas.height + pad * 2 + 36;
                const ctx = finalCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                ctx.drawImage(canvas, pad, pad);
                ctx.fillStyle = '#111827';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(btn.dataset.name, finalCanvas.width / 2, canvas.height + pad + 22);

                const link = document.createElement('a');
                link.download = `QRCode_${btn.dataset.name}.png`;
                link.href = finalCanvas.toDataURL('image/png');
                link.click();
            });
        });
    }

    document.getElementById('btn-download-all-qr')?.addEventListener('click', async () => {
        if (typeof JSZip === 'undefined') {
            window.AppDialog.alert('JSZip 尚未載入，請重新整理後再試。', 'warning');
            return;
        }

        const cards = document.querySelectorAll('#tables-grid [data-table-id]');
        if (cards.length === 0) {
            window.AppDialog.alert('目前沒有桌號可以下載。', 'warning');
            return;
        }

        const btn = document.getElementById('btn-download-all-qr');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin inline mr-1"></i> 打包中...';
        btn.disabled = true;
        lucide.createIcons();

        try {
            const zip = new JSZip();

            for (const card of cards) {
                const tableId = card.dataset.tableId;
                const tableName = card.querySelector('.font-black')?.textContent?.trim();
                const qrEl = document.getElementById(`qr-${tableId}`);
                const canvas = qrEl?.querySelector('canvas');
                if (!canvas || !tableName) continue;

                const finalCanvas = document.createElement('canvas');
                const pad = 20;
                finalCanvas.width = canvas.width + pad * 2;
                finalCanvas.height = canvas.height + pad * 2 + 36;
                const ctx = finalCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                ctx.drawImage(canvas, pad, pad);
                ctx.fillStyle = '#111827';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(tableName, finalCanvas.width / 2, canvas.height + pad + 22);

                const dataUrl = finalCanvas.toDataURL('image/png');
                const base64 = dataUrl.split(',')[1];
                zip.file(`QRCode_${tableName}.png`, base64, { base64: true });
            }

            const content = await zip.generateAsync({ type: 'base64' });
            const link = document.createElement('a');
            link.href = 'data:application/zip;base64,' + content;
            link.download = 'QRCodes_所有桌號.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            window.AppDialog.alert('下載失敗：' + err.message, 'danger');
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            lucide.createIcons();
        }
    });

    const countInput = document.getElementById('input-table-count');
    let dbSyncTimer = null;

    countInput?.addEventListener('input', () => {
        const target = parseInt(countInput.value);
        if (isNaN(target) || target < 1 || target > 100) return;

        renderCount(target);
        clearTimeout(dbSyncTimer);
        dbSyncTimer = setTimeout(() => syncDB(target), 1000);
    });

    async function renderCount(target) {
        const grid = document.getElementById('tables-grid');
        // 🌟 修正斷點：動態生成的卡片網格也要同步更新為 2xl
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5';
        const cards = [...grid.querySelectorAll('[data-table-id]')];
        const current = cards.length;

        if (target > current) {
            for (let i = current + 1; i <= target; i++) {
                const tableName = `桌號${i}`;
                const qrUrl = await getOrderUrl(currentStoreId, tableName);
                const card = document.createElement('div');
                card.className = 'bg-white rounded-3xl border border-gray-100 shadow-sm p-3 sm:p-4 w-full flex flex-row items-center gap-3 sm:gap-4 hover:shadow-md hover:border-emerald-200 transition-all duration-200 group fade-in';
                card.dataset.tableId = `temp-${i}`;

                card.innerHTML = `
                <div class="relative w-[100px] h-[100px] sm:w-[116px] sm:h-[116px] shrink-0 flex items-center justify-center">
                    <div id="qr-temp-${i}" class="w-full h-full rounded-xl overflow-hidden flex items-center justify-center bg-white border border-gray-100 p-1.5"></div>
                    <div class="absolute inset-0 rounded-xl border-2 border-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                </div>
                <div class="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
                    <div class="flex justify-between items-start w-full">
                        <span class="font-black text-gray-800 break-all whitespace-normal leading-tight text-sm sm:text-base pt-1 pr-2">${tableName}</span>
                        <button class="btn-delete-table p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                            data-id="temp-${i}" data-name="${tableName}" title="刪除桌號">
                            <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                        </button>
                    </div>
                    <div class="flex flex-col gap-1.5 w-full mt-auto">
                        <button class="btn-preview-qr w-full text-xs font-bold py-2 px-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-100 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
                            data-url="${qrUrl}" title="預覽點餐頁">
                            <i data-lucide="eye" class="w-3.5 h-3.5 pointer-events-none shrink-0"></i> 預覽
                        </button>
                        <button class="btn-download-qr w-full text-xs font-bold py-2 px-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
                            data-id="temp-${i}" data-name="${tableName}">
                            <i data-lucide="download" class="w-3.5 h-3.5 pointer-events-none shrink-0"></i> 下載
                        </button>
                    </div>
                </div>`;
                grid.appendChild(card);
            const previewBtn = card.querySelector(".btn-preview-qr");
            if (previewBtn) previewBtn.addEventListener("click", () => { const url = previewBtn.dataset.url; if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); document.body.removeChild(a); } });
            const downloadBtn = card.querySelector(".btn-download-qr");
            if (downloadBtn) downloadBtn.addEventListener("click", () => { const qrEl = document.getElementById("qr-" + downloadBtn.dataset.id); if (!qrEl) return; const img = qrEl.querySelector("img"); if (!img) return; const canvas = document.createElement("canvas"); canvas.width = img.width || 104; canvas.height = img.height || 104; const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); canvas.toBlob((blob) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "QRCode_" + downloadBtn.dataset.name + ".png"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000); }, "image/png"); });

                setTimeout(() => {
                    const qrEl = document.getElementById(`qr-temp-${i}`);
                    if (qrEl && typeof QRCode !== 'undefined') {
                        const size = 104;
                        new QRCode(qrEl, { text: qrUrl, width: size, height: size, colorDark: '#111827', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
                    }
                }, 50);
            }
            lucide.createIcons();

        } else if (target < current) {
            cards.slice(target).forEach(card => {
                card.style.transition = 'opacity 0.2s, transform 0.2s';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => card.remove(), 200);
            });
        }

        const countBadge = document.getElementById('tables-count');
        if (countBadge) countBadge.textContent = target;
    }

    async function syncDB(target) {
        const { data: existing } = await window.supabaseClient
            .from('tables').select('id, table_name').eq('store_id', currentStoreId)
            .order('created_at', { ascending: true });

        const current = existing ? existing.length : 0;
        if (target === current) return;

        if (target > current) {
            const rows = Array.from({ length: target - current }, (_, i) => ({
                store_id: currentStoreId,
                table_name: `桌號${current + i + 1}`
            }));
            await window.supabaseClient.from('tables').insert(rows);
        } else {
            const toDelete = existing.slice(target).map(t => t.id);
            await window.supabaseClient.from('tables').delete().in('id', toDelete);
        }
        if (typeof window.checkSetupNotifications === 'function') window.checkSetupNotifications();
        await window.loadTables();
    }
})();