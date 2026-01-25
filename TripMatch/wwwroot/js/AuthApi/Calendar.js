/* Calendar.js
   修改重點：在 MemberCenter 頁面（含 .member_center_wrap）隱藏英文月份，
*/

(async function () {

    async function fetchLockedRanges() {
        // 優先使用 jQuery.ajax（可利用 helper.js 的全域設定），無 jQuery 時 fallback 到 fetch
        if (window.jQuery) {
            return new Promise((resolve) => {
                $.ajax({
                    url: '/api/auth/GetLockedRanges',
                    method: 'GET',
                    xhrFields: { withCredentials: true },
                    headers: { 'RequestVerificationToken': window.csrfToken || '' },
                    success(data) { resolve(data?.ranges || []); },
                    error() { resolve([]); }
                });
            });
        } else {
            try {
                const res = await fetch('/api/auth/GetLockedRanges', { credentials: 'same-origin' });
                if (!res.ok) return [];
                const data = await res.json().catch(() => ({ ranges: [] }));
                return data.ranges || [];
            } catch {
                return [];
            }
        }
    }

    const lockedRanges = await fetchLockedRanges();

    // 嘗試呼叫 Calendar.init（若未定義則延遲重試）
    (function tryInit() {
        if (window.Calendar && typeof window.Calendar.init === 'function') {
            window.Calendar.init({ lockedRanges });
        } else {
            setTimeout(tryInit, 100);
        }
    })();

})();


(function ($) {
    'use strict';

    if (!$ || !window.DateHelper) {
        console.error('Calendar.js：缺少 jQuery 或 DateHelper');
        return;
    }

    const DH = window.DateHelper;

    // 永遠不顯示英文月份（你已移除英文月份）
    let showEnglishMonths = false;

    // 用於去重與排序日期陣列，避免在其他函式找不到定義
    function dedupeDates(arr) {
        if (!Array.isArray(arr)) return [];
        try {
            // 移除空值、trim 並使用 Set 去重，再以字串排序（yyyy-MM-dd 的字典排序即時間排序）
            const normalized = arr
                .filter(Boolean)
                .map(s => String(s).trim())
                .filter(s => s.length > 0);
            return Array.from(new Set(normalized)).sort();
        } catch (e) {
            console.warn('dedupeDates error', e);
            return [];
        }
    }

    /* =============================
  * 狀態
  * ============================= */
    let currentYear;
    let currentMonth; // 0~11

    // 支援多個單日草稿
    let selectedSingles = []; // 多個單日 ISO（草稿）

    let selectedRanges = [];   // [{ start, end }]（草稿）
    let rangeDraftStart = null;

    let lockedRanges = [];
    let _calendarDraftPromptShown = false;
    let editMode = false;           // 編輯（新增範圍 / 單日）模式
    let showDeleteButtons = false;  // 顯示 cell 上的刪除 X
    let submittedDates = [];        // 已提交的個別日期 ISO 清單
    // 記錄剛提交（latest）的一組日期，用作本次提交的樣式標記
    let lastSubmittedSet = new Set();

    // 顯示於 .list-header .text-muted 的提示 timer
    let _listHeaderTimer = null;

    //============月曆===============
    const SESSION_KEY = 'calendar_draft';
    function saveDraftToSession() {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            singles: selectedSingles,
            ranges: selectedRanges
        }));
    }

    function loadDraftFromSession() {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            // 相容舊格式：若存在 single，轉為 singles 陣列
            if (parsed) {
                if (!parsed.singles && parsed.single) parsed.singles = parsed.single ? [parsed.single] : [];
            }
            return parsed;
        } catch {
            return null;
        }
    }

    function clearDraftSession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    // 設定 .list-header .text-muted 的提示文字（會自動清除）
    function setListHeaderMessage(message, seconds = 3) {
        try {
            const $el = $('.list-header .text-muted');
            if ($el.length === 0) return;
            $el.text(message);
            if (_listHeaderTimer) {
                clearTimeout(_listHeaderTimer);
                _listHeaderTimer = null;
            }
            if (seconds > 0) {
                _listHeaderTimer = setTimeout(() => {
                    $el.text(''); // 清除提示
                    _listHeaderTimer = null;
                }, seconds * 1000);
            }
        } catch (e) {
            console.warn('setListHeaderMessage error', e);
        }
    }

    // 判斷是否需要提醒
    function hasUnconfirmedDraft() {
        const draft = loadDraftFromSession();
        return !!(draft && ((draft.singles && draft.singles.length) || (draft.ranges && draft.ranges.length)));
    }

    /* 幫助器：把範圍展開為 ISO 陣列（含頭尾） */
    function expandRangeToIsoDates(startIso, endIso) {
        const a = DH.fromIso(startIso);
        const b = DH.fromIso(endIso);
        const start = a < b ? a : b;
        const end = a < b ? b : a;
        const dates = [];
        let cur = new Date(start);
        while (cur <= end) {
            dates.push(DH.toIso(new Date(cur)));
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    }

    /* 取得草稿所有單日陣列（展開）*/
    function getAllDraftDates() {
        const set = new Set();
        (selectedSingles || []).forEach(s => set.add(s));
        selectedRanges.forEach(r => {
            expandRangeToIsoDates(r.start, r.end).forEach(d => set.add(d));
        });
        return Array.from(set);
    }

    /* 檢查是否與已存在（草稿或已提交）或鎖定期間衝突 */
    function hasIntersectionWithExisting(candidateDates) {
        const existing = new Set(getAllDraftDates().concat(submittedDates));
        // 若 candidate 與已存在或鎖定日期有任一交集，回傳 true
        return candidateDates.some(d => {
            if (existing.has(d)) return true;
            // isLocked 會檢查是否早於今天或是否落在 lockedRanges 中
            try {
                return isLocked(d);
            } catch {
                return false;
            }
        });
    }

    // 使用 popup 或 alert 提示使用者選擇包含鎖定日期
    function notifyLockedSelection(message) {

        if (typeof window.showPopup === 'function') {
            try {
                window.showPopup({ title: '日期衝突', message: message || '選擇的日期包含已鎖定的期間，請重新選擇。', type: 'error', autoClose: true, seconds: 3 });
                return;
            } catch { /* fallback to alert */ }
        }
        alert(message || '選擇的日期包含已鎖定的期間，請重新選擇。');
    }

    /* 更新 #calendarRange 顯示（已提交日清單） */
    function renderSubmittedList() {
        const $el = $('#calendarRange');
        if ($el.length) {
            if (!submittedDates.length) {
                $el.text('');
            } else {
                $el.html(''); // 交由 renderCalendarList 統一處理
            }
        }
        renderCalendarList();
    }

    // 新：把目前草稿 + 已提交合併，渲染到右側清單 #calendarList（同時保留 #calendarRange 相容）
    function renderCalendarList() {
        const $list = $('#calendarList');
        const $range = $('#calendarRange'); // 相容舊位置
        if ($list.length === 0 && $range.length === 0) return;

        // 取得草稿 + 已提交（去重）
        const all = Array.from(new Set(getAllDraftDates().concat(submittedDates || [])));
        // 篩選出目前顯示的年月
        const filtered = all.filter(iso => {
            try {
                const d = DH.fromIso(iso);
                return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
            } catch {
                return false;
            }
        });

        // 更新 badge（左側面板的 selectedCount）
        try {
            const count = filtered.length;
            const badge = document.getElementById('selectedCount');
            if (badge) {
                badge.textContent = String(count);
                badge.setAttribute('title', `${count} 個已選日期（本月）`);
                // 對於輕量提示，同時顯示 list header 的暫時訊息（3 秒）
                setListHeaderMessage(`已選 ${count} 個時段`, 3);
            }
        } catch (e) {
            console.warn('update selectedCount failed', e);
        }

        if (!filtered.length) {
            const emptyHtml = '<div class="text-muted">本月份尚無選擇的日期</div>';
            if ($list.length) $list.html(emptyHtml);
            if ($range.length) $range.html('');
            return;
        }

        // 依 ISO 排序
        filtered.sort();

        const html = filtered.map(iso => {
            const isSubmitted = submittedDates.includes(iso);
            const cls = ['calendar-range-item'];
            if (isSubmitted) cls.push(lastSubmittedSet.has(iso) ? 'submitted-new' : 'submitted-old');
            return `<div class="${cls.join(' ')}" data-date="${iso}" role="button" tabindex="0">${formatIsoToLabel(iso)}</div>`;
        }).join('');

        if ($list.length) $list.html(html);
        if ($range.length) $range.html(html);
    }

    // 新：跳到該月份並短暫標示該日期
    function focusMonthAndHighlight(iso) {
        try {
            const d = DH.fromIso(iso);
            currentYear = d.getFullYear();
            currentMonth = d.getMonth();
            renderMonth();

            // 找到對應 cell 並標示
            const $cell = $(`.day-cell[data-date="${iso}"]`);
            if ($cell.length) {
                $cell.addClass('flash-highlight');
                // 若能滾動到可視範圍則滾動
                try {
                    $cell[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch { }
                setTimeout(() => $cell.removeClass('flash-highlight'), 900);
            }
        } catch (ex) {
            console.error('focusMonthAndHighlight error', ex);
        }
    }

    // 格式化單一 ISO 日期為 "yyyy年M月d日"
    function formatIsoToLabel(iso) {
        try {
            const d = DH.fromIso(iso);
            return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        } catch {
            return iso;
        }
    }

    // 在 #calendarRange 顯示已排序且去重的日期清單（草稿 + 已提交）
    function renderCalendarRange() {
        const $el = $('#calendarRange');
        if ($el.length === 0) return;

        // 以草稿與已提交組成顯示清單（草稿 + 已提交，去重後排序）
        const all = Array.from(new Set(getAllDraftDates().concat(submittedDates || [])));
        if (!all.length) {
            $el.html(''); // 清空
            // update selectedCount as 0 when range-only rendering used
            try {
                const badge = document.getElementById('selectedCount');
                if (badge) {
                    badge.textContent = '0';
                    badge.setAttribute('title', `0 個已選日期（本月）`);
                }
            } catch { }
            return;
        }

        // 依 ISO 字串排序（yyyy-MM-dd 格式字典排序即為時間排序）
        all.sort();


        const html = all.map(iso => `<div class="calendar-range-item">${formatIsoToLabel(iso)}</div>`).join('');
        $el.html(html);
    }

    /* 從後端載入已儲存的請假日（加入去重） */
    async function fetchSubmittedDatesFromServer() {
        try {
            // 使用 $.ajax（jQuery 已經存在）
            const data = await new Promise((resolve, reject) => {
                $.ajax({
                    url: '/api/auth/GetLeaves',
                    method: 'GET',
                    xhrFields: { withCredentials: true },
                    headers: { 'RequestVerificationToken': window.csrfToken || '' },
                    success(res) { resolve(res); },
                    error(xhr) { reject(xhr); }
                });
            });
            submittedDates = dedupeDates((data && data.dates) ? data.dates : []);
            // 從伺服器取得資料時，沒有「剛提交」概念 → 清除
            lastSubmittedSet = new Set();
            renderSubmittedList();
            renderMonth();
        } catch (e) {
            console.error('fetchSubmittedDatesFromServer error', e);
        }
    }

    /* 同步改動到後端 SaveLeaves */
    async function syncLeaves(addedDates, removedDates) {
        try {
            const ok = await new Promise((resolve) => {
                $.ajax({
                    url: '/api/auth/SaveLeaves',
                    method: 'POST',
                    contentType: 'application/json',
                    xhrFields: { withCredentials: true },
                    headers: { 'RequestVerificationToken': window.csrfToken || '' },
                    data: JSON.stringify({ Added: addedDates, Removed: removedDates }),
                    success(res) {
                        // 有些 API 會回空 body，我們只需成功/失敗狀態
                        console.log('SaveLeaves result', res);
                        resolve(true);
                    },
                    error(xhr) {
                        console.error('SaveLeaves failed', xhr.responseJSON || xhr.responseText || xhr.statusText);
                        resolve(false);
                    }
                });
            });

            // 顯示簡單文字提示於 .list-header .text-muted
            if (ok) {
                const addedCount = Array.isArray(addedDates) ? addedDates.length : 0;
                const removedCount = Array.isArray(removedDates) ? removedDates.length : 0;

                if (addedCount > 0 && removedCount === 0) {
                    setListHeaderMessage('完成編輯', 3);
                } else if (removedCount > 0 && addedCount === 0) {
                    setListHeaderMessage('完成刪除', 3);
                } else if (addedCount > 0 && removedCount > 0) {
                    setListHeaderMessage(`完成：新增 ${addedCount} 天、刪除 ${removedCount} 天`, 3);
                } else {
                    setListHeaderMessage('提交完成', 3);
                }
            } else {
                setListHeaderMessage('同步失敗，請稍後重試', 4);
            }

            return ok;
        } catch (e) {
            console.error('syncLeaves error', e);
            setListHeaderMessage('系統錯誤，儲存失敗', 4);
            return false;
        }
    }

    /* =============================
     * 初始化
     * ============================= */
    function init(options = {}) {
        const today = DH.startOfToday();

        currentYear = options.year ?? today.getFullYear();
        currentMonth = options.month ?? today.getMonth();
        lockedRanges = options.lockedRanges ?? [];

        // 允許呼叫端用 options 覆寫是否顯示英文月份
        if (typeof options.showEnglishMonths !== 'undefined') {
            showEnglishMonths = !!options.showEnglishMonths;
        }

        const draft = loadDraftFromSession();

        if (draft && ((draft.singles && draft.singles.length) || (draft.ranges && draft.ranges.length)) && !_calendarDraftPromptShown) {
            _calendarDraftPromptShown = true;
            setTimeout(() => {
                if (confirm('偵測到上次尚未確認的日曆變更，是否要匯入？')) {
                    // 匯入 singles 和 ranges（相容舊 single）
                    selectedSingles = (draft.singles && Array.isArray(draft.singles)) ? draft.singles.slice() : (draft.single ? [draft.single] : []);
                    selectedRanges = draft.ranges || [];
                    editMode = true;
                    $('body').addClass('calendar-editing');
                    renderMonth();
                } else {
                    clearDraftSession();
                }
            }, 200);
        }

        // 從伺服器載入已提交資料
        submittedDates = options.submittedDates ?? [];
        fetchSubmittedDatesFromServer();

        buildMonthPanel();
        bindEvents();
        bindImportHandlers(); // <- 新增：綁定匯入按鈕 / input 行為
        renderMonth();
        renderSubmittedList();
    }

    /* =============================
     * 事件綁定
     * ============================= */
    function bindEvents() {
        $(document)
            .off('.calendar')

            /*年切換*/
            .on('click.calendar', '.year-left', () => {
                currentYear--;
                buildMonthPanel();
                renderMonth();
            })
            .on('click.calendar', '.year-right', () => {
                currentYear++;
                buildMonthPanel();
                renderMonth();
            })

            /* 月切換 */
            .on('click.calendar', '.month-left', () => changeMonth(-1))
            .on('click.calendar', '.month-right', () => changeMonth(1))


            /* 左側月份 */
            .on('click.calendar', '.month-btn', function () {
                currentMonth = Number($(this).data('month'));
                renderMonth();
                updateMonthActive();
            })

            /* 點擊處理（範圍起點/終點） */
            .on('click.calendar', '.day-cell:not(.locked)', function () {
                if (!editMode) return;
                const iso = $(this).data('date');
                onDateClick(iso);
            })

            /* 雙擊單日（多選切換） */
            .on('dblclick.calendar', '.day-cell:not(.locked)', function () {
                if (!editMode) return;
                const iso = $(this).data('date');

                const candidate = [iso];
                if (hasIntersectionWithExisting(candidate) && !selectedSingles.includes(iso)) {
                    return;
                }

                if (selectedSingles.includes(iso)) {
                    selectedSingles = selectedSingles.filter(s => s !== iso);
                } else {
                    selectedSingles.push(iso);
                    // 移除與該單日重疊的範圍內日期（避免重複）
                    selectedRanges = selectedRanges.filter(r => {
                        const arr = expandRangeToIsoDates(r.start, r.end);
                        return !arr.includes(iso);
                    });
                }

                saveDraftToSession();
                renderMonth();
            })

            /* 編輯按鈕切換 */
            .on('click.calendar', '.edit', function () {
                editMode = !editMode;
                $(this).text(editMode ? '編輯模式' : '開始編輯');
                rangeDraftStart = null;
                $('body').toggleClass('calendar-editing', editMode);
                renderMonth();
            })

            /* 刪除按鈕 */
            .on('click.calendar', '.btn-delete', function () {
                showDeleteButtons = !showDeleteButtons;
                renderMonth();
            })

            /* 確定（提交）：把草稿展開為單日並加到已提交清單 */
            .on('click.calendar', '.confirm', async function () {
                const draftDates = getAllDraftDates();
                const toAdd = draftDates.filter(d => !submittedDates.includes(d));

                if (toAdd.length === 0) {
                    // 清草稿但保留編輯狀態
                    selectedSingles = [];
                    selectedRanges = [];
                    rangeDraftStart = null;
                    clearDraftSession();
                    renderMonth();
                    return;
                }

                submittedDates = dedupeDates(submittedDates.concat(toAdd));

                // 標記本次剛提交的日期（render 時顯示為 submitted-new）
                lastSubmittedSet = new Set(toAdd);

                // 清草稿（但仍保留 editMode）
                selectedSingles = [];
                selectedRanges = [];
                rangeDraftStart = null;
                clearDraftSession();

                renderMonth();
                renderSubmittedList();

                const ok = await syncLeaves(toAdd, []);
                if (!ok) {
                    setListHeaderMessage('提交失敗，請稍後重試', 4);
                    fetchSubmittedDatesFromServer();
                }
            })
            // 點擊右側清單條目時跳到該日並標示
            .on('click.calendar', '#calendarList .calendar-range-item', function () {
                const iso = $(this).data('date');
                focusMonthAndHighlight(iso);
            })

            // 鍵盤可及性：允許用 Enter/空白鍵觸發
            .on('keydown.calendar', '#calendarList .calendar-range-item', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    focusMonthAndHighlight($(this).data('date'));
                }
            });
    }

    /* =============================
     * 年 / 月面板
     * ============================= */
    function buildMonthPanel() {
        const $grid = $('.months-grid');
        const $year = $('.year-display');

        $year.text(currentYear);
        $grid.empty();

        for (let m = 0; m < 12; m++) {
            const d = new Date(currentYear, m, 1);
            // 依 showEnglishMonths 決定是否產生英文月份節點
            const enHtml = showEnglishMonths ? `<div class="en">${d.toLocaleString('en-US', { month: 'long' })}</div>` : '';
            const $btn = $(`
                <div class="month-btn" data-month="${m}">
                    <div class="mn">${m + 1} 月</div>
                    ${enHtml}
                </div>
            `);
            $grid.append($btn);
        }

        updateMonthActive();
    }

    function updateMonthActive() {
        $('.month-btn').removeClass('active')
            .filter(`[data-month="${currentMonth}"]`)
            .addClass('active');
    }

    /* =============================
     * 月切換
     * ============================= */
    function changeMonth(delta) {
        currentMonth += delta;

        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
            buildMonthPanel();
        }
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
            buildMonthPanel();
        }

        renderMonth();
        updateMonthActive();
    }

    /* =============================
     * 日期點擊邏輯（處理範圍起點/終點）
     * ============================= */
    function onDateClick(iso) {

        if (!editMode) return;

        /* 已有起點 → 嘗試形成範圍 */
        if (rangeDraftStart) {
            if (iso === rangeDraftStart) {
                // 第二次點同一天：視為要加入單日（相容）
                const candidate = [iso];
                if (!hasIntersectionWithExisting(candidate)) {
                    if (!selectedSingles.includes(iso)) selectedSingles.push(iso);
                } else {
                    notifyLockedSelection();
                }
                rangeDraftStart = null;
            }
            else {
                const candidateDates = expandRangeToIsoDates(rangeDraftStart, iso);
                if (!hasIntersectionWithExisting(candidateDates)) {
                    // 新增範圍，並移除落在該範圍內的單日草稿
                    selectedRanges.push({
                        start: rangeDraftStart,
                        end: iso
                    });
                    selectedSingles = selectedSingles.filter(s => !candidateDates.includes(s));
                } else {
                    // 明確提示使用者：包含已鎖定的日期或與已存在日期衝突
                    notifyLockedSelection('選擇的範圍包含已鎖定或已存在的日期，請選擇其他日期。');
                }
                rangeDraftStart = null;
            }

            renderMonth();
            saveDraftToSession();
            return;
        }

        /* 尚未有起點 → 設為潛在起點 */
        rangeDraftStart = iso;
        renderMonth();
    }

    /* =============================
     * 刪除點擊邏輯
     * ============================= */
    async function removeDate(iso) {

        // 從草稿單日移除
        if (selectedSingles.includes(iso)) {
            selectedSingles = selectedSingles.filter(s => s !== iso);
        }

        // 從草稿範圍移除
        selectedRanges = selectedRanges.filter(r => {
            const arr = expandRangeToIsoDates(r.start, r.end);
            return !arr.includes(iso);
        });

        // 從已提交移除
        const existedInSubmitted = submittedDates.includes(iso);
        submittedDates = submittedDates.filter(d => d !== iso);

        renderMonth();
        renderSubmittedList();
        saveDraftToSession();

        if (existedInSubmitted) {
            const ok = await syncLeaves([], [iso]);
            if (!ok) {
                setListHeaderMessage('刪除失敗，請稍後重試', 4);
                fetchSubmittedDatesFromServer();
            }
        }
    }

    /* =============================
     * 鎖定判斷
     * ============================= */
    function isLocked(iso) {
        const d = DH.fromIso(iso);
        const today = DH.startOfToday();

        // ★ 鎖定邏輯 1：過去的時間
        // 這一行是寫死在 JS 裡的。只要日期在「今天之前」，就會回傳 true (鎖定)。
        // 即使後端 API 沒回傳任何資料，這裡也會生效。
        if (DH.isBefore(d, today)) return true;

        // ★ 鎖定邏輯 2：後端指定的區間 (Locked Ranges)
        // 這裡會比對 fetchLockedRanges() 從 API 拿到的資料。
        // 因為剛剛改了後端回傳空清單，所以這段目前永遠回傳 false。
        return lockedRanges.some(r =>
            DH.isBetweenInclusive(d, DH.fromIso(r.start), DH.fromIso(r.end))
        );
    }

    /* =============================
     * 月曆渲染
     * ============================= */
    function renderMonth() {
        const $days = $('.days');
        const $title = $('.month-display');

        $days.empty();

        const firstDay = new Date(currentYear, currentMonth, 1);
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        // 讓週一為第一列（0..6）
        const startIndex = (firstDay.getDay() + 6) % 7;

        $title.text(firstDay.toLocaleString('zh-TW', { year: 'numeric', month: 'long' }));

        // 前置空白（保持週一對齊）
        for (let i = 0; i < startIndex; i++) {
            // 插入不可互動的空格 cell（仍占位維持 grid）
            $days.append('<div class="day-cell empty" aria-hidden="true"></div>');
        }

        // 當月日期
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(currentYear, currentMonth, d);
            const iso = DH.toIso(date);

            const $cell = $('<div>', {
                class: 'day-cell',
                'data-date': iso,
                tabindex: -1,
                role: 'button',
                'aria-label': formatIsoToLabel(iso)
            });

            const $label = $('<div>', {
                class: 'day-label',
                text: d
            });

            if (DH.isSameDay(date, new Date())) {
                $cell.addClass('today');
            }

            if (isLocked(iso)) {
                $cell.addClass('locked');
            }

            // 草稿範圍
            selectedRanges.forEach(r => {
                if (DH.isBetweenInclusive(date, DH.fromIso(r.start), DH.fromIso(r.end))) {
                    $cell.addClass('selected-range');
                }
                if (iso === r.start) {
                    $cell.addClass('range-start');
                }
                if (iso === r.end) {
                    $cell.addClass('range-end');
                }
            });

            if (rangeDraftStart === iso) {
                $cell.addClass('range-start');
            }

            if (submittedDates.includes(iso)) {
                if (lastSubmittedSet.has(iso)) {
                    $cell.addClass('submitted-new');
                } else {
                    $cell.addClass('submitted-old');
                }
            }

            // 草稿單日（多選支援）
            if (selectedSingles.includes(iso)) {
                $cell.addClass('selected-single');
            }

            const isDraftSelected =
                selectedSingles.includes(iso) ||
                selectedRanges.some(r =>
                    DH.isBetweenInclusive(
                        date,
                        DH.fromIso(r.start),
                        DH.fromIso(r.end)
                    )
                );

            if (showDeleteButtons && !isLocked(iso) && (isDraftSelected || submittedDates.includes(iso))) {
                const $del = $('<button>', {
                    class: 'cell-delete',
                    text: '×',
                    title: '刪除',
                    type: 'button'
                });

                $del.on('click', async function (e) {
                    e.stopPropagation();
                    await removeDate(iso);
                });

                $cell.append($del);
            }

            $cell.append($label);
            $days.append($cell);
        }

        // 總格數補足到 42 (6 rows * 7 cols)
        const currentCount = $days.children().length;
        const needed = 42 - currentCount;
        for (let i = 0; i < needed; i++) {
            $days.append('<div class="day-cell empty" aria-hidden="true"></div>');
        }

        // 更新右側清單
        renderCalendarList ? renderCalendarList() : renderCalendarRange();
    }

    /* =============================
     * Import modal & file handling (新增)
     * ============================= */
    function ensureImportModal() {
        if (document.getElementById('importCalendarModal')) return document.getElementById('importCalendarModal');

        const html = `
<div class="modal fade" id="importCalendarModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">匯入行事曆：預覽並確認</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="關閉"></button>
      </div>
      <div class="modal-body">
        <div id="importCalendarPreview" class="mb-3"></div>
        <div id="importCalendarError" class="alert alert-danger d-none" role="alert"></div>
      </div>
      <div class="modal-footer">
        <button type="button" id="importCalendarConfirm" class="btn btn-primary">確認匯入</button>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
      </div>
    </div>
  </div>
</div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        return document.getElementById('importCalendarModal');
    }

    function showImportPreview(parsed, filename) {
        const modalEl = ensureImportModal();
        const previewEl = modalEl.querySelector('#importCalendarPreview');
        const errorEl = modalEl.querySelector('#importCalendarError');
        errorEl.classList.add('d-none');
        previewEl.innerHTML = '';

        // 簡單驗證資料形態（接受陣列或物件含 dates 欄位）
        let dates = null;
        if (Array.isArray(parsed)) {
            dates = parsed;
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.dates)) {
            dates = parsed.dates;
        }

        if (!dates || dates.length === 0) {
            errorEl.textContent = '找不到可匯入的日期資料。請確認檔案格式。';
            errorEl.classList.remove('d-none');
            previewEl.innerHTML = `<p>檔名：<strong>${filename}</strong></p><p>解析結果找不到日期陣列。</p>`;
            return null;
        }

        // 限制預覽項目數量，避免巨大檔案塞爆 modal
        const MAX_PREVIEW = 200;
        const previewItems = dates.slice(0, MAX_PREVIEW).map(d => `<li>${String(d)}</li>`).join('');
        const moreNote = dates.length > MAX_PREVIEW ? `<p class="small text-muted">僅顯示前 ${MAX_PREVIEW} 筆，共 ${dates.length} 筆。</p>` : '';

        previewEl.innerHTML = `
            <p>檔名：<strong>${filename}</strong></p>
            <p>偵測到 <strong>${dates.length}</strong> 筆日期（格式視實際資料而定）。</p>
            <ul style="max-height:280px; overflow:auto; padding-left:1rem;">${previewItems}</ul>
            ${moreNote}
        `;

        // 建立 bootstrap modal 實例（若已存在則重用）
        const bs = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

        // cleanup 保證只執行一次（避免多次 remove/hide 導致視窗閃爍）
        let _closed = false;
        function cleanup() {
            if (_closed) return;
            _closed = true;
            try { bs.hide(); } catch { }
            // 等待 hidden 事件再移除 DOM（避免直接移除導致 bootstrap 錯誤）
            // 若 hidden 已經發生，直接移除
            const onHidden = () => {
                try { modalEl.remove(); } catch (e) { /* ignore */ }
                modalEl.removeEventListener('hidden.bs.modal', onHidden);
            };
            modalEl.addEventListener('hidden.bs.modal', onHidden);
            // 如果 modal 目前沒有顯示（bs.hide 不觸發 hidden），則移除延遲執行
            setTimeout(() => {
                if (!document.body.contains(modalEl)) return;
                try { modalEl.remove(); } catch { }
            }, 700);
        }

        // 顯示 modal
        bs.show();

        // 綁定確認匯入按鈕（用 once 保證只執行一次）
        const btnConfirm = modalEl.querySelector('#importCalendarConfirm');
        const newBtn = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);

        newBtn.addEventListener('click', function () {
            const detail = { fileName: filename, raw: parsed, dates: dates };
            document.dispatchEvent(new CustomEvent('calendar:import', { detail }));

            // UI 更新
            const msgEl = document.getElementById('importCalendarMessage');
            if (msgEl) {
                msgEl.classList.remove('d-none', 'alert-danger');
                msgEl.classList.add('alert', 'alert-success');
                msgEl.textContent = `已將 ${dates.length} 筆資料送交匯入，處理結果請稍候。`;
            }

            // 關閉 modal（使用 cleanup，以確保只執行一次）
            cleanup();
        }, { once: true });

        // 綁定取消按鈕與 close icon：只呼叫 cleanup（一次）
        modalEl.querySelectorAll('[data-bs-dismiss="modal"], .btn-close').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                cleanup();
            }, { once: true });
        });

        // 若使用者點 overlay（bootstrap 預設會處理 backdrop），也只執行一次 cleanup
        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) {
                cleanup();
            }
        }, { once: true });

        return dates;
    }

    function handleImportFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const text = e.target.result;
                const parsed = JSON.parse(text);
                const dates = showImportPreview(parsed, file.name);
                const modalEl = ensureImportModal();
                const bs = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
                bs.show();

                const btnConfirm = modalEl.querySelector('#importCalendarConfirm');
                btnConfirm.replaceWith(btnConfirm.cloneNode(true));
                const newConfirm = modalEl.querySelector('#importCalendarConfirm');

                newConfirm.addEventListener('click', function () {
                    const detail = { fileName: file.name, raw: parsed, dates: dates };

                    // 1. 發送原本的匯入事件
                    document.dispatchEvent(new CustomEvent('calendar:import', { detail }));

                    // 2. 【新增】清除 Session 中的待處理狀態，這樣鈴鐺才不會再出來
                    sessionStorage.removeItem('calendar_check_pending');
                    sessionStorage.removeItem('calendar_draft_ranges');

                    // 3. 【新增】如果畫面上正掛著鈴鐺，直接把它拔掉
                    if (window.CalendarUI && typeof window.CalendarUI.destroyBell === 'function') {
                        window.CalendarUI.destroyBell();
                    }

                    // 4. 更新訊息提示（您原本的程式碼）
                    const msgEl = document.getElementById('importCalendarMessage');
                    if (msgEl) {
                        msgEl.classList.remove('d-none', 'alert-danger');
                        msgEl.classList.add('alert', 'alert-success');
                        msgEl.textContent = `已將 ${detail.dates.length} 筆資料送交匯入，處理結果請稍候。`;
                    }

                    bs.hide();

                    // 5. 【建議】視情況重新導向或刷新
                    // 如果您希望匯入後立刻看到行事曆更新，可以加這一行：
                     location.reload(); 

                }, { once: true });

            } catch (ex) {
                console.error('匯入檔案解析失敗', ex);
                const modalEl = ensureImportModal();
                const errorEl = modalEl.querySelector('#importCalendarError');
                errorEl.textContent = '解析 JSON 失敗，請確認檔案內容格式正確。';
                errorEl.classList.remove('d-none');
                const bs = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
                bs.show();
            }
        };
        reader.onerror = function () {
            console.error('FileReader error');
            const modalEl = ensureImportModal();
            const errorEl = modalEl.querySelector('#importCalendarError');
            errorEl.textContent = '讀取檔案失敗，請重新嘗試。';
            errorEl.classList.remove('d-none');
            const bs = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
            bs.show();
        };
        reader.readAsText(file, 'utf-8');
    }

    function bindImportHandlers() {
        // 綁定現有頁面上的匯入按鈕與隱藏 input（MemberCenter.cshtml 有）
        try {
            const importBtn = document.getElementById('btnImportCalendar');
            const importInput = document.getElementById('importCalendarInput');

            if (!importBtn || !importInput) return;

            importBtn.addEventListener('click', function () {
                importInput.value = null;
                importInput.click();
            });

            importInput.addEventListener('change', function (e) {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                handleImportFile(f);
            }, false);
        } catch (ex) {
            console.warn('bindImportHandlers failed', ex);
        }
    }

    // 提供一個範例監聽器：當收到 calendar:import 時，執行實際匯入（使用者可在 Calendar.js 實作）
    document.addEventListener('calendar:import', function (ev) {
        // ev.detail => { fileName, raw, dates }
        console.info('calendar:import 事件收到：', ev.detail);
        try {
            if (window.Calendar && typeof window.Calendar.importDates === 'function') {
                // 若 raw 為物件包含 dates 則傳遞，否則嘗試 raw 本身
                const d = Array.isArray(ev.detail.dates) ? ev.detail.dates : (Array.isArray(ev.detail.raw) ? ev.detail.raw : []);
                window.Calendar.importDates(d, []);
            }
        } catch (ex) {
            console.error('處理匯入資料時發生錯誤', ex);
        }
    }, false);

    /* =============================
     * 對外 API
     * ============================= */
    window.Calendar = {
        init,
        importDates: (singles, ranges) => {
            if (Array.isArray(singles)) selectedSingles = singles;
            if (Array.isArray(ranges)) selectedRanges = ranges;
            renderMonth();
        },
        startRange() {
            rangeDraftStart = null;
        },
        addRange(start, end) {
            const candidate = expandRangeToIsoDates(start, end);
            if (!hasIntersectionWithExisting(candidate)) {
                selectedRanges.push({ start, end });
                // 移除與新範圍重疊的單日草稿
                selectedSingles = selectedSingles.filter(s => !candidate.includes(s));
                renderMonth();
                saveDraftToSession();
            } else {
                notifyLockedSelection('欲新增的範圍包含已鎖定或已存在的日期，無法加入。');
            }
        },
        clearAll() {
            selectedSingles = [];
            selectedRanges = [];
            rangeDraftStart = null;
            renderMonth();
            saveDraftToSession();
        },
        getSelected() {
            return {
                singles: selectedSingles,
                ranges: selectedRanges,
                submitted: submittedDates
            };
        }
    };
    window.addEventListener('beforeunload', function (e) {

        // 只有在「編輯模式 + 有草稿」才提醒
        if (editMode && hasUnconfirmedDraft()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });


})(window.jQuery);

