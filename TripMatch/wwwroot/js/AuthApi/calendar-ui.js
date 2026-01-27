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

            /* 鈴鐺 Pulse 動畫 */
            @keyframes tm-bell-pulse {
                0% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,77,64,0.4); }
                50% { transform: scale(1.14); box-shadow: 0 8px 30px rgba(0,77,64,0.45); }
                100% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,77,64,0.4); }
            }
            .tm-bell-pulse { animation: tm-bell-pulse 650ms ease-in-out; }
            
            /* 全域提示樣式 */
            @keyframes tm-guide-pulse {
                0% { box-shadow: 0 0 0 0 rgba(98, 222, 177, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(98, 222, 177, 0); }
                100% { box-shadow: 0 0 0 0 rgba(98, 222, 177, 0); }
            }
            .guide-hint {
                box-shadow: 0 0 0 4px rgba(98, 222, 177, 0.6) !important;
                border-color: #62DEB1 !important;
                animation: tm-guide-pulse 1.5s infinite;
                z-index: 100;
                position: relative;
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
                text-decoration: underline;
                font-size: 0.9rem;
                display: inline-block;
                margin-top: 15px;
                cursor: pointer;
                background: none;
                border: none;
            }
            .btn-back-link:hover { opacity: 0.8; }
        `;
        document.head.appendChild(style);
    }

    // Step 管理器
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
        stepDone() { setTimeout(() => this.next(), 120); },
        cancel() { this.running = false; this.steps = []; this.index = -1; }
    };

    ns.startPendingSequence = function (payload = {}) {
        ns.stepManager.start([
            () => ns.createBell(payload, { autoShake: false }),
            () => ns.openPendingModal(payload),
            () => ns.shakeBell()
        ]);
    };

    ns.isAllowedPendingPage = function () {
        const path = (location.pathname || '').toLowerCase();
        const hash = location.hash;
        return (path.includes('/membercenter') && hash === '#calendar_section') || path.includes('/match/calendarcheck');
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
        const update = () => {
            toast.innerHTML = `<span>${messageTemplate.replace('{sec}', seconds)}</span>`;
        };

        update();
        document.body.appendChild(toast);

        const timer = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(timer);
                if (customRedirectUrl) {
                    window.location.href = customRedirectUrl;
                } else {
                    window.location.reload();
                }
            } else {
                update();
            }
        }, 1000);
    }

    ns._savedBellState = null;

    ns.openPendingModal = function (payload = {}) {
        const bell = document.getElementById(BELL_ID);
        if (bell) {
            ns._savedBellState = {
                pointerEvents: bell.style.pointerEvents || '',
                hadGuideHint: bell.classList.contains('guide-hint')
            };
            bell.style.pointerEvents = 'none';
            bell.classList.remove('guide-hint');
        }
        ns.closePendingModal();

        const isMatchPage = location.pathname.toLowerCase().includes('/match/calendarcheck');
        const groupId = payload.groupId || '';

        const btnEditTitle = isMatchPage ? "前往設定頁面" : "繼續編輯日曆";
        const btnBackTitle = isMatchPage ? "暫不匯入" : "返回行程確認";

        const html = `
        <div class="tm-modal-overlay" id="${MODAL_ID}">
            <div class="tm-modal-box">
                <div style="font-size:3rem;margin-bottom:15px;">📅</div>
                <h3 style="margin:0 0 10px;font-weight:700;color:#333;">發現未完成的行程</h3>
                <p style="color:#666;font-size:0.95rem;margin-bottom:24px;line-height:1.5;">
                    您有針對群組 <b>${groupId || '未命名'}</b> 的暫存時段，<br>
                    是否將您的「個人請假/空閒日期」匯入此行程？
                </p>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;gap:10px;">
                        <button id="btn-import-save" style="flex:1;padding:12px;background:#10B981;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">匯入時段</button>
                        <button id="btn-import-close" style="flex:1;padding:12px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-weight:600;cursor:pointer;">${btnEditTitle}</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <button id="btn-back-link" class="btn-back-link" style="margin:0; font-size:0.85rem;">${btnBackTitle}</button>
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
                ns.closePendingModal();
                if (isMatchPage) {
                    window.location.href = '/Auth/MemberCenter#calendar_section';
                } else {
                    ns.createBell(payload);
                }
            };
        }

        const btnBack = document.getElementById('btn-back-link');
        if (btnBack) {
            btnBack.onclick = () => {
                ns.closePendingModal();
                if (isMatchPage) {
                    ns.createBell(payload);
                } else {
                    window.location.href = `/Match/CalendarCheck/${groupId}`;
                }
            }
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
    };

    ns.closePendingModal = function () {
        const el = document.getElementById(MODAL_ID);
        if (el) el.remove();
        const bell = document.getElementById(BELL_ID);
        if (bell) {
            bell.style.pointerEvents = 'auto';
            bell.style.display = '';
            if (ns._savedBellState && ns._savedBellState.hadGuideHint) {
                bell.classList.add('guide-hint');
            }
            ns._savedBellState = null;
        }
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
        bell.onclick = (e) => {
            e.stopPropagation();
            ns.openPendingModal(payload);
        };
        bell.style.display = '';
        bell.style.pointerEvents = 'auto';
        if (autoShake) {
            bell.classList.remove('tm-bell-pulse');
            void bell.offsetWidth;
            bell.classList.add('tm-bell-pulse');
            setTimeout(() => bell.classList.remove('tm-bell-pulse'), 750);
        }
        return true;
    };

    ns.pulseBell = function () {
        const bell = document.getElementById(BELL_ID);
        if (!bell) return false;
        bell.classList.remove('tm-bell-pulse');
        void bell.offsetWidth;
        bell.classList.add('tm-bell-pulse');
        setTimeout(() => bell.classList.remove('tm-bell-pulse'), 750);
        return false;
    };

    ns.destroyBell = function () {
        const el = document.getElementById(BELL_ID);
        if (el) el.remove();
    };

    ns.shakeBell = function () {
        const bell = document.getElementById(BELL_ID);
        if (!bell) return false;
        bell.classList.remove('tm-bell-shaking');
        void bell.offsetWidth;
        bell.classList.add('tm-bell-shaking');
        setTimeout(() => { bell.classList.remove('tm-bell-shaking'); }, 2500);
        return false;
    };
})();

// Helper Functions
function getGroupIdFromPath() {
    try {
        const parts = (location.pathname || '').split('/').filter(Boolean);
        const idx = parts.map(p => p.toLowerCase()).indexOf('calendarcheck');
        if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1];
    } catch (e) { }
    return null;
}

// ★ 修復：CalendarCheck 頁面要主動抓 ID
function ensureBellOnAllowedPage() {
    try {
        const ns = window.CalendarUI || {};
        if (!ns.isAllowedPendingPage || !ns.createBell) return;

        if (ns.isAllowedPendingPage()) {
            const path = (location.pathname || '').toLowerCase();
            if (path.includes('/match/calendarcheck')) {

                // 1. 嘗試從 URL 抓 GroupId
                const currentGid = getGroupIdFromPath();

                // 2. 建立鈴鐺時帶入 payload，這樣 openPendingModal 才有資料
                ns.createBell({ groupId: currentGid }, { autoShake: false });

                // 3. 檢查是否剛匯入回來 (旗標邏輯)
                if (currentGid) {
                    const key = 'tm_imported_group_' + currentGid;
                    try {
                        if (sessionStorage.getItem(key)) {
                            sessionStorage.removeItem(key);
                            if (typeof ns.startPendingSequence === 'function') {
                                ns.startPendingSequence({ groupId: currentGid });
                            }
                        }
                    } catch (e) { }
                }
            } else {
                ns.createBell({}, { autoShake: false });
            }
        }
    } catch (e) { }
}

document.addEventListener('DOMContentLoaded', ensureBellOnAllowedPage);
window.addEventListener('hashchange', () => { setTimeout(ensureBellOnAllowedPage, 50); });