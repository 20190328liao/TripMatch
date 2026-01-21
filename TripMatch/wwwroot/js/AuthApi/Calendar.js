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
                    success(data) {
                        resolve(data?.ranges || []);
                    },
                    error() {
                        resolve([]);
                    }
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
            return;
        }

        // 依 ISO 字串排序（yyyy-MM-dd 格式字典排序即為時間排序）
        all.sort();


        const html = all.map(iso => `<div class="calendar-range-item">${formatIsoToLabel(iso)}</div>`).join('');
        $el.html(html);
    }

    // 去重 helper
    function dedupeDates(arr) {
        if (!Array.isArray(arr)) return [];
        return Array.from(new Set(arr)).sort();
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
            const $btn = $(`
                <div class="month-btn" data-month="${m}">
                    <div class="mn">${m + 1} 月</div>
                    <div class="en">${d.toLocaleString('en-US', { month: 'long' })}</div>
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

        if (DH.isBefore(d, today)) return true;

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
     * 對外 API
     * ============================= */
    window.Calendar = {
        init,
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