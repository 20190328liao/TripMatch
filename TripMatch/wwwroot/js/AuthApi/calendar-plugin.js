(() => {
    'use strict';
    const ns = (window.TripMatchCalendarPlugin = window.TripMatchCalendarPlugin || {});
    const PENDING_KEY = 'calendar_check_pending';
    const DRAFT_KEY = 'calendar_draft_ranges';

    const getUI = () => window.CalendarUI || {};

    // 1. 匯入邏輯
    async function handleImport(payload) {
        const groupId = payload.groupId || "";
        if (!groupId) return;

        try {
            const res = await fetch('/api/auth/GetLeaves', { credentials: 'include' });

            if (res.ok) {
                const data = await res.json();
                const dates = data.dates || [];
                const ui = getUI();

                const ranges = convertDatesToRanges(dates);

                if (ranges.length > 0) {
                    // 情境 A: 有資料 -> 存入暫存 -> 顯示成功 -> 跳回確認頁
                    const draftData = {
                        groupId: groupId,
                        ranges: ranges,
                        importedFrom: 'LeaveDates',
                        savedAt: new Date().toISOString()
                    };
                    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));

                    if (ui.showImportSuccess) ui.showImportSuccess(ranges.length, groupId);
                    else window.location.href = `/Match/CalendarCheck/${groupId}`;
                } else {
                    // 情境 B: 沒資料 -> 設定 Pending -> 顯示提示 -> 跳去會員中心編輯
                    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ groupId: groupId }));

                    if (ui.showNoDataNotice) ui.showNoDataNotice(groupId);
                    else window.location.href = '/Auth/MemberCenter#calendar_section';
                }
            } else {
                alert("無法讀取您的行事曆資料，請稍後再試。");
            }
        } catch (e) {
            console.error("[Plugin] Import failed", e);
            alert("匯入失敗，發生連線錯誤。");
        }
    }

    function convertDatesToRanges(dateStrings) {
        if (!dateStrings || dateStrings.length === 0) return [];
        const sorted = dateStrings.sort();
        const ranges = [];
        let start = sorted[0];
        let prev = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const curr = sorted[i];
            const prevDate = new Date(prev);
            const currDate = new Date(curr);
            const diffDays = Math.ceil(Math.abs(currDate - prevDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                prev = curr;
            } else {
                ranges.push({ startAt: `${start}T00:00:00`, endAt: `${prev}T23:59:59` });
                start = curr;
                prev = curr;
            }
        }
        ranges.push({ startAt: `${start}T00:00:00`, endAt: `${prev}T23:59:59` });
        return ranges;
    }

    // 2. 顯示與狀態判斷邏輯
    async function tryShowIfPending() {
        const ui = getUI();
        if (!ui.isAllowedPendingPage || !ui.isAllowedPendingPage()) return;

        setTimeout(async () => {
            const rawPending = sessionStorage.getItem(PENDING_KEY);
            if (!rawPending) return;

            const payload = JSON.parse(rawPending);
            const isMemberCenter = location.hash === '#calendar_section';

            if (isMemberCenter) {
                // ★ 關鍵修改：進入會員中心，無論有無資料，一律「只顯示鈴鐺」
                // 這樣使用者可以專心編輯，編輯完按確認會有搖動，再點鈴鐺匯入
                if (ui.createBell) {
                    ui.createBell(payload);
                }

                // (如果您希望有舊資料時還是要彈窗，可以解開下方的註解，但為了不阻擋您編輯，預設隱藏)
                /*
                try {
                    const res = await fetch('/api/auth/GetLeaves', { credentials: 'include' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.dates && data.dates.length > 0) {
                             if (ui.openPendingModal) ui.openPendingModal(payload);
                        }
                    }
                } catch(e) {}
                */
            }
            else if (ui.createBell) {
                // 其他頁面也是顯示鈴鐺
                ui.createBell(payload);
            }
        }, 300);
    }

    function init() {
        tryShowIfPending();
        window.addEventListener('hashchange', tryShowIfPending);
        document.addEventListener('calendarui:importConfirmed', (ev) => handleImport(ev.detail));

        // 監聽儲存後的搖動事件
        document.addEventListener('calendar:saved', () => {
            const ui = getUI();
            if (ui.shakeBell) ui.shakeBell();
        });

        // ★ 自動監聽 #btn-confirm 按鈕，按下後觸發搖動
        document.body.addEventListener('click', function (e) {
            const btn = e.target.closest('#btn-confirm');
            if (btn) {
                // 延遲 0.5 秒讓儲存動畫先跑，再搖動鈴鐺提示下一步
                setTimeout(() => {
                    const ui = getUI();
                    if (ui.shakeBell) ui.shakeBell();
                }, 500);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();