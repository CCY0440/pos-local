// =============================================
// status.js — 訂單進度追蹤 (完美重整與動態加點提示版)
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();

    const params = new URLSearchParams(location.search);
    const storeId = params.get('store_id');
    const tableName = decodeURIComponent(params.get('table') || '');

    if (!storeId) {
        document.getElementById('tracking-cards-container').innerHTML = '<p class="text-center text-red-500 font-bold py-20">連結無效</p>';
        return;
    }

    let allowAddon = true;
    let orderStatuses = {};
    let completedModalShownCount = 0;
    let isIntentionalNavigation = false;

    const STATUS_CONFIG = {
        pending: { step: 1, label: '待付款', icon: 'banknote', color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
        confirmed: { step: 2, label: '已確認', icon: 'check-circle', color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
        preparing: { step: 3, label: '製作中', icon: 'chef-hat', color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
        ready: { step: 4, label: '可取餐了', icon: 'bell-ring', color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
        completed: { step: 5, label: '用餐愉快', icon: 'star', color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
        cancelled: { step: 0, label: '訂單取消', icon: 'x-circle', color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
    };
    const steps = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
    const stepLabels = ['待付款', '已確認', '製作中', '可取餐', '完成'];

    function renderItemOptions(options) {
        if (!options || typeof options !== 'object' || Object.keys(options).length === 0) return '';
        const parts = Object.values(options).map(opt => {
            if (opt.type === 'text') return `${opt.label}：${opt.value || ''}`;
            const choices = (opt.choices || []).map(c => c.label).join('、');
            return choices ? `${opt.label}：${choices}` : null;
        }).filter(Boolean);
        if (!parts.length) return '';
        return parts.map(p =>
            `<span class="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-medium inline-block">${p}</span>`
        ).join(' ');
    }

    async function initTrackingPage() {
        let activeOrders = JSON.parse(localStorage.getItem(`active_orders_${storeId}`) || '[]');
        if (activeOrders.length === 0) {
            isIntentionalNavigation = true;
            window.location.replace(`order.html?store_id=${storeId}&table=${encodeURIComponent(tableName)}`);
            return;
        }

        const { data: store } = await window.supabaseClient.from('stores').select('allow_addon').eq('id', storeId).single();
        if (store) allowAddon = store.allow_addon !== false;

        const { data: dbOrders } = await window.supabaseClient
            .from('orders')
            .select('id, daily_number, status, note, created_at, total_price, order_items(product_name, quantity, subtotal, options)')
            .in('id', activeOrders.map(o => o.orderId))
            .order('created_at', { ascending: true });

        if (!dbOrders || dbOrders.length === 0) {
            localStorage.removeItem(`active_orders_${storeId}`);
            isIntentionalNavigation = true;
            window.location.replace(`order.html?store_id=${storeId}&table=${encodeURIComponent(tableName)}`);
            return;
        }

        const now = new Date();
        const validActiveOrders = [];
        const displayOrders = [];
        let hasCancelled = false;

        dbOrders.forEach(o => {
            const orderTime = new Date(o.created_at);
            const hoursDiff = (now - orderTime) / (1000 * 60 * 60);
            const isFinished = o.status === 'completed' || o.status === 'cancelled';

            if (o.status === 'cancelled') hasCancelled = true;

            if ((!isFinished && hoursDiff < 24) || (isFinished && hoursDiff < 2)) {
                displayOrders.push(o);
                const match = activeOrders.find(a => a.orderId === o.id);
                if (match) validActiveOrders.push(match);
                orderStatuses[o.id] = o.status;
            }
        });

        localStorage.setItem(`active_orders_${storeId}`, JSON.stringify(validActiveOrders));

        if (displayOrders.length === 0) {
            isIntentionalNavigation = true;
            window.location.replace(`order.html?store_id=${storeId}&table=${encodeURIComponent(tableName)}`);
            return;
        }

        const hideAddonBtn = !allowAddon || validActiveOrders.length >= 2 || hasCancelled;
        const btnBackToMenu = document.getElementById('btn-back-to-menu');

        if (hideAddonBtn && btnBackToMenu) {
            btnBackToMenu.classList.add('hidden');
        } else if (btnBackToMenu) {
            btnBackToMenu.classList.remove('hidden');
            btnBackToMenu.onclick = () => {
                isIntentionalNavigation = true;
                window.location.href = `order.html?store_id=${storeId}&table=${encodeURIComponent(tableName)}`;
            };
        }

        let cardsHtml = displayOrders.map((o, idx) => {
            const isAddOn = !!(o.note && o.note.includes('【加點】'));
            const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.pending;
            const badgeHtml = isAddOn
                ? `<span class="text-xs font-bold bg-red-50 text-red-500 border border-red-100 px-2 py-1 rounded-lg shadow-sm">加點單</span>`
                : `<span class="text-xs font-bold bg-blue-50 text-blue-500 border border-blue-100 px-2 py-1 rounded-lg shadow-sm">主單</span>`;

            let descHtml = '請到櫃檯付款，完成後廚房即開始製作';

            if (o.status === 'cancelled') descHtml = `很抱歉，此訂單已被取消。`;
            else if (o.status === 'confirmed') descHtml = '付款已確認！<br>廚房馬上開始為您準備 ✅';
            else if (o.status === 'preparing') descHtml = '廚師正在精心製作您的餐點 🍳';
            else if (o.status === 'ready') descHtml = '餐點已準備好，請至櫃檯領取！';
            else if (o.status === 'completed') descHtml = '感謝您的光臨，祝您用餐愉快！';

            const currentStep = steps.indexOf(o.status);
            const pct = currentStep > 0 ? (currentStep / (steps.length - 1)) * 100 : 0;

            const itemsHtml = (o.order_items || []).map(item => {
                const optHtml = renderItemOptions(item.options);
                return `
                <div class="flex items-start justify-between py-2 border-b border-gray-200/60 last:border-0">
                    <div class="flex-1 pr-2 min-w-0">
                        <p class="font-bold text-gray-700 text-sm">${item.product_name}</p>
                        ${optHtml ? `<div class="flex flex-wrap gap-1 mt-1">${optHtml}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-3 shrink-0 mt-0.5">
                        <span class="text-gray-400 font-mono text-xs">×${item.quantity}</span>
                        <span class="font-bold text-gray-800 w-16 text-right text-xs">NT$ ${(item.subtotal || 0).toLocaleString()}</span>
                    </div>
                </div>`;
            }).join('');

            return `
            <div class="mb-5 bg-white rounded-3xl shadow-sm border border-gray-100 p-6 relative overflow-hidden transition-all duration-300" id="track-card-${o.id}">
                <div class="flex justify-between items-center mb-5">
                    <div class="flex items-baseline gap-2">
                        <span class="text-sm font-bold text-gray-400">取餐號</span>
                        <span class="font-black text-2xl text-emerald-600 tracking-wider">#${String(o.daily_number).padStart(3, '0')}</span>
                    </div>
                    ${badgeHtml}
                </div>
                
                <div class="flex items-center gap-5 mb-6">
                    <div id="status-icon-wrap-${o.id}" class="w-16 h-16 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${cfg.bg} border-4 ${cfg.border}">
                        <i id="status-icon-${o.id}" data-lucide="${cfg.icon}" class="w-8 h-8 transition-colors duration-500 ${cfg.color}"></i>
                    </div>
                    <div>
                        <h2 id="status-label-${o.id}" class="text-xl font-black text-gray-800 transition-colors">${cfg.label}</h2>
                        <div id="status-desc-${o.id}" class="text-xs font-bold text-gray-500 mt-1.5 leading-relaxed">${descHtml}</div>
                    </div>
                </div>

                <div class="relative flex justify-between px-1 mt-2 mb-6">
                    <div class="absolute left-3 right-3 top-3 h-1.5 bg-gray-100 rounded-full -z-0">
                        <div id="progress-fill-${o.id}" class="h-full bg-emerald-400 rounded-full transition-all duration-700 ease-out" style="width:${pct}%"></div>
                    </div>
                    ${steps.map((s, i) => {
                let dotClass = 'bg-white border-gray-200 text-gray-400';
                let lblClass = 'text-gray-400';
                let dotContent = i + 1;
                if (i < currentStep) {
                    dotClass = 'bg-emerald-500 border-emerald-500 text-white';
                    dotContent = '<i data-lucide="check" class="w-3.5 h-3.5"></i>';
                    lblClass = 'text-emerald-500';
                } else if (i === currentStep) {
                    dotClass = `${cfg.bg} ${cfg.border} ${cfg.color}`;
                    lblClass = `${cfg.color}`;
                }
                return `
                        <div class="flex flex-col items-center gap-2 z-10">
                            <div id="step-dot-${o.id}-${i}" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-[3px] transition-all duration-500 ${dotClass}">${dotContent}</div>
                            <span id="step-label-${o.id}-${i}" class="text-[10px] font-bold whitespace-nowrap transition-colors duration-500 ${lblClass}">${stepLabels[i]}</span>
                        </div>`
            }).join('')}
                </div>

                <div class="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p class="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">餐點明細</p>
                    <div class="flex flex-col">
                        ${itemsHtml}
                    </div>
                    <div class="flex justify-between items-center pt-3 mt-2 border-t border-gray-200/80">
                        <span class="font-bold text-gray-600 text-sm">小計</span>
                        <span class="font-black text-lg text-gray-800">NT$ ${(o.total_price || 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>`;
        }).join('');

        let topNoticeHtml = '';
        if (hasCancelled) {
            topNoticeHtml = `<div class="bg-red-50 border border-red-200 text-red-600 text-[13px] font-bold px-4 py-3 rounded-2xl flex items-center gap-2 mb-4 shadow-sm"><i data-lucide="x-circle" class="w-5 h-5 shrink-0 text-red-500"></i>訂單已被取消，若需用餐請重新掃描桌上條碼。</div>`;
        } else if (validActiveOrders.length >= 2) {
            topNoticeHtml = `<div class="bg-red-50 border border-red-200 text-red-600 text-[13px] font-bold px-4 py-3 rounded-2xl flex items-center gap-2 mb-4 shadow-sm"><i data-lucide="alert-circle" class="w-5 h-5 shrink-0 text-red-500"></i>您已使用過加點功能，每筆訂單僅限加點一次喔！</div>`;
        } else if (validActiveOrders.length === 1 && allowAddon) {
            topNoticeHtml = `<div class="bg-blue-50 border border-blue-200 text-blue-600 text-[13px] font-bold px-4 py-3 rounded-2xl flex items-center gap-2 mb-4 shadow-sm"><i data-lucide="info" class="w-5 h-5 shrink-0 text-blue-500"></i>💡 若有需要，您還可以再點擊上方加點餐點喔！</div>`;
        }

        document.getElementById('tracking-cards-container').innerHTML = topNoticeHtml + cardsHtml;
        lucide.createIcons();

        checkAllOrdersCompleted();
    }

    function updateSingleStatusUI(orderId, status) {
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        const currentStep = steps.indexOf(status);

        const iconWrap = document.getElementById(`status-icon-wrap-${orderId}`);
        if (!iconWrap) return;

        const icon = document.getElementById(`status-icon-${orderId}`);
        const label = document.getElementById(`status-label-${orderId}`);
        const desc = document.getElementById(`status-desc-${orderId}`);
        const fill = document.getElementById(`progress-fill-${orderId}`);

        iconWrap.className = `w-16 h-16 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${cfg.bg} border-4 ${cfg.border}`;
        icon.setAttribute('data-lucide', cfg.icon);
        icon.className = `w-8 h-8 transition-colors duration-500 ${cfg.color}`;
        label.textContent = cfg.label;

        if (status === 'cancelled') desc.innerHTML = `很抱歉，此訂單已被取消。`;
        else if (status === 'confirmed') desc.innerHTML = '付款已確認！<br>廚房馬上開始為您準備 ✅';
        else if (status === 'preparing') desc.innerHTML = '廚師正在精心製作您的餐點 🍳';
        else if (status === 'ready') desc.innerHTML = '餐點已準備好，請至櫃檯領取！';
        else if (status === 'completed') desc.innerHTML = '感謝您的光臨，祝您用餐愉快！';

        const pct = currentStep > 0 ? (currentStep / (steps.length - 1)) * 100 : 0;
        fill.style.width = pct + '%';

        steps.forEach((s, i) => {
            const dot = document.getElementById(`step-dot-${orderId}-${i}`);
            const lbl = document.getElementById(`step-label-${orderId}-${i}`);
            if (!dot) return;

            if (i < currentStep) {
                dot.className = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-[3px] transition-all duration-500 bg-emerald-500 border-emerald-500 text-white';
                dot.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i>';
                lbl.className = 'text-[10px] font-bold text-emerald-500 whitespace-nowrap transition-colors duration-500';
            } else if (i === currentStep) {
                dot.className = `w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-[3px] transition-all duration-500 ${cfg.bg} ${cfg.border} ${cfg.color}`;
                dot.textContent = i + 1;
                lbl.className = `text-[10px] font-black whitespace-nowrap transition-colors duration-500 ${cfg.color}`;
            } else {
                dot.className = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-[3px] transition-all duration-500 bg-white border-gray-200 text-gray-400';
                dot.textContent = i + 1;
                lbl.className = 'text-[10px] font-bold text-gray-400 whitespace-nowrap transition-colors duration-500';
            }
        });

        lucide.createIcons();
    }

    function checkAllOrdersCompleted() {
        const statuses = Object.values(orderStatuses);
        if (statuses.length === 0) return;

        // 確保所有追蹤中的訂單狀態都已載入
        const activeOrderIds = JSON.parse(localStorage.getItem(`active_orders_${storeId}`) || '[]').map(o => o.orderId);
        if (activeOrderIds.some(id => !orderStatuses[id])) return; // 還有訂單狀態未載入

        const allDone = statuses.every(s => s === 'completed' || s === 'cancelled');
        const isDismissed = sessionStorage.getItem(`completed_dismissed_${storeId}`);

        if (allDone && completedModalShownCount !== statuses.length) {
            const hasCancelled = statuses.some(s => s === 'cancelled');
            if (!isDismissed) {
                if (hasCancelled) showCancelledModal();
                else showAllCompletedModal();
            } else {
                showCompletedInfoModal();
            }
            completedModalShownCount = statuses.length;
        }
    }

    // 🌟 獨立的溫柔提示模組 (支援動態文字)
    function showCompletedInfoModal() {
        const activeCount = Object.keys(orderStatuses).length;
        const canAddOn = activeCount === 1 && allowAddon;

        // 🌟 核心：如果他還可以加點，文案就變成「鼓勵加點」！
        let titleText = canAddOn ? '餐點已全數完成' : '訂單已結束';
        let descText = canAddOn ? '祝您用餐愉快！😋<br>若需加點，請點擊上方「加點餐點」！' : '所有訂單均已完成。<br>若需再次點餐，請重新掃描桌上條碼！';

        const alertModal = document.getElementById('custom-alert-modal');
        if (alertModal) {
            const iconContainer = alertModal.querySelector('.w-16.h-16');
            if (iconContainer) {
                iconContainer.className = "w-16 h-16 bg-blue-50 border-4 border-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-5";
                iconContainer.innerHTML = '<i data-lucide="info" class="w-8 h-8"></i>';
            }
            alertModal.querySelector('h3').textContent = titleText;
            alertModal.querySelector('p').innerHTML = descText;
            const btn = document.getElementById('btn-close-custom-alert');
            btn.textContent = '我知道了';
            btn.className = "w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-500/20";

            alertModal.classList.remove('hidden');
            lucide.createIcons();
            setTimeout(() => {
                alertModal.classList.remove('opacity-0');
                alertModal.querySelector('.modal-card').classList.remove('scale-95');
            }, 10);
        }
    }

    function showCancelledModal() {
        let modal = document.getElementById('cancelled-modal');
        if (!modal) {
            const html = `
            <div id="cancelled-modal" class="fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-opacity duration-300 opacity-0">
                <div class="absolute inset-0 bg-gray-900/70 backdrop-blur-sm"></div>
                <div class="relative bg-white w-full max-w-[320px] rounded-[24px] shadow-2xl p-8 text-center transform scale-95 transition-all duration-300 modal-card">
                    <div class="w-16 h-16 bg-red-50 border-4 border-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5">
                        <i data-lucide="x-circle" class="w-8 h-8"></i>
                    </div>
                    <h3 class="text-xl font-black text-gray-800 mb-2">訂單被取消</h3>
                    <p class="text-sm font-bold text-gray-500 mb-8 leading-relaxed">造成您的不方便很抱歉<br>請重新掃描條碼點餐</p>
                    <div class="flex gap-3">
                        <button id="btn-close-cancelled" class="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 shadow-md shadow-red-500/20 text-sm">我知道了</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            lucide.createIcons();
            modal = document.getElementById('cancelled-modal');

            document.getElementById('btn-close-cancelled').onclick = () => {
                sessionStorage.setItem(`completed_dismissed_${storeId}`, 'true');
                try { window.close(); } catch (e) { }

                setTimeout(() => {
                    localStorage.removeItem(`active_orders_${storeId}`);
                    sessionStorage.removeItem(`completed_dismissed_${storeId}`);
                    document.body.innerHTML = `
                        <div class="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] p-6 text-center">
                            <div class="w-24 h-24 bg-red-50 border-4 border-red-100 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
                                <i data-lucide="x-circle" class="w-12 h-12"></i>
                            </div>
                            <h2 class="text-2xl font-black text-gray-800 mb-2">訂單已取消</h2>
                            <p class="text-gray-500 font-bold leading-relaxed">請重新掃描桌上條碼點餐</p>
                        </div>
                    `;
                    lucide.createIcons();
                }, 300);
            };
        }

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.modal-card').classList.remove('scale-95');
        }, 10);
    }

    function showAllCompletedModal() {
        let modal = document.getElementById('all-completed-modal');
        const activeCount = Object.keys(orderStatuses).length;
        const canAddOn = activeCount === 1 && allowAddon;

        // 🌟 核心：如果只有主單完成，鼓勵他加點！
        let titleText = canAddOn ? '餐點已全數完成！' : '所有訂單已完成！';
        let descText = canAddOn ? '祝您用餐愉快！😋<br>若尚未吃飽，可點擊上方按鈕繼續加點喔！' : '感謝您的光臨，祝您用餐愉快！<br>請問要關閉此視窗嗎？';

        if (!modal) {
            const html = `
            <div id="all-completed-modal" class="fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-opacity duration-300 opacity-0">
                <div class="absolute inset-0 bg-gray-900/70 backdrop-blur-sm"></div>
                <div class="relative bg-white w-full max-w-[320px] rounded-[24px] shadow-2xl p-8 text-center transform scale-95 transition-all duration-300 modal-card">
                    <div class="w-16 h-16 bg-emerald-50 border-4 border-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5">
                        <i data-lucide="check-circle" class="w-8 h-8"></i>
                    </div>
                    <h3 id="all-completed-title" class="text-xl font-black text-gray-800 mb-2">${titleText}</h3>
                    <p id="all-completed-desc" class="text-sm font-bold text-gray-500 mb-8 leading-relaxed">${descText}</p>
                    <div class="flex gap-3">
                        <button id="btn-stay-page" class="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 font-bold py-3.5 rounded-xl transition-all active:scale-95 text-sm">保留畫面</button>
                        <button id="btn-close-window" class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 shadow-md shadow-emerald-500/20 text-sm">離開點餐</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            lucide.createIcons();
            modal = document.getElementById('all-completed-modal');

            document.getElementById('btn-stay-page').onclick = () => {
                sessionStorage.setItem(`completed_dismissed_${storeId}`, 'true');
                modal.classList.add('opacity-0');
                modal.querySelector('.modal-card').classList.add('scale-95');
                setTimeout(() => modal.classList.add('hidden'), 300);
            };

            document.getElementById('btn-close-window').onclick = () => {
                try { window.close(); } catch (e) { }
                setTimeout(() => {
                    localStorage.removeItem(`active_orders_${storeId}`);
                    sessionStorage.removeItem(`completed_dismissed_${storeId}`);
                    document.body.innerHTML = `
                        <div class="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] p-6 text-center">
                            <div class="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
                                <i data-lucide="check-circle" class="w-12 h-12"></i>
                            </div>
                            <h2 class="text-2xl font-black text-gray-800 mb-2">感謝您的光臨！</h2>
                            <p class="text-gray-500 font-bold leading-relaxed">訂單已全數完成<br>您可以直接關閉此網頁了喔</p>
                        </div>
                    `;
                    lucide.createIcons();
                }, 300);
            };
        } else {
            document.getElementById('all-completed-title').innerHTML = titleText;
            document.getElementById('all-completed-desc').innerHTML = descText;
        }

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.modal-card').classList.remove('scale-95');
        }, 10);
    }

    function enforceInteractionAndSetupBackLock() {
        const statuses = Object.values(orderStatuses);
        const allDone = statuses.length > 0 && statuses.every(s => s === 'completed' || s === 'cancelled');

        if (!allDone) {
            const alertModal = document.getElementById('custom-alert-modal');
            if (alertModal) {
                const iconContainer = alertModal.querySelector('.w-16.h-16');
                if (iconContainer) {
                    iconContainer.className = "w-16 h-16 bg-blue-50 border-4 border-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-5";
                    iconContainer.innerHTML = '<i data-lucide="refresh-cw" class="w-8 h-8"></i>';
                }

                alertModal.querySelector('h3').textContent = '訂單已同步';
                alertModal.querySelector('p').innerHTML = '為您獲取最新進度，<br>請隨時留意叫號通知！';
                const btn = document.getElementById('btn-close-custom-alert');
                btn.textContent = '查看進度';
                btn.className = "w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-500/20";

                alertModal.classList.remove('hidden');
                lucide.createIcons();
                setTimeout(() => {
                    alertModal.classList.remove('opacity-0');
                    alertModal.querySelector('.modal-card').classList.remove('scale-95');
                }, 10);
            }
        }

        // 多推幾層 history，讓 Chrome 退回需要更多步
        for (let i = 0; i < 5; i++) {
            window.history.pushState({ page: 'trap' }, null, window.location.href);
        }
        window.history.pushState({ page: 'current' }, null, window.location.href);

        window.addEventListener('popstate', function (event) {
            if (isIntentionalNavigation) return;
            window.history.pushState({ page: 'current' }, null, window.location.href);

            const currentStatuses = Object.values(orderStatuses);
            const isFinished = currentStatuses.length > 0 && currentStatuses.every(s => s === 'completed' || s === 'cancelled');

            // iOS Safari 需要額外的 pagehide 攔截
            window.addEventListener('pagehide', function (e) {
                if (isIntentionalNavigation) return;
                const currentStatuses = Object.values(orderStatuses);
                const isFinished = currentStatuses.length > 0 && currentStatuses.every(s => s === 'completed' || s === 'cancelled');
                if (!isFinished) {
                    e.preventDefault();
                }
            });

            const alertModal = document.getElementById('custom-alert-modal');
            if (alertModal) {
                const iconContainer = alertModal.querySelector('.w-16.h-16');

                if (!isFinished) {
                    if (iconContainer) {
                        iconContainer.className = "w-16 h-16 bg-amber-50 border-4 border-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-5";
                        iconContainer.innerHTML = '<i data-lucide="alert-triangle" class="w-8 h-8"></i>';
                    }
                    alertModal.querySelector('h3').textContent = '請勿離開喔！';
                    alertModal.querySelector('p').innerHTML = '您的訂單尚未完成，<br>離開可能會錯過叫號通知喔！';
                    const btn = document.getElementById('btn-close-custom-alert');
                    btn.textContent = '我知道了';
                    btn.className = "w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 shadow-md shadow-amber-500/20";

                    alertModal.classList.remove('hidden');
                    lucide.createIcons();
                    setTimeout(() => {
                        alertModal.classList.remove('opacity-0');
                        alertModal.querySelector('.modal-card').classList.remove('scale-95');
                    }, 10);
                } else {
                    showCompletedInfoModal();
                }
            }
        });

        window.addEventListener('beforeunload', function (e) {
            if (isIntentionalNavigation) return;

            const currentStatuses = Object.values(orderStatuses);
            const isFinished = currentStatuses.length > 0 && currentStatuses.every(s => s === 'completed' || s === 'cancelled');
            if (!isFinished) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    function closeCustomAlert() {
        const alertModal = document.getElementById('custom-alert-modal');
        if (alertModal) {
            alertModal.classList.add('opacity-0');
            alertModal.querySelector('.modal-card').classList.add('scale-95');
            setTimeout(() => alertModal.classList.add('hidden'), 300);
        }
    }

    const btnCloseAlert = document.getElementById('btn-close-custom-alert');
    const bgCloseAlert = document.getElementById('btn-close-alert-bg');
    if (btnCloseAlert) btnCloseAlert.onclick = closeCustomAlert;
    if (bgCloseAlert) bgCloseAlert.onclick = closeCustomAlert;

    await initTrackingPage();
    enforceInteractionAndSetupBackLock();

    window.supabaseClient
        .channel('status-tracking')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
            payload => {
                let currentActive = JSON.parse(localStorage.getItem(`active_orders_${storeId}`) || '[]');
                if (currentActive.some(o => o.orderId === payload.new.id)) {
                    updateSingleStatusUI(payload.new.id, payload.new.status);
                    orderStatuses[payload.new.id] = payload.new.status;
                    checkAllOrdersCompleted();
                }
            })
        .subscribe();
    setInterval(async () => {
        const activeOrders = JSON.parse(localStorage.getItem('active_orders_' + storeId) || '[]');
        if (activeOrders.length === 0) return;
        const { data: dbOrders } = await window.supabaseClient
            .from('orders').select('id, status')
            .in('id', activeOrders.map(o => o.orderId));
        if (dbOrders) {
            dbOrders.forEach(o => {
                if (orderStatuses[o.id] !== o.status) {
                    updateSingleStatusUI(o.id, o.status);
                    orderStatuses[o.id] = o.status;
                    checkAllOrdersCompleted();
                }
            });
        }
    }, 5000);
});