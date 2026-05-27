// =============================================
// product-options.js — 客製化選項編輯器 (修復 iPad 頂部對齊版)
// =============================================
(function () {
    let editingOptions = [];

    const TYPE_LABELS = {
        'radio': '單選 (只能挑一項)',
        'multi': '多選 (可挑多項)',
        'text': '文字備註'
    };

    window.loadProductOptions = function (options) {
        editingOptions = JSON.parse(JSON.stringify(options || []));
        editingOptions.forEach(opt => {
            if (!opt.choices && opt.type !== 'text') opt.choices = [{ label: '', price: 0 }];
        });
        renderOptionsEditor();
    };

    window.clearProductOptions = function () {
        editingOptions = [];
        renderOptionsEditor();
    };

    function renderOptionsEditor() {
        const container = document.getElementById('options-editor');
        if (!container) return;

        container.className = "p-3 sm:p-4 space-y-4 bg-white min-h-[48px]";

        if (editingOptions.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-400"><i data-lucide="sliders-horizontal" class="w-8 h-8 mx-auto mb-2 opacity-50"></i><p class="text-sm font-bold">尚未設定客製化選項</p><p class="text-xs mt-1">點擊右上方「新增欄位」開始設定</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = editingOptions.map((opt, i) => {
            const isText = opt.type === 'text';

            let choicesHtml = '';
            if (!isText) {
                const choices = opt.choices || [];
                choicesHtml = `
                <div class="mt-4 space-y-3 pl-3 border-l-2 border-emerald-100/60">
                    ${choices.map((c, ci) => `
                    <div class="flex flex-col sm:flex-row items-start gap-2 group/choice w-full">
                        <div class="w-full sm:flex-1 min-w-0">
                            <input type="text" class="w-full h-[38px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-gray-800 placeholder-gray-400 font-bold choice-label" placeholder="輸入選項 (例：少冰)" value="${c.label || ''}" data-opt-idx="${i}" data-choice-idx="${ci}">
                            <p class="text-[10px] text-gray-400 mt-1.5 pl-1 leading-tight tracking-wide font-bold">例如：微糖、加蛋</p>
                        </div>
                        <div class="flex items-center w-full sm:w-auto gap-2 shrink-0 mt-1 sm:mt-0">
                            <div class="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 h-[38px] flex-1 sm:flex-none justify-between sm:justify-start">
                                <span class="text-[10px] font-bold text-gray-400">+NT$</span>
                                <input type="number" class="w-full sm:w-16 bg-transparent py-1 text-sm font-bold text-gray-800 outline-none text-right choice-price" placeholder="0" min="0" value="${c.price || 0}" data-opt-idx="${i}" data-choice-idx="${ci}">
                            </div>
                            <button type="button" class="w-9 h-[38px] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 btn-remove-choice" data-opt-idx="${i}" data-choice-idx="${ci}" title="刪除選項">
                                <i data-lucide="minus-circle" class="w-4.5 h-4.5 pointer-events-none"></i>
                            </button>
                        </div>
                    </div>
                    `).join('')}
                    <button type="button" class="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg transition-colors flex items-center justify-center w-full sm:w-auto gap-1.5 mt-2 btn-add-choice" data-idx="${i}">
                        <i data-lucide="plus" class="w-3.5 h-3.5 pointer-events-none"></i> 新增選項
                    </button>
                </div>`;
            }

            const customDropdownHtml = `
            <div class="relative custom-opt-type-wrapper flex-1 min-w-[130px]" data-idx="${i}">
                <button type="button" class="opt-type-btn flex items-center justify-between w-full bg-gray-50 hover:bg-white border border-gray-200 text-gray-700 rounded-xl px-4 py-2.5 text-sm font-bold transition-all shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                    <span class="truncate pr-1">${TYPE_LABELS[opt.type] || '請選擇'}</span>
                    <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 shrink-0 transition-transform dropdown-icon"></i>
                </button>
                <div class="opt-type-list absolute z-[60] w-full bottom-full mb-1.5 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden hidden opacity-0 scale-95 transition-all duration-200 origin-bottom">
                    ${Object.entries(TYPE_LABELS).map(([val, lbl]) => `
                        <div class="px-4 py-3 text-sm font-bold text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 cursor-pointer border-b border-gray-50 last:border-0 opt-type-option" data-value="${val}">
                            ${lbl}
                        </div>
                    `).join('')}
                </div>
            </div>`;

            return `
            <div class="p-4 sm:p-5 bg-white border border-gray-200 rounded-2xl shadow-sm mb-4">
                
                <div class="flex items-start justify-between gap-3 mb-2 w-full">
                    <div class="flex items-start gap-2 flex-1 min-w-0">
                        <div class="w-1.5 h-5 bg-emerald-400 rounded-full shrink-0 mt-1"></div>
                        <div class="flex-1 min-w-0">
                            <input type="text" class="w-full bg-transparent text-base font-black text-gray-800 placeholder-gray-300 outline-none focus:border-b-2 focus:border-emerald-400 transition-all min-w-0 pb-1 opt-label-input" placeholder="輸入欄位名稱" value="${opt.label || ''}" data-idx="${i}">
                            <p class="text-[10px] text-gray-400 mt-1.5 leading-tight tracking-wide font-bold">例如：甜度、加料</p>
                        </div>
                    </div>
                    <button type="button" class="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0 btn-remove-opt" data-idx="${i}" title="刪除欄位">
                        <i data-lucide="trash-2" class="w-4.5 h-4.5 pointer-events-none"></i>
                    </button>
                </div>
                
                ${choicesHtml}
                
                <div class="flex flex-col sm:flex-row gap-3 mt-5 pt-4 border-t border-gray-100">
                    ${customDropdownHtml}
                    
                    <label class="flex items-center justify-center gap-2 bg-gray-50 border border-gray-200 w-full sm:w-auto px-5 py-2.5 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors shadow-sm shrink-0">
                        <input type="checkbox" class="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500 opt-required-checkbox" data-idx="${i}" ${opt.required ? 'checked' : ''}>
                        <span class="text-sm font-bold text-gray-700">此欄位必填</span>
                    </label>
                </div>

            </div>`;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
        bindEvents();
    }

    function bindEvents() {
        const container = document.getElementById('options-editor');
        if (!container) return;

        container.querySelectorAll('.custom-opt-type-wrapper').forEach(wrapper => {
            const btn = wrapper.querySelector('.opt-type-btn');
            const list = wrapper.querySelector('.opt-type-list');
            const icon = wrapper.querySelector('.dropdown-icon');
            const idx = parseInt(wrapper.dataset.idx);

            btn.onclick = (e) => {
                e.stopPropagation();

                document.querySelectorAll('.opt-type-list').forEach(l => {
                    if (l !== list) {
                        l.classList.add('opacity-0', 'scale-95');
                        setTimeout(() => l.classList.add('hidden'), 200);
                        const otherIcon = l.parentElement.querySelector('.dropdown-icon');
                        if (otherIcon) otherIcon.classList.remove('rotate-180');
                    }
                });

                if (list.classList.contains('hidden')) {
                    list.classList.remove('hidden');
                    setTimeout(() => {
                        list.classList.remove('opacity-0', 'scale-95');
                        icon.classList.add('rotate-180');
                    }, 10);
                } else {
                    list.classList.add('opacity-0', 'scale-95');
                    icon.classList.remove('rotate-180');
                    setTimeout(() => list.classList.add('hidden'), 200);
                }
            };

            list.querySelectorAll('.opt-type-option').forEach(optEl => {
                optEl.onclick = (e) => {
                    e.stopPropagation();
                    const newVal = optEl.dataset.value;
                    const oldVal = editingOptions[idx].type;

                    if (newVal !== oldVal) {
                        editingOptions[idx].type = newVal;
                        if (newVal === 'text') {
                            editingOptions[idx].choices = [];
                        } else if (editingOptions[idx].choices.length === 0) {
                            editingOptions[idx].choices = [{ label: '', price: 0 }];
                        }
                        renderOptionsEditor();
                    } else {
                        list.classList.add('opacity-0', 'scale-95');
                        icon.classList.remove('rotate-180');
                        setTimeout(() => list.classList.add('hidden'), 200);
                    }
                };
            });
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.opt-type-list:not(.hidden)').forEach(list => {
                list.classList.add('opacity-0', 'scale-95');
                const icon = list.previousElementSibling.querySelector('.dropdown-icon');
                if (icon) icon.classList.remove('rotate-180');
                setTimeout(() => list.classList.add('hidden'), 200);
            });
        }, { once: false });

        container.querySelectorAll('.opt-label-input').forEach(el => {
            el.addEventListener('input', (e) => {
                editingOptions[e.target.dataset.idx].label = e.target.value;
            });
        });

        container.querySelectorAll('.opt-required-checkbox').forEach(el => {
            el.addEventListener('change', (e) => {
                editingOptions[e.target.dataset.idx].required = e.target.checked;
            });
        });

        container.querySelectorAll('.btn-remove-opt').forEach(el => {
            el.addEventListener('click', (e) => {
                editingOptions.splice(e.target.dataset.idx, 1);
                renderOptionsEditor();
            });
        });

        container.querySelectorAll('.btn-add-choice').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = e.target.dataset.idx;
                if (!editingOptions[idx].choices) editingOptions[idx].choices = [];
                editingOptions[idx].choices.push({ label: '', price: 0 });
                renderOptionsEditor();

                setTimeout(() => {
                    const scrollEl = document.getElementById('product-scroll-area');
                    if (scrollEl) {
                        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
                    }
                }, 50);
            });
        });

        container.querySelectorAll('.btn-remove-choice').forEach(el => {
            el.addEventListener('click', (e) => {
                const optIdx = e.target.dataset.optIdx;
                const choiceIdx = e.target.dataset.choiceIdx;
                editingOptions[optIdx].choices.splice(choiceIdx, 1);
                renderOptionsEditor();
            });
        });

        container.querySelectorAll('.choice-label').forEach(el => {
            el.addEventListener('input', (e) => {
                const optIdx = e.target.dataset.optIdx;
                const choiceIdx = e.target.dataset.choiceIdx;
                editingOptions[optIdx].choices[choiceIdx].label = e.target.value;
            });
        });

        container.querySelectorAll('.choice-price').forEach(el => {
            el.addEventListener('input', (e) => {
                const optIdx = e.target.dataset.optIdx;
                const choiceIdx = e.target.dataset.choiceIdx;
                editingOptions[optIdx].choices[choiceIdx].price = parseInt(e.target.value) || 0;
            });
        });
    }

    const btnAddOption = document.getElementById('btn-add-option');
    if (btnAddOption) {
        const newBtn = btnAddOption.cloneNode(true);
        btnAddOption.parentNode.replaceChild(newBtn, btnAddOption);

        newBtn.addEventListener('click', () => {
            editingOptions.push({
                label: '',
                type: 'radio',
                required: false,
                choices: [{ label: '', price: 0 }],
                sort_order: editingOptions.length
            });
            renderOptionsEditor();

            setTimeout(() => {
                const scrollEl = document.getElementById('product-scroll-area');
                if (scrollEl) {
                    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
                }
            }, 100);
        });
    }

    window.saveProductOptions = async function (productId, storeId) {
        try {
            await window.supabaseClient.from('product_options').delete().eq('product_id', productId);

            const validOptions = editingOptions.filter(opt => opt.label.trim() !== '');
            if (validOptions.length === 0) return;

            const payload = validOptions.map((opt, i) => {
                let cleanChoices = null;
                if (opt.type !== 'text' && opt.choices) {
                    cleanChoices = opt.choices.filter(c => c.label.trim() !== '').map(c => ({
                        label: c.label.trim(),
                        price: parseInt(c.price) || 0
                    }));
                }

                return {
                    store_id: storeId,
                    product_id: productId,
                    label: opt.label.trim(),
                    type: opt.type,
                    required: opt.required,
                    choices: cleanChoices,
                    sort_order: i
                };
            });

            const { error } = await window.supabaseClient.from('product_options').insert(payload);
            if (error) throw error;

        } catch (err) {
            console.error('儲存客製化選項失敗:', err);
            throw err;
        }
    };
})();