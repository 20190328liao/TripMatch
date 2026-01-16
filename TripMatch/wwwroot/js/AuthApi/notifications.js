
(function () {
    'use strict';

    const API = {
        notifications: '/api/notifications',
        markRead: id => `/api/notifications/markread/${id}`,
        dismissAll: '/api/notifications/dismissall',
        emailConfirmed: '/api/userstatus/emailconfirmed'
    };

    async function fetchJson(url, options = {}) {
        const res = await fetch(url, Object.assign({ credentials: 'include' }, options));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async function fetchNotifications() {
        try {
            const items = await fetchJson(API.notifications);
            renderNotifications(items || []);
        } catch (e) {
            // console.debug('fetchNotifications error', e);
        }
    }

    function clearNotificationBar() {
        const bar = document.querySelector('.notification_bar');
        if (!bar) return;
        bar.classList.remove('has-notification');
        bar.innerHTML = '<i class="bi bi-bell"></i>';
    }

    function renderNotifications(items) {
        const bar = document.querySelector('.notification_bar');
        if (!bar) return;

        if (!items || items.length === 0) {
            clearNotificationBar();
            return;
        }

        // 只顯示第一則未讀通知（可擴充成下拉清單）
        const first = items.find(i => !i.isRead) || items[0];
        if (!first) {
            clearNotificationBar();
            return;
        }

        bar.classList.add('has-notification');
        bar.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'notif-wrapper d-flex align-items-center gap-2';

        const icon = document.createElement('i');
        icon.className = 'bi bi-bell-fill text-warning';

        const msg = document.createElement('div');
        msg.className = 'notif-msg text-truncate';
        msg.style.maxWidth = '60ch';
        msg.textContent = first.message || '您有新通知';

        const btnAcknow = document.createElement('button');
        btnAcknow.className = 'btn btn-sm btn-light ms-2';
        btnAcknow.textContent = '我知道了';
        btnAcknow.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch(API.markRead(first.id), { method: 'POST', credentials: 'include' });
            } catch (ex) {
                console.error('markRead error', ex);
            } finally {
                fetchNotifications();
            }
        });

        const btnView = document.createElement('button');
        btnView.className = 'btn btn-sm btn-link';
        btnView.textContent = '查看';
        btnView.addEventListener('click', () => {
            // 直接回到會員中心（或開 modal）
            location.href = '/Auth/MemberCenter';
        });

        wrapper.appendChild(icon);
        wrapper.appendChild(msg);
        wrapper.appendChild(btnAcknow);
        wrapper.appendChild(btnView);

        bar.appendChild(wrapper);
    }

    // 當 email 成功驗證後，自動清除與該類型相關的通知
    async function pollEmailConfirmedAndDismiss() {
        try {
            const status = await fetchJson(API.emailConfirmed);
            if (status && status.emailConfirmed) {
                // 若已驗證，將所有通知標為已讀（dismiss）
                await fetch(API.dismissAll, { method: 'POST', credentials: 'include' });
                clearNotificationBar();
            }
        } catch (e) {
            // console.debug('email status poll error', e);
        }
    }

    // 啟動：頁面載入時立即抓一次，之後定期抓取
    document.addEventListener('DOMContentLoaded', function () {
        // 首次載入
        fetchNotifications();
        pollEmailConfirmedAndDismiss();

        // 每 1 分鐘更新通知
        setInterval(fetchNotifications, 60 * 1000);

        // 每 20 秒檢查 Email 是否已驗證（若已驗證會自動 dismiss）
        setInterval(pollEmailConfirmedAndDismiss, 20 * 1000);
    });
})();