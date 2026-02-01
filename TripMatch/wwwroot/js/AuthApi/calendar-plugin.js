(() => {
    'use strict';
    const ns = (window.TripMatchCalendarPlugin = window.TripMatchCalendarPlugin || {});
    const PENDING_KEY = 'calendar_check_pending';
    const DRAFT_KEY = 'calendar_draft_ranges';

    const getUI = () => window.CalendarUI || {};

    // 1. 匯入邏輯核心
    async function handleImport(payload) {
        const groupId = payload.groupId || "";

        // 即使沒有 GroupId (MemberCenter 模式)，我們也允許匯入個人資料
        // 但如果有 GroupId (CalendarCheck 模式)，流程會稍有不同

        try {
            console.log("[Plugin] 開始呼叫 GetLeaves API...");
            const res = await fetch('/api/auth/GetLeaves', { credentials: 'include' });

            if (res.ok) {
                const data = await res.json();
                const dates = data.dates || [];
                const ui = getUI();

                console.log(`[Plugin] 取得資料: ${dates.length} 筆日期`);

                // 將單日轉換為範圍 (因為 Calendar.js 現在主要運作於 Range)
                const ranges = convertDatesToRanges(dates);

                if (ranges.length > 0) {
                    // --- 情境 A: 頁面上已經有初始化的日曆 (熱匯入) ---
                    // 優先檢查 window.Calendar (MemberCenter)
                    if (window.Calendar && typeof window.Calendar.importDates === 'function') {
                        console.log("[Plugin] 偵測到 window.Calendar，執行直接匯入");

                        // 這裡傳入空陣列給 singles，將所有日期轉為 ranges 傳入
                        window.Calendar.importDates([], ranges);

                        if (ui.showToast) ui.showToast(`已成功匯入 <b>${dates.length}</b> 個日期`, groupId, null, false);
                    }
                    // 其次檢查 window._tripmatch_calendar_instance (CalendarCheck)
                    else if (window._tripmatch_calendar_instance && typeof window._tripmatch_calendar_instance.importRanges === 'function') {
                        console.log("[Plugin] 偵測到 _tripmatch_calendar_instance，執行直接匯入");

                        const success = window._tripmatch_calendar_instance.importRanges(ranges);
                        if (success !== false) {
                            if (ui.showToast) ui.showToast(`已成功匯入 <b>${dates.length}</b> 個日期`, groupId, null, false);
                        }
                    }
                    // --- 情境 B: 跨頁面跳轉 (冷匯入) ---
                    else {
                        console.log("[Plugin] 無法直接操作日曆，準備跳轉");
                        const draftData = {
                            groupId: groupId,
                            ranges: ranges,
                            importedFrom: 'LeaveDates',
                            savedAt: new Date().toISOString()
                        };
                        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
                        if (groupId) sessionStorage.setItem('tm_imported_group_' + groupId, '1');

                        // 判斷跳轉路徑
                        const isMemberCenter = location.href.toLowerCase().includes('membercenter');

                        // 如果在 MemberCenter 但沒有 Calendar 物件(怪怪的)，重整即可
                        if (isMemberCenter) {
                            window.location.reload();
                        } else if (groupId) {
                            // 前往 CalendarCheck
                            const redirectUrl = `/Match/CalendarCheck/${groupId}`;
                            if (ui.showImportSuccess) {
                                ui.showImportSuccess(ranges.length, groupId, redirectUrl);
                            } else {
                                window.location.href = redirectUrl;
                            }
                        }
                    }
                } else {
                    console.log("[Plugin] API 回傳無資料");
                    // 沒資料 -> 設定 Pending -> 導向會員中心
                    if (groupId) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ groupId: groupId }));

                    if (ui.showNoDataNotice) {
                        ui.showNoDataNotice(groupId);
                    } else {
                        alert("查無行事曆資料。");
                        // 如果不在會員中心，才導向
                        if (!location.href.toLowerCase().includes('membercenter')) {
                            window.location.href = '/Auth/MemberCenter#calendar_section';
                        }
                    }
                }
            } else {
                console.error("[Plugin] API 回傳錯誤", res.status);
                alert("無法讀取您的行事曆資料，請稍後再試。");
            }
        } catch (e) {
            console.error("[Plugin] Import failed", e);
            alert("匯入失敗，發生連線錯誤。");
        }
    }

    // 輔助：將不連續或連續的單日陣列轉換為範圍陣列
    function convertDatesToRanges(dateStrings) {
        if (!dateStrings || dateStrings.length === 0) return [];

        // 先排序
        const sorted = dateStrings.filter(d => d).sort();
        const ranges = [];
        if (sorted.length === 0) return [];

        let start = sorted[0];
        let prev = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const curr = sorted[i];

            // 計算日期差
            const d1 = new Date(prev);
            const d2 = new Date(curr);
            const diffTime = Math.abs(d2 - d1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                // 連續日期，延伸範圍
                prev = curr;
            } else {
                // 不連續，結算上一段
                ranges.push({ start: start, end: prev });
                start = curr;
                prev = curr;
            }
        }
        // 結算最後一段
        ranges.push({ start: start, end: prev });
        return ranges;
    }

    function waitForElement(selector, callback, maxTries = 20) {
        const el = document.querySelector(selector);
        if (el) callback(el);
        else if (maxTries > 0) setTimeout(() => waitForElement(selector, callback, maxTries - 1), 200);
    }

    async function tryShowIfPending() {
        const ui = getUI();
        // 如果 UI 層說現在不該顯示，就跳過
        if (ui.isAllowedPendingPage && !ui.isAllowedPendingPage()) return;

        setTimeout(async () => {
            const rawPending = sessionStorage.getItem(PENDING_KEY);
            // 就算沒有 Pending，在 MemberCenter 也要顯示鈴鐺 (如果 UI 邏輯允許)
            // 但這裡是 Plugin，主要處理資料恢復

            if (rawPending) {
                const payload = JSON.parse(rawPending);
                if (ui.createBell) ui.createBell(payload, { autoShake: true });
            }
        }, 300);
    }

    function init() {
        tryShowIfPending();
        window.addEventListener('hashchange', tryShowIfPending);

        // 監聽 UI 發出的匯入確認事件
        document.addEventListener('calendarui:importConfirmed', (ev) => {
            handleImport(ev.detail || {});
        });

        // 監聽存檔完成事件 (讓鈴鐺搖動)
        document.addEventListener('calendar:saved', () => {
            const ui = getUI();
            if (ui.shakeBell) ui.shakeBell();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();