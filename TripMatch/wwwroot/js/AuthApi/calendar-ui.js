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
        // ★ 這裡整合了您提供的修正版 CSS
        style.textContent = `
            @keyframes tm-bell-shake { 0% { transform: rotate(0); } 15% { transform: rotate(15deg); } 30% { transform: rotate(-15deg); } 45% { transform: rotate(10deg); } 60% { transform: rotate(-10deg); } 75% { transform: rotate(5deg); } 100% { transform: rotate(0); } }
            @keyframes slideDown { from { top: -50px; opacity: 0; } to { top: 20px; opacity: 1; } }
            .tm-bell-shaking { animation: tm-bell-shake 0.8s ease-in-out infinite; background: linear-gradient(135deg, #f59e0b, #d97706) !important; }
            @keyframes tm-bell-pulse { 0% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,77,64,0.4); } 50% { transform: scale(1.14); box-shadow: 0 8px 30px rgba(0,77,64,0.45); } 100% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,77,64,0.4); } }
            .tm-bell-pulse { animation: tm-bell-pulse 650ms ease-in-out; }
            
            /* Guide Hint 基礎樣式 (移除 position: relative) */
            .guide-hint {
                border: 2px dashed #009651 !important;
                box-shadow: 0 0 10px rgba(0, 150, 81, 0.2);
                z-index: 50;
                cursor: pointer;
                box-sizing: border-box; 
            }

            /* 通用浮窗 (Tooltip) */
            .guide-hint::after {
                position: absolute;
                bottom: calc(100% + 10px); 
                left: 50%;
                transform: translateX(-50%);
                background-color: #222;
                color: #fff;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 14px;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                animation: tooltip-fade-in 0.3s forwards;
                z-index: 100;
                line-height: 1.4;
            }

            /* 浮窗小三角形 */
            .guide-hint::before {
                content: "";
                position: absolute;
                bottom: calc(100% + 2px);
                left: 50%;
                transform: translateX(-50%);
                border-width: 6px;
                border-style: solid;
                border-color: #222 transparent transparent transparent;
                opacity: 0;
                animation: tooltip-fade-in 0.3s forwards;
                z-index: 100;
            }

            @keyframes tooltip-fade-in {
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }

            /* (1) 編輯按鈕 (.btn-edit) */
            .btn-edit.guide-hint { position: relative; }
            .btn-edit.guide-hint::after {
                content: "Step 1: 默認可直接編輯，按一下是防止誤觸";
                bottom: auto; top: -45px; 
            }
            .btn-edit.guide-hint::before {
                bottom: auto; top: -10px; border-color: #222 transparent transparent transparent;
            }

            /* (2) 月份切換箭頭 (.nav-btn) */
            .nav-btn.guide-hint { position: relative; border-radius: 50%; }
            .nav-btn.guide-hint::after {
                content: "Step 2: 切換月份";
                top: 120%; bottom: auto;
            }
            .nav-btn.guide-hint::before {
                top: 100%; bottom: auto; border-color: transparent transparent #222 transparent;
            }

            /* (3) 日期格子 (.day-cell) */
            .day-cell.guide-hint { border-radius: 50%; }
            .day-cell.guide-hint::after {
                content: "Step 3: 點擊此處選擇";
                bottom: 120%;
            }

            /* (4) 提交按鈕 (.btn-confirm) */
            .btn-confirm.guide-hint { position: relative; }
            .btn-confirm.guide-hint::after {
                content: "Step 4: 點擊提交";
                background-color: #36d79c; color: #fff;
                bottom: auto; top: -45px;
            }
            .btn-confirm.guide-hint::before {
                bottom: auto; top: -10px; border-top-color: #36d79c;
            }

            /* (5) 鈴鐺 (#tm-pending-bell) */
            #tm-pending-bell.guide-hint { position: fixed; border-radius: 50%; z-index: 10001 !important; }
            #tm-pending-bell.guide-hint::after {
                content: "Step 5: 點擊鈴鐺匯入";
                right: 120%; left: auto; top: 50%; bottom: auto;
                transform: translateY(-50%); margin-right: 10px;
            }
            #tm-pending-bell.guide-hint::before {
                right: 100%; left: auto; top: 50%; bottom: auto;
                transform: translateY(-50%);
                border-color: transparent transparent transparent #222;
                border-width: 6px; margin-right: -2px;
            }

            .tm-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 99999; backdrop-filter: blur(2px); animation: fadeIn 0.2s; }
            .tm-modal-box { max-width: 420px; width: 90%; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); text-align: center; }
            .tm-import-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: #fff; padding: 10px 20px; border-radius: 4px; box-shadow: none; font-size: 14px; font-weight: 500; z-index: 100000; display: flex; align-items: center; gap: 8px; animation: slideDown 0.3s ease-out; }
            .btn-back-link { color: var(--color_Dark, #27354A); text-decoration: underline; font-size: 0.9rem; display: inline-block; margin-top: 15px; cursor: pointer; background: none; border: none; }
            .btn-back-link:hover { opacity: 0.8; }
        `;
        document.head.appendChild(style);
    }

    // ... (其餘 JS 邏輯保持不變) ...
    ns.stepManager = {
        steps: [], index: -1, running: false,
        start(stepsArray) {
            if (!Array.isArray(stepsArray) || stepsArray.length === 0) return;
            this.cancel(); this.steps = stepsArray.slice(); this.index = -1; this.running = true; this.next();
        },
        next() {
            if (!this.running) return;
            this.index++;
            if (this.index >= this.steps.length) { this.running = false; return; }
            try {
                const fn = this.steps[this.index];
                if (typeof fn === 'function') {
                    const res = fn();
                    if (res === true) return; else setTimeout(() => this.next(), 8);
                } else { this.next(); }
            } catch (e) { this.next(); }
        },
        cancel() { this.running = false; this.steps = []; this.index = -1; }
    };

    ns.startPendingSequence = function (payload = {}) {
        ns.stepManager.start([
            () => ns.createBell(payload, { autoShake: false }),
            () => ns.openPendingModal(payload)
        ]);
    };

    ns.showBellHint = function () {
        const bell = document.getElementById(BELL_ID);
        if (bell) {
            bell.classList.add('guide-hint');
            ns.shakeBell();
        }
    };

    ns.isAllowedPendingPage = function () {
        const path = (location.pathname || '').toLowerCase();
        const hash = (location.hash || '').toLowerCase();
        return path.includes('/auth/membercenter') && hash.includes('calendar_section');
    };

    ns.showNoDataNotice = function (groupId) {
        showToast(`查無可用日期，<b>{sec}</b> 秒後跳轉至設定頁面...`, groupId, '/Auth/MemberCenter#calendar_section');
    };

    ns.showImportSuccess = function (count, groupId, redirectUrl = null) {
        const msg = redirectUrl
            ? `已匯入 <b>${count}</b> 個時段，將於 <b>{sec}</b> 秒後返回行程確認...`
            : `已匯入 <b>${count}</b> 個時段，將於 <b>{sec}</b> 秒後更新...`;
        showToast(msg, groupId, redirectUrl);
    };

    function showToast(messageTemplate, groupId, customRedirectUrl = null) {
        const old = document.getElementById(TOAST_ID);
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.className = 'tm-import-toast';
        let seconds = 2;
        const update = () => { toast.innerHTML = `<span>${messageTemplate.replace('{sec}', seconds)}</span>`; };
        update();
        document.body.appendChild(toast);
        const timer = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(timer);
                if (customRedirectUrl) window.location.href = customRedirectUrl; else window.location.reload();
            } else { update(); }
        }, 1000);
    }

    ns._savedBellState = null;

    ns.openPendingModal = function (payload = {}) {
        const bell = document.getElementById(BELL_ID);
        if (bell) {
            ns._savedBellState = { pointerEvents: bell.style.pointerEvents || '', hadGuideHint: bell.classList.contains('guide-hint') };
            bell.style.pointerEvents = 'none';
            bell.classList.remove('guide-hint');
        }
        ns.closePendingModal();

        const isMatchPage = location.pathname.toLowerCase().includes('/match/calendarcheck');

        // 變更：優先使用 payload.groupId，若沒有則回退到先前儲存的 tm_last_pending_groupId
        let groupId = payload.groupId || '';
        if (!groupId) {
            try {
                const stored = sessionStorage.getItem('tm_last_pending_groupId');
                if (stored) groupId = stored;
            } catch (e) { /* ignore */ }
        }

        const btnEditTitle = isMatchPage ? "前往設定頁面" : "繼續編輯日曆";
        const btnBackTitle = isMatchPage ? "暫不匯入" : "返回行程確認";

        const html = `
        <div class="tm-modal-overlay" id="${MODAL_ID}">
            <div class="tm-modal-box">
                <div style="font-size:3rem;margin-bottom:15px;">📅</div>
                <h3 style="margin:0 0 10px;font-weight:700;color:#333;">發現未完成的行程</h3>
                <p style="color:#666;font-size:0.95rem;margin-bottom:24px;line-height:1.4;">
                    您有針對群組 <b>${groupId || '未命名'}</b> 的暫存時段，<br>是否將您的「個人請假/空閒日期」匯入此行程？
                </p>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;gap:10px;">
                        <button id="btn-import-save" style="flex:1;padding:12px;background:#10B981;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">匯入時段</button>
                        <button id="btn-import-close" style="flex:1;padding:12px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-weight:600;cursor:pointer;">${btnEditTitle}</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <button id="btn-back-link" class="btn-back-link" style="margin:0; font-size:0.85rem;">${btnBackTitle}</button>
                        <button id="btn-dismiss-hints" style="background:transparent; border:none; color:#999; font-size:0.85rem; cursor:pointer; text-decoration:underline;">關閉教學提示</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);

        const btnSave = document.getElementById('btn-import-save');
        if (btnSave) {
            btnSave.onclick = () => {
                // 1) 派發事件給可能的 listener（保留舊行為）
                try { document.dispatchEvent(new CustomEvent('calendarui:importConfirmed', { detail: payload })); } catch (e) { /* ignore */ }

                // 2) 將 pending flag 寫回 sessionStorage，讓 /Match/CalendarCheck/{groupId} 在載入時能接手處理匯入
                ns.closePendingModal();
                try { sessionStorage.setItem('calendar_check_pending', JSON.stringify({ groupId: groupId })); } catch (e) { /* ignore */ }
                const redirectUrl = groupId ? `/Match/CalendarCheck/${encodeURIComponent(groupId)}` : '/Match/CalendarCheck';
                showToast(`正在從個人行事曆匯入資料，將於 <b>{sec}</b> 秒後返回行程確認...`, groupId, redirectUrl);

                // 關閉 modal
                ns.closePendingModal();
            };
        }

        const btnClose = document.getElementById('btn-import-close');
        if (btnClose) btnClose.onclick = () => {
            ns.closePendingModal();
            if (isMatchPage) {
                window.location.href = '/Auth/MemberCenter#calendar_section';
            } else {
                document.dispatchEvent(new CustomEvent('calendar:startTutorial'));
            }
        };

        const btnBack = document.getElementById('btn-back-link');
        if (btnBack) btnBack.onclick = () => {
            ns.closePendingModal();
            if (isMatchPage) {
                ns.createBell(payload);
            } else {
                // 變更：若 modal 裡的 groupId 為空，嘗試從 sessionStorage 取回最後一次儲存的 groupId
                let targetGroupId = groupId || '';
                if (!targetGroupId) {
                    try {
                        targetGroupId = sessionStorage.getItem('tm_last_pending_groupId') || '';
                    } catch (e) { targetGroupId = ''; }
                }
                window.location.href = `/Match/CalendarCheck/${targetGroupId}`;
            }
        };

        const btnDismiss = document.getElementById('btn-dismiss-hints');
        if (btnDismiss) btnDismiss.onclick = () => { document.dispatchEvent(new CustomEvent('calendarui:dismissHints')); ns.closePendingModal(); ns.createBell(payload); };
        return true;
    };

    ns.closePendingModal = function () {
        const el = document.getElementById(MODAL_ID);
        if (el) el.remove();
        const bell = document.getElementById(BELL_ID);
        if (bell) { bell.style.pointerEvents = 'auto'; bell.style.display = ''; ns._savedBellState = null; }
    };

    ns.createBell = function (payload, options = {}) {
        const autoShake = options && options.autoShake === true;
        let bell = document.getElementById(BELL_ID);
        if (!bell) {
            bell = document.createElement('div');
            bell.id = BELL_ID;
            bell.style.cssText = `position:fixed;bottom:30px;right:30px;width:56px;height:56px;background:linear-gradient(135deg, #00b6b1, #006c4b);border-radius:50%;box-shadow:0 4px 15px rgba(0,77,64,0.4);z-index:9990;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.2s,background 0.3s;pointer-events:auto;`;
            bell.innerHTML = `<svg width="24" height="24" viewBox="0 0 16 16" fill="white"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901z"/></svg><span style="position:absolute;top:0;right:0;width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;"></span>`;
            bell.onmouseenter = () => bell.style.transform = 'scale(1.1)';
            bell.onmouseleave = () => bell.style.transform = 'scale(1)';
            document.body.appendChild(bell);
        }
        bell.onclick = (e) => { e.stopPropagation(); ns.openPendingModal(payload); };
        bell.style.display = '';
        if (autoShake) { bell.classList.remove('tm-bell-pulse'); void bell.offsetWidth; bell.classList.add('tm-bell-pulse'); setTimeout(() => bell.classList.remove('tm-bell-pulse'), 750); }
        return true;
    };

    ns.pulseBell = function () {
        const bell = document.getElementById(BELL_ID);
        if (!bell) return false;
        bell.classList.remove('tm-bell-pulse'); void bell.offsetWidth; bell.classList.add('tm-bell-pulse'); setTimeout(() => bell.classList.remove('tm-bell-pulse'), 750);
        return false;
    };
    ns.destroyBell = function () { const el = document.getElementById(BELL_ID); if (el) el.remove(); };
    ns.shakeBell = function () {
        const bell = document.getElementById(BELL_ID);
        if (!bell) return false;
        bell.classList.remove('tm-bell-shaking'); void bell.offsetWidth; bell.classList.add('tm-bell-shaking'); setTimeout(() => { bell.classList.remove('tm-bell-shaking'); }, 2500); return false;
    };
})();

function ensureBellOnAllowedPage() {
    try {
        const ns = window.CalendarUI || {};
        if (!ns.isAllowedPendingPage || !ns.createBell) return;

        if (ns.isAllowedPendingPage()) {
            let payload = {};
            const raw = sessionStorage.getItem('calendar_check_pending');
            if (raw) { try { payload = JSON.parse(raw); 
                    // 變更：若 payload 含 groupId，儲存到 tm_last_pending_groupId，讓後續返回行程可以使用
                    if (payload && payload.groupId) {
                        try { sessionStorage.setItem('tm_last_pending_groupId', payload.groupId); } catch (e) { /* ignore */ }
                    }
                } catch { } }

            ns.createBell(payload, { autoShake: false });

            if (raw) {
                setTimeout(() => {
                    if (typeof ns.startPendingSequence === 'function') {
                        ns.startPendingSequence(payload);
                    }
                    // 保留原有行為：移除原始 pending 資訊（tm_last_pending_groupId 仍保留作為回退）
                    try { sessionStorage.removeItem('calendar_check_pending'); } catch (e) { }
                }, 600);
            }
        } else {
            if (ns.destroyBell) ns.destroyBell();
        }
    } catch (e) { }
}

document.addEventListener('DOMContentLoaded', ensureBellOnAllowedPage);
window.addEventListener('hashchange', () => { setTimeout(ensureBellOnAllowedPage, 50); });

(function () {
    'use strict';
    function dismissHints() {
        try { localStorage.setItem('tm_hints_dismissed', '1'); } catch (e) { }
        document.querySelectorAll('.guide-hint').forEach(el => el.classList.remove('guide-hint'));
        const bell = document.getElementById('tm-pending-bell');
        if (bell) bell.classList.remove('guide-hint');
        document.dispatchEvent(new CustomEvent('calendarui:dismissHints'));
        try { if (window.CalendarUI && typeof window.CalendarUI.closePendingModal === 'function') window.CalendarUI.closePendingModal(); } catch (e) { }
    }
    document.addEventListener('click', function (ev) {
        const btn = ev.target && ev.target.closest ? ev.target.closest('#btn-dismiss-hints') : null;
        if (!btn) return;
        ev.preventDefault();
        dismissHints();
    });
    try {
        if (localStorage.getItem('tm_hints_dismissed') === '1') {
            document.querySelectorAll('.guide-hint').forEach(el => el.classList.remove('guide-hint'));
            const bell = document.getElementById('tm-pending-bell');
            if (bell) bell.classList.remove('guide-hint');
        }
    } catch (e) { }
})();