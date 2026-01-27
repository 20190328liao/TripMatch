(function () {
    'use strict';
    const ns = (window.CalendarUI = window.CalendarUI || {});
    const MODAL_ID = 'tm-pending-modal';
    const BELL_ID = 'tm-pending-bell';
    const TOAST_ID = 'tm-import-toast';

    // 1. 動態注入 CSS
    const styleId = 'tm-calendar-ui-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes tm-bell-shake {
                0% { transform: rotate(0); } 15% { transform: rotate(15deg); } 30% { transform: rotate(-15deg); }
                45% { transform: rotate(10deg); } 60% { transform: rotate(-10deg); } 75% { transform: rotate(5deg); } 100% { transform: rotate(0); }
            }
            @keyframes slideDown { from { top: -50px; opacity: 0; } to { top: 20px; opacity: 1; } }

            .tm-bell-shaking { animation: tm-bell-shake 0.8s ease-in-out infinite; background: linear-gradient(135deg, #f59e0b, #d97706) !important; }

            /* pulse 實作：短暫高亮/放大，供 step4 使用 */
            @keyframes tm-bell-pulse {
                0% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,77,64,0.4); }
                50% { transform: scale(1.14); box-shadow: 0 8px 30px rgba(0,77,64,0.45); }
                100% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,77,64,0.4); }
            }
            .tm-bell-pulse {
                animation: tm-bell-pulse 650ms ease-in-out;
            }
            
            .tm-modal-overlay { 
                position: fixed; inset: 0; background: rgba(0,0,0,0.5); 
                display: flex; align-items: center; justify-content: center; 
                z-index: 99999; backdrop-filter: blur(2px); animation: fadeIn 0.2s; 
            }
            .tm-modal-box { 
                max-width: 420px; width: 90%; background: #fff; 
                border-radius: 16px; padding: 24px; 
                box-shadow: 0 20px 50px rgba(0,0,0,0.2); text-align: center; 
            }
            
            .tm-import-toast {
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.85); color: #fff; 
                padding: 10px 20px; border-radius: 4px; box-shadow: none;
                font-size: 14px; font-weight: 500; z-index: 100000; 
                display: flex; align-items: center; gap: 8px;
                animation: slideDown 0.3s ease-out;
            }

            .btn-back-link {
                color: var(--color_Dark, #27354A);
                text-decoration: none;
                font-size: 0.9rem;
                display: inline-block;
                margin-top: 15px;
            }
            .btn-back-link:hover { text-decoration: none; opacity: 0.8; }
        `;
        document.head.appendChild(style);
    }

    // Step 管理器：確保步驟依序執行，支援「自動前進」與「等待使用者完成再前進」
    ns.stepManager = {
        steps: [],
        index: -1,
        running: false,
        // 允許重啟：若已在跑或已執行過，先 cancel 再啟動新的序列
        start(stepsArray) {
            if (!Array.isArray(stepsArray) || stepsArray.length === 0) return;
            this.cancel();
            this.steps = stepsArray.slice();
            this.index = -1;
            this.running = true;
            this.next();
        },
        next() {
            if (!this.running) return;
            this.index++;
            if (this.index >= this.steps.length) {
                this.running = false;
                return;
            }

            try {
                const fn = this.steps[this.index];
                if (typeof fn === 'function') {
                    const res = fn();
                    // 如果該 step 回傳 true，代表需等待外部呼叫 stepDone()
                    if (res === true) {
                        return;
                    } else {
                        setTimeout(() => this.next(), 8);
                    }
                } else {
                    this.next();
                }
            } catch (e) {
                console.warn('stepManager step error', e);
                this.next();
            }
        },
        stepDone() {
            // 小延遲讓 UI 轉場完成再下一步
            setTimeout(() => this.next(), 120);
        },
        cancel() {
            this.running = false;
            this.steps = [];
            this.index = -1;
        }
    };

    // 方便啟動「pending 流程」：建立鈴鐺 -> 顯示 modal（等待使用者互動）-> 在 modal 完成後觸發搖動
    ns.startPendingSequence = function (payload = {}) {
        // cancel 已在 stepManager.start 處理，可重複呼叫
        ns.stepManager.start([
            () => ns.createBell(payload, { autoShake: false }), // step1 建立但不震動
            () => ns.openPendingModal(payload),                 // step2 顯示 modal（回傳 true = 等待）
            () => ns.shakeBell()                                // step3（在 modal 完成後執行搖動）
        ]);
    };

    ns.isAllowedPendingPage = function () {
        const path = (location.pathname || '').toLowerCase();
        const hash = location.hash;
        return (path.includes('/membercenter') && hash === '#calendar_section') || path.includes('/match/calendarcheck');
    };

    // 在檔案頂端 constants 之後新增儲存狀態
ns._savedBellState = null;

// 用新的 openPendingModal 取代原實作（會在 modal 開啟時暫時停用鈴鐺互動/移除 guide-hint）
ns.openPendingModal = function (payload = {}) {
    // 暫時停用鈴鐺的互動與 tooltip，避免其 ::after 或 guide-hint 擋到 modal
    const bell = document.getElementById(BELL_ID);
    if (bell) {
        ns._savedBellState = {
            pointerEvents: bell.style.pointerEvents || '',
            hadGuideHint: bell.classList.contains('guide-hint')
        };
        bell.style.pointerEvents = 'none';
        bell.classList.remove('guide-hint');
    }

    // 移除舊的 modal（保險）
    ns.closePendingModal();

    const html = `
    <div class="tm-modal-overlay" id="${MODAL_ID}">
        <div class="tm-modal-box">
            <div style="font-size:3rem;margin-bottom:15px;">📅</div>
            <h3 style="margin:0 0 10px;font-weight:700;color:#333;">發現未完成的行程</h3>
            <p style="color:#666;font-size:0.95rem;margin-bottom:24px;line-height:1.5;">
                您有針對群組 <b>${payload.groupId || '未命名'}</b> 的暫存時段，<br>
                是否將您的「個人請假/空閒日期」匯入此行程？
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;gap:10px;">
                    <button id="btn-import-save" style="flex:1;padding:12px;background:#10B981;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">匯入時段</button>
                    <button id="btn-import-close" style="flex:1;padding:12px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-weight:600;cursor:pointer;">繼續編輯日曆</button>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                    <a href="javascript:history.back()" class="btn-back-link" style="margin:0; font-size:0.85rem;">取消並回到上一頁</a>
                    <button id="btn-dismiss-hints" style="background:transparent; border:none; color:#999; font-size:0.85rem; cursor:pointer; text-decoration:underline;">
                        關閉教學提示
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const btnSave = document.getElementById('btn-import-save');
    if (btnSave) {
        btnSave.onclick = () => {
            document.dispatchEvent(new CustomEvent('calendarui:importConfirmed', { detail: payload }));
            ns.closePendingModal();
        };
    }

    const btnClose = document.getElementById('btn-import-close');
    if (btnClose) {
        btnClose.onclick = () => {
            const isMatchPage = location.pathname.toLowerCase().includes('/match/calendarcheck');
            ns.closePendingModal();
            if (isMatchPage) {
                window.location.href = '/Auth/MemberCenter#calendar_section';
            } else {
                ns.createBell(payload);
            }
        };
    }

    const btnDismiss = document.getElementById('btn-dismiss-hints');
    if (btnDismiss) {
        btnDismiss.onclick = () => {
            document.dispatchEvent(new CustomEvent('calendarui:dismissHints'));
            ns.closePendingModal();
            ns.createBell(payload);
        };
    }

    return true;
}

// 修改 closePendingModal：在關閉 modal 時恢復鈴鐺原本狀態
ns.closePendingModal = function () {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();

    // 恢復鈴鐺的互動與 guide-hint（如果之前有暫存）
    const bell = document.getElementById(BELL_ID);
    if (bell && ns._savedBellState) {
        bell.style.pointerEvents = ns._savedBellState.pointerEvents || '';
        if (ns._savedBellState.hadGuideHint) bell.classList.add('guide-hint');
        ns._savedBellState = null;
    } else if (bell) {
        // 確保顯示並可互動
        bell.style.pointerEvents = '';
        bell.style.display = '';
    }
};

    ns.showImportSuccess = function (count, groupId) {
        showToast(`已匯入 <b>${count}</b> 個時段，將於 <b>{sec}</b> 秒後返回行程確認...`, groupId);
    };

    ns.showNoDataNotice = function (groupId) {
        showToast(`您尚未選擇休假日期，將於 <b>{sec}</b> 秒後進入編輯頁面...`, groupId, '/Auth/MemberCenter#calendar_section');
    };

    function showToast(messageTemplate, groupId, customRedirectUrl = null) {
        const old = document.getElementById(TOAST_ID);
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.className = 'tm-import-toast';

        let seconds = 3;
        const update = () => {
            toast.innerHTML = `<span>${messageTemplate.replace('{sec}', seconds)}</span>`;
        };

        update();
        document.body.appendChild(toast);

        const timer = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(timer);
                window.location.href = customRedirectUrl || `/Match/CalendarCheck/${groupId}`;
            } else {
                update();
            }
        }, 1000);
    }

    // 修改：createBell 現在若 element 已存在會重新綁定 handler 並顯示；若不存在才建立新元素
    ns.createBell = function (payload, options = {}) {
        const autoShake = options && options.autoShake === true;
        let existing = document.getElementById(BELL_ID);

        if (existing) {
            // 重新綁定 handler，確保可點擊
            existing.onclick = () => ns.openPendingModal(payload);
            existing.style.display = '';
            // 如果之前透過 openPendingModal 暫存了狀態，恢復 pointer-events 與 guide-hint 類別
            if (ns._savedBellState) {
                existing.style.pointerEvents = ns._savedBellState.pointerEvents || '';
                if (ns._savedBellState.hadGuideHint) existing.classList.add('guide-hint');
                ns._savedBellState = null;
            } else {
                existing.style.pointerEvents = '';
            }

            if (autoShake) {
                existing.classList.remove('tm-bell-pulse');
                void existing.offsetWidth;
                existing.classList.add('tm-bell-pulse');
                setTimeout(() => existing.classList.remove('tm-bell-pulse'), 750);
            }
            return true;
        }

        const bell = document.createElement('div');
        bell.id = BELL_ID;
        bell.style.cssText = `position:fixed;bottom:30px;right:30px;width:56px;height:56px;background:linear-gradient(135deg, #00b6b1, #006c4b);border-radius:50%;box-shadow:0 4px 15px rgba(0,77,64,0.4);z-index:9990;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.2s,background 0.3s;`;
        bell.innerHTML = `<svg width="24" height="24" viewBox="0 0 16 16" fill="white"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901z"/></svg><span style="position:absolute;top:0;right:0;width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;"></span>`;
        bell.onmouseenter = () => bell.style.transform = 'scale(1.1)';
        bell.onmouseleave = () => bell.style.transform = 'scale(1)';
        bell.onclick = () => ns.openPendingModal(payload);
        document.body.appendChild(bell);

        if (autoShake) {
            bell.classList.remove('tm-bell-pulse');
            void bell.offsetWidth;
            bell.classList.add('tm-bell-pulse');
            setTimeout(() => bell.classList.remove('tm-bell-pulse'), 750);
        }
        return true;
    };

    // pulseBell：輕微動畫，用於 modal 完成後的 step（不震動）
    ns.pulseBell = function () {
        const bell = document.getElementById(BELL_ID);
        if (!bell) return false;
        bell.classList.remove('tm-bell-pulse');
        // force reflow to restart animation
        void bell.offsetWidth;
        bell.classList.add('tm-bell-pulse');
        // 清除 class 在動畫結束後
        setTimeout(() => bell.classList.remove('tm-bell-pulse'), 750);
        return false;
    };

    ns.destroyBell = function () {
        const el = document.getElementById(BELL_ID);
        if (el) el.remove();
    };

    // 恢復 shake 動作：加入 tm-bell-shaking class，並於結束後移除
    ns.shakeBell = function () {
        const bell = document.getElementById(BELL_ID);
        if (!bell) return false;

        // 避免重複加入動畫：先移除再強制 reflow
        bell.classList.remove('tm-bell-shaking');
        void bell.offsetWidth;
        bell.classList.add('tm-bell-shaking');

        // 保持與原本行為相容（2.5s 後移除）
        setTimeout(() => {
            bell.classList.remove('tm-bell-shaking');
        }, 2500);

        return false;
    };
})();

// 新增：在檔案末端（仍在同一 IIFE 內）加入自動初始化與 hash-change 處理
// 將下列程式碼貼在檔案最後一段的 })(); 之前（或整個 IIFE 內的任意位置，確保在 ns.createBell 宣告之後）

// 自動在允許的頁面建立鈴鐺（避免只有在某些使用者互動下才建立）
function ensureBellOnAllowedPage() {
    try {
        if (ns.isAllowedPendingPage()) {
            // 傳入空 payload 或可從 server / data-attr 取得實際 payload
            ns.createBell({}, { autoShake: false });
        }
    } catch (e) {
        // 忽略初始化錯誤
        console.warn('CalendarUI.ensureBellOnAllowedPage error', e);
    }
}

// DOM ready 時嘗試建立鈴鐺（首次載入）
document.addEventListener('DOMContentLoaded', ensureBellOnAllowedPage);

// 當 hash 改變（例如導航至 #calendar_section）也嘗試建立或顯示鈴鐺
window.addEventListener('hashchange', () => {
    // 小延遲讓瀏覽器完成滾動/DOM 更新
    setTimeout(ensureBellOnAllowedPage, 50);
});

// 如果有 AJAX 導航或前端路由，可在那邊呼叫 CalendarUI.createBell(...) 或 CalendarUI.startPendingSequence(...)