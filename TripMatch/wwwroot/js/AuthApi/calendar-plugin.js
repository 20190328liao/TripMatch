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
                    // ★ 修改：熱匯入判斷 (Hot Import)
                    // 如果當前頁面已有日曆實例，直接呼叫頁面函式，不刷新
                    if (window._tripmatch_calendar_instance && typeof window._tripmatch_calendar_instance.importRanges === 'function') {

                        // 呼叫頁面的匯入 (會彈出覆蓋警告)
                        const success = window._tripmatch_calendar_instance.importRanges(ranges);

                        // 如果使用者按了確認覆蓋，才顯示成功提示
                        if (success) {
                            // 這裡我們不傳 redirectUrl，也不重整，僅顯示 Toast
                            if (ui.showImportSuccess) ui.showToast(`已匯入 <b>${ranges.length}</b> 個時段`, groupId, null, false);
                        }
                    }
                    else {
                        // --- 原本的邏輯 (跨頁面跳轉) ---
                        const draftData = {
                            groupId: groupId,
                            ranges: ranges,
                            importedFrom: 'LeaveDates',
                            savedAt: new Date().toISOString()
                        };
                        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
                        sessionStorage.setItem('tm_imported_group_' + groupId, '1');

                        const isMemberCenter = location.href.toLowerCase().includes('membercenter');
                        const redirectUrl = isMemberCenter ? `/Match/CalendarCheck/${groupId}` : null;

                        if (ui.showImportSuccess) {
                            ui.showImportSuccess(ranges.length, groupId, redirectUrl);
                        } else {
                            if (redirectUrl) window.location.href = redirectUrl;
                            else window.location.reload();
                        }
                    }
                } else {
                    // 沒資料 -> 設定 Pending -> 導向會員中心
                    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ groupId: groupId }));
                    if (ui.showNoDataNotice) {
                        ui.showNoDataNotice(groupId);
                    } else {
                        alert("查無行事曆資料，將為您導向設定頁面。");
                        window.location.href = '/Auth/MemberCenter#calendar_section';
                    }
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

    function waitForElement(selector, callback, maxTries = 20) {
        const el = document.querySelector(selector);
        if (el) callback(el);
        else if (maxTries > 0) setTimeout(() => waitForElement(selector, callback, maxTries - 1), 200);
    }

    async function tryShowIfPending() {
        const ui = getUI();
        if (!ui.isAllowedPendingPage || !ui.isAllowedPendingPage()) return;

        setTimeout(async () => {
            const rawPending = sessionStorage.getItem(PENDING_KEY);
            if (!rawPending) return;

            const payload = JSON.parse(rawPending);
            const isMemberCenter = location.hash === '#calendar_section';

            if (isMemberCenter) {
                if (ui.createBell) ui.createBell(payload);
                waitForElement('.btn-edit', (btn) => {
                    btn.classList.add('guide-hint');
                    const clickHandler = function () {
                        this.classList.remove('guide-hint');
                        document.querySelectorAll('.month-header .nav-btn').forEach(b => b.classList.add('guide-hint'));
                        btn.removeEventListener('click', clickHandler);
                    };
                    btn.addEventListener('click', clickHandler);
                });
                document.body.addEventListener('click', function (e) {
                    if (e.target.classList.contains('day-cell') && !e.target.classList.contains('empty') && !e.target.classList.contains('locked')) {
                        document.querySelectorAll('.month-header .nav-btn').forEach(b => b.classList.remove('guide-hint'));
                        const confirmBtn = document.getElementById('btn-confirm');
                        if (confirmBtn) confirmBtn.classList.add('guide-hint');
                    }
                });
            } else if (ui.createBell) {
                ui.createBell(payload);
            }
        }, 300);
    }

    function init() {
        tryShowIfPending();
        window.addEventListener('hashchange', tryShowIfPending);
        document.addEventListener('calendarui:importConfirmed', (ev) => handleImport(ev.detail));
        document.addEventListener('calendar:saved', () => {
            const ui = getUI();
            if (ui.shakeBell) ui.shakeBell();
        });
        document.body.addEventListener('click', function (e) {
            const btn = e.target.closest('#btn-confirm');
            if (btn) {
                btn.classList.remove('guide-hint');
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