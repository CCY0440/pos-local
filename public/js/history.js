// =============================================
// history.js — 歷史訂單查詢模組 (純前端偵測加點，安全不報錯版)
// =============================================
(function () {
    let storeId = null;
    let histOrders = [];
    let histFilter = 'all';
    let initialized = false;

    async function getStoreId() {
        if (storeId) return storeId;
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) return null;
        const { data: store } = await window.supabaseClient.from('stores').select('id').eq('owner_id', user.id).single();
        if (store) storeId = store.id;
        return storeId;
    }

    function formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    async function loadHistoryForDate(dateStr) {
        const id = await getStoreId();
        if (!id) return;

        const listEl = document.getElementById('hist-orders-list');
        if (listEl) {
            listEl.innerHTML = `<div class="p-10 text-center text-gray-300"><i data-lucide="loader" class="w-7 h-7 mx-auto animate-spin"></i></div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        const start = new Date(dateStr + 'T00:00:00');
        const end = new Date(dateStr + 'T23:59:59');

        const { data: orders, error } = await window.supabaseClient
            .from('orders')
            .select('id, store_id, table_name, status, total_price, payment_method, is_paid, note, daily_number, created_at, order_items(product_name, quantity, subtotal, options)')
            .eq('store_id', id)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false });

        if (error) { console.error(error); return; }

        histOrders = orders || [];
        renderStats();
        renderHistList();
    }

    function renderStats() {
        const total = histOrders.length;
        const completed = histOrders.filter(o => o.status === 'completed').length;
        const cancelled = histOrders.filter(o => o.status === 'cancelled').length;
        const revenue = histOrders
            .filter(o => o.status === 'completed')
            .reduce((s, o) => s + (o.total_price || 0), 0);

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('hist-stat-total', total);
        set('hist-stat-completed', completed);
        set('hist-stat-cancelled', cancelled);
        set('hist-stat-revenue', revenue.toLocaleString());
    }

    function renderHistList() {
        const listEl = document.getElementById('hist-orders-list');
        const labelEl = document.getElementById('hist-list-label');
        if (!listEl) return;

        const filtered = histFilter === 'all'
            ? histOrders
            : histOrders.filter(o => o.status === histFilter);

        if (labelEl) {
            const currentSelectedDate = document.getElementById('hist-date-input').value;
            const headerContainer = labelEl.parentElement;

            headerContainer.className = "px-4 sm:px-5 py-3.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50/30 gap-3";

            labelEl.className = "text-sm font-bold text-gray-500 leading-relaxed flex flex-col sm:flex-row sm:items-center";
            labelEl.innerHTML = `<span>${currentSelectedDate}</span> <span class="hidden sm:inline mx-1 text-gray-300">·</span> <span class="text-xs sm:text-sm font-bold text-gray-400 sm:text-gray-500">共 ${filtered.length} 筆記錄</span>`;

            const btnGroup = headerContainer.querySelector('.flex.gap-1\\.5') || headerContainer.querySelector('.flex.gap-2') || headerContainer.querySelector('div:nth-child(2)');
            if (btnGroup) {
                btnGroup.className = "flex gap-1.5 overflow-x-auto pb-1 max-w-full hide-scrollbar items-center shrink-0 w-full sm:w-auto";
            }
        }

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div class="p-12 text-center">
                    <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-3 text-gray-200"></i>
                    <p class="font-bold text-gray-400 text-sm">此日期沒有訂單記錄</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const payLabel = { cash: '現金', card: '刷卡', linepay: 'Line Pay' };

        listEl.innerHTML = filtered.map(order => {
            const num = String(order.daily_number || 0).padStart(3, '0');
            const time = new Date(order.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
            const items = order.order_items || [];
            const pay = payLabel[order.payment_method] || '現金';

            const isAddon = order.note && order.note.includes('【加點】');
            let cleanNote = order.note || '';
            if (isAddon) {
                cleanNote = cleanNote.replace('【加點】', '').trim();
            }

            const isCompleted = order.status === 'completed';
            const isCancelled = order.status === 'cancelled';
            const statusLabel = isCompleted ? '已完成' : isCancelled ? '已取消' : '未完成';
            const statusIcon = isCompleted ? 'check-circle' : isCancelled ? 'x-circle' : 'clock';
            const statusColor = isCompleted ? 'text-gray-500 bg-gray-100' : isCancelled ? 'text-red-500 bg-red-50' : 'text-amber-600 bg-amber-50';

            const itemsHtml = items.map(item => { /* (這段照舊保留，不需要改) */
                let optionsText = '';
                if (item.options && Object.keys(item.options).length > 0) {
                    optionsText = Object.values(item.options).map(o =>
                        o.choices ? o.choices.map(c => c.label).join('、') : o.value
                    ).join(' | ');
                }
                return `
                <div class="flex justify-between items-start text-sm">
                    <div>
                        <span class="font-bold text-gray-700 whitespace-normal break-words">${item.product_name}</span>
                        ${optionsText ? `<p class="text-xs text-gray-400 mt-0.5 whitespace-normal break-words leading-relaxed">${optionsText}</p>` : ''}
                    </div>
                    <div class="flex items-center gap-3 shrink-0 ml-4">
                        <span class="text-gray-400 font-mono text-xs">×${item.quantity}</span>
                        <span class="font-bold text-gray-700 w-16 text-right text-xs">NT$${item.subtotal.toLocaleString()}</span>
                    </div>
                </div>`;
            }).join('');

            // 🌟 修正 1：純文字，加點標籤使用 inline-block 跟著文字流動
            const displayTableName = isAddon
                ? `${order.table_name} <span class="text-red-500 font-black ml-1 inline-block whitespace-nowrap">| 加點</span>`
                : `${order.table_name}`;

            return `
            <div class="p-3 sm:p-5 hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0">
                <div class="flex justify-between items-start mb-4 gap-2">
                    
                    <div class="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
                        <div class="text-center shrink-0 w-10 sm:w-14 pt-0.5">
                            <p class="font-black text-lg sm:text-2xl text-gray-800 leading-none">#${num}</p>
                            <p class="text-[9px] sm:text-[10px] font-bold text-gray-400 mt-1 sm:mt-1.5">${time}</p>
                        </div>
                        <div class="w-px h-8 sm:h-10 bg-gray-200 shrink-0 mt-0.5"></div>
                        <div class="flex-1 min-w-0">
                            <div class="font-black text-gray-800 text-[15px] sm:text-lg leading-snug break-words pr-1">
                                ${displayTableName}
                            </div>
                            <p class="text-[10px] sm:text-xs font-bold text-gray-500 mt-1">${pay}</p>
                        </div>
                    </div>

                    <div class="flex flex-col items-end gap-1.5 sm:gap-2 shrink-0 ml-1 sm:ml-2">
                        <span class="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-xl text-[10px] sm:text-xs font-bold ${statusColor}">
                            <i data-lucide="${statusIcon}" class="w-3 sm:w-3.5 h-3 sm:h-3.5"></i> ${statusLabel}
                        </span>
                        ${order.is_paid
                    ? `<span class="text-[9px] sm:text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded border border-emerald-100">✓ 已付款</span>`
                    : `<span class="text-[9px] sm:text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 sm:px-2 py-0.5 rounded border border-gray-200">未付款</span>`}
                    </div>
                </div>
                <div class="space-y-3">
                    ${itemsHtml}
                </div>
                <div class="mt-4 pt-4 border-t border-gray-50 flex justify-between items-end flex-wrap gap-2">
                    <div class="flex-1 min-w-0 pr-4">
                        ${cleanNote ? `<div class="inline-flex items-start gap-1.5 text-[11px] sm:text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 font-medium whitespace-normal break-words leading-relaxed"><i data-lucide="message-square" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i><span class="">${cleanNote}</span></div>` : ''}
                    </div>
                    <div class="text-right shrink-0 ml-auto">
                        <p class="text-lg sm:text-xl font-black text-gray-800">NT$ ${order.total_price.toLocaleString()}</p>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.querySelectorAll('.hist-filter-btn').forEach(btn => {
            btn.classList.add('whitespace-nowrap', 'shrink-0');
        });
    }

    window.initHistory = async function () {
        const dateInput = document.getElementById('hist-date-input');
        if (!dateInput) return;

        if (!initialized) {
            initialized = true;

            const style = document.createElement('style');
            style.innerHTML = `
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `;
            document.head.appendChild(style);

            flatpickr(dateInput, {
                locale: "zh_tw",
                dateFormat: "Y-m-d",
                defaultDate: "today",
                maxDate: "today",
                disableMobile: true,
                onChange: function (selectedDates, dateStr, instance) {
                    histFilter = 'all';
                    syncFilterBtns();
                    loadHistoryForDate(dateStr);
                },
                onReady: function (selectedDates, dateStr, instance) {
                    instance.calendarContainer.addEventListener('wheel', (e) => {
                        e.preventDefault();
                        if (e.deltaY > 0) instance.changeMonth(1);
                        else if (e.deltaY < 0) instance.changeMonth(-1);
                    }, { passive: false });
                }
            });

            document.querySelectorAll('.hist-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    histFilter = btn.dataset.status;
                    syncFilterBtns();
                    renderHistList();
                });
            });
        }

        loadHistoryForDate(dateInput.value || formatDate(new Date()));
    };

    function syncFilterBtns() {
        document.querySelectorAll('.hist-filter-btn').forEach(btn => {
            const active = btn.dataset.status === histFilter;
            btn.classList.toggle('border-emerald-400', active);
            btn.classList.toggle('text-emerald-600', active);
            btn.classList.toggle('bg-emerald-50', active);
            btn.classList.toggle('border-gray-200', !active);
            btn.classList.toggle('text-gray-500', !active);
        });
    }
})();