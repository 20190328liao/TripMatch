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

    ns.isAllowedPendingPage = function () {
        const path = (location.pathname || '').toLowerCase();
        const hash = location.hash;
        return (path.includes('/membercenter') && hash === '#calendar_section') || path.includes('/match/calendarcheck');
    };

    ns.openPendingModal = function (payload = {}) {
        ns.closePendingModal();
        ns.destroyBell();

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

        document.getElementById('btn-import-save').onclick = () => {
            document.dispatchEvent(new CustomEvent('calendarui:importConfirmed', { detail: payload }));
            ns.closePendingModal();
        };

        document.getElementById('btn-import-close').onclick = () => {
            const isMatchPage = location.pathname.toLowerCase().includes('/match/calendarcheck');
            if (isMatchPage) {
                window.location.href = '/Auth/MemberCenter#calendar_section';
            } else {
                ns.closePendingModal();
                ns.createBell(payload);
            }
        };

        // ★ 新增：綁定消除指示按鈕事件
        document.getElementById('btn-dismiss-hints').onclick = () => {
            document.dispatchEvent(new CustomEvent('calendarui:dismissHints'));
            ns.closePendingModal();
            ns.createBell(payload);
        };
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

    ns.closePendingModal = function () {
        const el = document.getElementById(MODAL_ID);
        if (el) el.remove();
    };

    ns.createBell = function (payload) {
        if (document.getElementById(BELL_ID)) return;
        const bell = document.createElement('div');
        bell.id = BELL_ID;
        bell.style.cssText = `position:fixed;bottom:30px;right:30px;width:56px;height:56px;background:linear-gradient(135deg, #00695c, #004d40);border-radius:50%;box-shadow:0 4px 15px rgba(0,77,64,0.4);z-index:9990;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.2s,background 0.3s;`;


        bell.innerHTML = `<svg width="24" height="24" viewBox="0 0 16 16" fill="white"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901z"/></svg><span style="position:absolute;top:0;right:0;width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;"></span>`;
        bell.onmouseenter = () => bell.style.transform = 'scale(1.1)';
        bell.onmouseleave = () => bell.style.transform = 'scale(1)';
        bell.onclick = () => ns.openPendingModal(payload);
        document.body.appendChild(bell);
    };

    ns.destroyBell = function () {
        const el = document.getElementById(BELL_ID);
        if (el) el.remove();
    };

    ns.shakeBell = function () {
        const bell = document.getElementById(BELL_ID);
        if (bell) {

            bell.classList.add('guide-hint');

            bell.classList.remove('tm-bell-shaking');
            void bell.offsetWidth;
            bell.classList.add('tm-bell-shaking');
            setTimeout(() => bell.classList.remove('tm-bell-shaking'), 2500);   }
    };
})();