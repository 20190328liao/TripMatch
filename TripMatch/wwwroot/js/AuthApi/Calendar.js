
(async function () {
    async function fetchLockedRanges() {
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
    let showEnglishMonths = false;

    // --- CSS for Dragging Cursor ---
    // ★ 修改重點：Hover 時一般箭頭 (default)，拖曳時 Grabbing
    const styleId = 'calendar-drag-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            /* 1. 滑鼠移到範圍起點/終點時：顯示一般箭頭 (default) */
            .day-cell.range-start, .day-cell.range-end { 
                cursor: default !important; 
                z-index: 10; 
            }
            
            /* 輕微放大效果保留，讓使用者知道選到了 */
            .day-cell.range-start:hover, .day-cell.range-end:hover { 
                transform: scale(1.1); 
                transition: transform 0.1s; 
            }

            /* 2. 拖曳中：全域強制變更為「抓取中 (Grabbing)」 */
            body.calendar-dragging, 
            body.calendar-dragging * { 
                cursor: grabbing !important; 
            }

            /* 拖曳時禁止選取文字，提升體驗 */
            body.calendar-dragging { 
                user-select: none; 
                -webkit-user-select: none; 
            }
        `;
        document.head.appendChild(style);
    }

    // 工具函式
    function dedupeDates(arr) {
        if (!Array.isArray(arr)) return [];
        try {
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

    /* 狀態變數 */
    let currentYear;
    let currentMonth;
    let selectedSingles = [];
    let selectedRanges = [];
    let rangeDraftStart = null;
    let lockedRanges = [];
    let _calendarDraftPromptShown = false;
    let editMode = false;
    let showDeleteButtons = false;
    let submittedDates = [];
    let lastSubmittedSet = new Set();
    let _listHeaderTimer = null;

    // ★ 拖曳狀態
    let dragState = null; // { index: number, type: 'start'|'end' }

    const SESSION_KEY = 'calendar_draft';

    function saveDraftToSession() {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ singles: selectedSingles, ranges: selectedRanges }));
    }
    function loadDraftFromSession() {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (parsed && !parsed.singles && parsed.single) parsed.singles = parsed.single ? [parsed.single] : [];
            return parsed;
        } catch { return null; }
    }
    function clearDraftSession() { sessionStorage.removeItem(SESSION_KEY); }

    function setListHeaderMessage(message, seconds = 3) {
        try {
            const $el = $('.list-header .text-muted');
            if ($el.length === 0) return;
            $el.text(message);
            if (_listHeaderTimer) { clearTimeout(_listHeaderTimer); _listHeaderTimer = null; }
            if (seconds > 0) {
                _listHeaderTimer = setTimeout(() => { $el.text(''); _listHeaderTimer = null; }, seconds * 1000);
            }
        } catch (e) { }
    }

    function hasUnconfirmedDraft() {
        const draft = loadDraftFromSession();
        return !!(draft && ((draft.singles && draft.singles.length) || (draft.ranges && draft.ranges.length)));
    }

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

    function getAllDraftDates() {
        const set = new Set();
        (selectedSingles || []).forEach(s => set.add(s));
        selectedRanges.forEach(r => {
            expandRangeToIsoDates(r.start, r.end).forEach(d => set.add(d));
        });
        return Array.from(set);
    }

    /* 新增 excludeRangeIndex 以支援拖曳時忽略自身衝突 */
    function hasIntersectionWithExisting(candidateDates, options = {}) {
        const { ignoreDraftSingles = false, excludeRangeIndex = -1 } = options;

        let forbiddenIsoList = [].concat(submittedDates);

        selectedRanges.forEach((r, idx) => {
            if (idx === excludeRangeIndex) return; // 拖曳時，不跟自己原本的位置算衝突
            forbiddenIsoList = forbiddenIsoList.concat(expandRangeToIsoDates(r.start, r.end));
        });

        if (!ignoreDraftSingles) {
            forbiddenIsoList = forbiddenIsoList.concat(selectedSingles);
        }

        const forbiddenSet = new Set(forbiddenIsoList);

        return candidateDates.some(d => {
            if (forbiddenSet.has(d)) return true;
            try { if (isLocked(d)) return true; } catch { return false; }
            return false;
        });
    }

    function notifyLockedSelection(message) {
        if (typeof window.showPopup === 'function') {
            try {
                window.showPopup({ title: '日期衝突', message: message || '選擇的日期包含已鎖定或重疊的期間。', type: 'error', autoClose: true, seconds: 3 });
                return;
            } catch { }
        }
        alert(message || '選擇的日期包含已鎖定的期間，請重新選擇。');
    }

    function renderSubmittedList() {
        const $el = $('#calendarRange');
        if ($el.length) $el.html(submittedDates.length ? '' : '');
        renderCalendarList();
    }

    function renderCalendarList() {
        const $list = $('#calendarList');
        const $range = $('#calendarRange');
        if ($list.length === 0 && $range.length === 0) return;

        const all = Array.from(new Set(getAllDraftDates().concat(submittedDates || [])));
        const filtered = all.filter(iso => {
            try {
                const d = DH.fromIso(iso);
                return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
            } catch { return false; }
        });

        try {
            const count = filtered.length;
            const badge = document.getElementById('selectedCount');
            if (badge) {
                badge.textContent = String(count);
                badge.setAttribute('title', `${count} 個已選日期（本月）`);
                if (!dragState) setListHeaderMessage(`已選 ${count} 個時段`, 3);
            }
        } catch (e) { }

        if (!filtered.length) {
            const emptyHtml = '<div class="text-muted">本月份尚無選擇的日期</div>';
            if ($list.length) $list.html(emptyHtml);
            if ($range.length) $range.html('');
            return;
        }

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

    function focusMonthAndHighlight(iso) {
        try {
            const d = DH.fromIso(iso);
            currentYear = d.getFullYear();
            currentMonth = d.getMonth();
            renderMonth();
            const $cell = $(`.day-cell[data-date="${iso}"]`);
            if ($cell.length) {
                $cell.addClass('flash-highlight');
                try { $cell[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { }
                setTimeout(() => $cell.removeClass('flash-highlight'), 900);
            }
        } catch (ex) { console.error('focusMonthAndHighlight error', ex); }
    }

    function formatIsoToLabel(iso) {
        try {
            const d = DH.fromIso(iso);
            return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        } catch { return iso; }
    }

    function renderCalendarRange() {
        const $el = $('#calendarRange');
        if ($el.length === 0) return;
        const all = Array.from(new Set(getAllDraftDates().concat(submittedDates || [])));
        if (!all.length) {
            $el.html('');
            try {
                const badge = document.getElementById('selectedCount');
                if (badge) badge.textContent = '0';
            } catch { }
            return;
        }
        all.sort();
        const html = all.map(iso => `<div class="calendar-range-item">${formatIsoToLabel(iso)}</div>`).join('');
        $el.html(html);
    }

    async function fetchSubmittedDatesFromServer() {
        try {
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
            lastSubmittedSet = new Set();
            renderSubmittedList();
            renderMonth();
        } catch (e) { console.error('fetchSubmittedDatesFromServer error', e); }
    }

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
                    success(res) { resolve(true); },
                    error(xhr) { resolve(false); }
                });
            });
            if (ok) {
                const addedCount = Array.isArray(addedDates) ? addedDates.length : 0;
                const removedCount = Array.isArray(removedDates) ? removedDates.length : 0;
                if (addedCount > 0 && removedCount === 0) setListHeaderMessage('完成編輯', 3);
                else if (removedCount > 0 && addedCount === 0) setListHeaderMessage('完成刪除', 3);
                else setListHeaderMessage('提交完成', 3);
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

    function init(options = {}) {
        const today = DH.startOfToday();
        currentYear = options.year ?? today.getFullYear();
        currentMonth = options.month ?? today.getMonth();
        lockedRanges = options.lockedRanges ?? [];

        if (typeof options.showEnglishMonths !== 'undefined') {
            showEnglishMonths = !!options.showEnglishMonths;
        }

        if (typeof options.editMode !== 'undefined') {
            editMode = !!options.editMode;
            if (editMode) $('body').addClass('calendar-editing');
        }

        const draft = loadDraftFromSession();
        if (draft && ((draft.singles && draft.singles.length) || (draft.ranges && draft.ranges.length)) && !_calendarDraftPromptShown) {
            _calendarDraftPromptShown = true;
            setTimeout(() => {
                if (confirm('偵測到上次尚未確認的日曆變更，是否要匯入？')) {
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

        submittedDates = options.submittedDates ?? [];
        fetchSubmittedDatesFromServer();

        buildMonthPanel();
        bindEvents();
        renderMonth();
        renderSubmittedList();
    }

    function bindEvents() {
        $(document)
            .off('.calendar')
            .on('click.calendar', '.year-left', () => { currentYear--; buildMonthPanel(); renderMonth(); })
            .on('click.calendar', '.year-right', () => { currentYear++; buildMonthPanel(); renderMonth(); })
            .on('click.calendar', '.month-left', () => changeMonth(-1))
            .on('click.calendar', '.month-right', () => changeMonth(1))
            .on('click.calendar', '.month-btn', function () {
                currentMonth = Number($(this).data('month'));
                renderMonth();
                updateMonthActive();
            })
            // --- 點擊建立範圍 (非拖曳時觸發) ---
            .on('click.calendar', '.day-cell:not(.locked)', function (e) {
                if (dragState) return;
                if (!editMode) return;

                // 避免點擊 X 按鈕時觸發選擇
                if ($(e.target).hasClass('cell-delete') || $(e.target).closest('.cell-delete').length) return;

                const iso = $(this).data('date');
                onDateClick(iso);
            })
            // --- 雙擊單選 ---
            .on('dblclick.calendar', '.day-cell:not(.locked)', function (e) {
                if (!editMode) return;
                // 避免點擊 X 按鈕時觸發
                if ($(e.target).hasClass('cell-delete') || $(e.target).closest('.cell-delete').length) return;

                const iso = $(this).data('date');
                const candidate = [iso];
                if (hasIntersectionWithExisting(candidate, { ignoreDraftSingles: false }) && !selectedSingles.includes(iso)) return;

                if (selectedSingles.includes(iso)) {
                    selectedSingles = selectedSingles.filter(s => s !== iso);
                } else {
                    selectedSingles.push(iso);
                    selectedRanges = selectedRanges.filter(r => {
                        const arr = expandRangeToIsoDates(r.start, r.end);
                        return !arr.includes(iso);
                    });
                }
                saveDraftToSession();
                renderMonth();
            })
            // --- ★ 拖曳開始 (MouseDown) ---
            .on('mousedown.calendar', '.day-cell', function (e) {
                if (!editMode) return;
                if (e.button !== 0) return; // 只允許左鍵

                // 檢查是否點擊到 X 按鈕，如果是則完全不啟動拖曳
                if ($(e.target).hasClass('cell-delete') || $(e.target).closest('.cell-delete').length) return;

                const $cell = $(this);
                const iso = $cell.data('date');

                // 檢查是否為 Range Start 或 End
                let foundIndex = -1;
                let type = null;

                selectedRanges.forEach((r, idx) => {
                    if (r.start === iso) { foundIndex = idx; type = 'start'; }
                    else if (r.end === iso) { foundIndex = idx; type = 'end'; }
                });

                if (foundIndex !== -1 && type) {
                    e.preventDefault(); // 防止文字選取
                    dragState = {
                        index: foundIndex,
                        type: type,
                    };
                    $('body').addClass('calendar-dragging');
                }
            })
            // --- ★ 拖曳進行 (Global MouseMove) ---
            .on('mousemove.calendar', function (e) {
                if (!dragState) return;

                const el = document.elementFromPoint(e.clientX, e.clientY);
                const $target = $(el).closest('.day-cell');
                if ($target.length === 0) return;

                const hoverIso = $target.data('date');
                if (!hoverIso) return;
                if (isLocked(hoverIso)) return;

                const range = selectedRanges[dragState.index];
                if (!range) return;

                let newStart = range.start;
                let newEnd = range.end;

                if (dragState.type === 'start') {
                    newStart = hoverIso;
                } else {
                    newEnd = hoverIso;
                }

                // 自動反轉邏輯
                if (DH.fromIso(newStart) > DH.fromIso(newEnd)) {
                    const tmp = newStart;
                    newStart = newEnd;
                    newEnd = tmp;
                    dragState.type = (dragState.type === 'start') ? 'end' : 'start';
                }

                // 檢查衝突 (排除自己)
                const candidate = expandRangeToIsoDates(newStart, newEnd);
                if (!hasIntersectionWithExisting(candidate, { ignoreDraftSingles: true, excludeRangeIndex: dragState.index })) {
                    selectedRanges[dragState.index] = { start: newStart, end: newEnd };
                    // 吸收單點
                    selectedSingles = selectedSingles.filter(s => !candidate.includes(s));
                    renderMonth();
                }
            })
            // --- ★ 拖曳結束 (Global MouseUp) ---
            .on('mouseup.calendar', function () {
                if (dragState) {
                    dragState = null;
                    $('body').removeClass('calendar-dragging');
                    saveDraftToSession();
                    renderSubmittedList();
                }
            })
            .on('click.calendar', '.edit', function () {
                editMode = !editMode;
                $(this).text(editMode ? '編輯模式' : '開始編輯');
                rangeDraftStart = null;
                $('body').toggleClass('calendar-editing', editMode);
                renderMonth();
            })
            .on('click.calendar', '.btn-delete', function () {
                showDeleteButtons = !showDeleteButtons;
                renderMonth();
            })
            .on('click.calendar', '.confirm', async function () {
                const draftDates = getAllDraftDates();
                const toAdd = draftDates.filter(d => !submittedDates.includes(d));
                if (toAdd.length === 0) {
                    selectedSingles = []; selectedRanges = []; rangeDraftStart = null;
                    clearDraftSession(); renderMonth(); return;
                }
                submittedDates = dedupeDates(submittedDates.concat(toAdd));
                lastSubmittedSet = new Set(toAdd);
                selectedSingles = []; selectedRanges = []; rangeDraftStart = null;
                clearDraftSession();
                renderMonth(); renderSubmittedList();
                const ok = await syncLeaves(toAdd, []);
                if (!ok) {
                    setListHeaderMessage('提交失敗，請稍後重試', 4);
                    fetchSubmittedDatesFromServer();
                }
            })
            .on('click.calendar', '#calendarList .calendar-range-item', function () {
                const iso = $(this).data('date');
                focusMonthAndHighlight(iso);
            })
            .on('keydown.calendar', '#calendarList .calendar-range-item', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    focusMonthAndHighlight($(this).data('date'));
                }
            });
    }

    function buildMonthPanel() {
        const $grid = $('.months-grid');
        const $year = $('.year-display');
        $year.text(currentYear);
        $grid.empty();
        for (let m = 0; m < 12; m++) {
            const d = new Date(currentYear, m, 1);
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
        $('.month-btn').removeClass('active').filter(`[data-month="${currentMonth}"]`).addClass('active');
    }

    function changeMonth(delta) {
        currentMonth += delta;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; buildMonthPanel(); }
        if (currentMonth > 11) { currentMonth = 0; currentYear++; buildMonthPanel(); }
        renderMonth();
        updateMonthActive();
    }

    function onDateClick(iso) {
        if (!editMode) return;
        if (rangeDraftStart) {
            if (iso === rangeDraftStart) {
                const candidate = [iso];
                if (!hasIntersectionWithExisting(candidate, { ignoreDraftSingles: false })) {
                    if (!selectedSingles.includes(iso)) selectedSingles.push(iso);
                } else {
                    if (!selectedSingles.includes(iso)) notifyLockedSelection();
                }
                rangeDraftStart = null;
            } else {
                const candidateDates = expandRangeToIsoDates(rangeDraftStart, iso);
                if (!hasIntersectionWithExisting(candidateDates, { ignoreDraftSingles: true })) {
                    selectedRanges.push({ start: rangeDraftStart, end: iso });
                    selectedSingles = selectedSingles.filter(s => !candidateDates.includes(s));
                } else {
                    notifyLockedSelection('選擇的範圍包含「已鎖定」、「已提交」或「重疊的範圍」，請重新選擇。');
                }
                rangeDraftStart = null;
            }
            renderMonth(); saveDraftToSession(); return;
        }
        if (isLocked(iso) || submittedDates.includes(iso)) { notifyLockedSelection(); return; }
        const inExistingRange = selectedRanges.some(r => {
            const d = DH.fromIso(iso);
            return DH.isBetweenInclusive(d, DH.fromIso(r.start), DH.fromIso(r.end));
        });
        if (inExistingRange) { notifyLockedSelection('該日期已在選取範圍內，請先刪除舊範圍再重新選取。'); return; }
        rangeDraftStart = iso;
        renderMonth();
    }

    async function removeDate(iso) {
        if (selectedSingles.includes(iso)) selectedSingles = selectedSingles.filter(s => s !== iso);
        selectedRanges = selectedRanges.filter(r => !expandRangeToIsoDates(r.start, r.end).includes(iso));
        const existedInSubmitted = submittedDates.includes(iso);
        submittedDates = submittedDates.filter(d => d !== iso);
        renderMonth(); renderSubmittedList(); saveDraftToSession();
        if (existedInSubmitted) {
            const ok = await syncLeaves([], [iso]);
            if (!ok) {
                setListHeaderMessage('刪除失敗，請稍後重試', 4);
                fetchSubmittedDatesFromServer();
            }
        }
    }

    function isLocked(iso) {
        const d = DH.fromIso(iso);
        const today = DH.startOfToday();
        if (DH.isBefore(d, today)) return true;
        return lockedRanges.some(r => DH.isBetweenInclusive(d, DH.fromIso(r.start), DH.fromIso(r.end)));
    }

    function renderMonth() {
        const $days = $('.days');
        const $title = $('.month-display');
        $days.empty();
        const firstDay = new Date(currentYear, currentMonth, 1);
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const startIndex = (firstDay.getDay() + 6) % 7;
        $title.text(firstDay.toLocaleString('zh-TW', { year: 'numeric', month: 'long' }));
        for (let i = 0; i < startIndex; i++) { $days.append('<div class="day-cell empty" aria-hidden="true"></div>'); }
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(currentYear, currentMonth, d);
            const iso = DH.toIso(date);
            const $cell = $('<div>', { class: 'day-cell', 'data-date': iso, tabindex: -1, role: 'button', 'aria-label': formatIsoToLabel(iso) });
            const $label = $('<div>', { class: 'day-label', text: d });
            if (DH.isSameDay(date, new Date())) $cell.addClass('today');
            if (isLocked(iso)) $cell.addClass('locked');
            selectedRanges.forEach(r => {
                if (DH.isBetweenInclusive(date, DH.fromIso(r.start), DH.fromIso(r.end))) $cell.addClass('selected-range');
                if (iso === r.start) $cell.addClass('range-start');
                if (iso === r.end) $cell.addClass('range-end');
            });
            if (rangeDraftStart === iso) $cell.addClass('range-start');
            if (submittedDates.includes(iso)) {
                $cell.addClass(lastSubmittedSet.has(iso) ? 'submitted-new' : 'submitted-old');
            }
            if (selectedSingles.includes(iso)) $cell.addClass('selected-single');
            const isDraftSelected = selectedSingles.includes(iso) || selectedRanges.some(r => DH.isBetweenInclusive(date, DH.fromIso(r.start), DH.fromIso(r.end)));
            if (showDeleteButtons && !isLocked(iso) && (isDraftSelected || submittedDates.includes(iso))) {
                const $del = $('<button>', { class: 'cell-delete', text: '×', title: '刪除', type: 'button' });
                // ★ 關鍵修正：增加 mousedown 阻擋，避免點擊 X 時同時觸發 day-cell 的 mousedown (拖曳開始)
                $del.on('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
                $del.on('click', async function (e) { e.preventDefault(); e.stopPropagation(); await removeDate(iso); });
                $del.on('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); });
                $cell.append($del);
            }
            $cell.append($label);
            $days.append($cell);
        }
        const needed = 42 - $days.children().length;
        for (let i = 0; i < needed; i++) { $days.append('<div class="day-cell empty" aria-hidden="true"></div>'); }
        renderCalendarList ? renderCalendarList() : renderCalendarRange();
    }

    window.Calendar = {
        init,
        importDates: (singles, ranges) => {
            if (Array.isArray(singles)) selectedSingles = singles;
            if (Array.isArray(ranges)) selectedRanges = ranges;
            renderMonth();
        },
        markSubmittedNew: (dates) => {
            if (!Array.isArray(dates)) return;
            submittedDates = dedupeDates(submittedDates.concat(dates));
            dates.forEach(d => lastSubmittedSet.add(d));
            renderMonth();
            renderSubmittedList();
        },
        startRange() { rangeDraftStart = null; },
        addRange(start, end) {
            const candidate = expandRangeToIsoDates(start, end);
            if (!hasIntersectionWithExisting(candidate, { ignoreDraftSingles: true })) {
                selectedRanges.push({ start, end });
                selectedSingles = selectedSingles.filter(s => !candidate.includes(s));
                renderMonth(); saveDraftToSession();
            } else { notifyLockedSelection('欲新增的範圍包含已鎖定或已存在的日期，無法加入。'); }
        },
        clearAll() {
            selectedSingles = []; selectedRanges = []; rangeDraftStart = null;
            renderMonth(); saveDraftToSession();
        },
        getSelected() {
            return { singles: selectedSingles, ranges: selectedRanges, submitted: submittedDates };
        }
    };
    window.addEventListener('beforeunload', function (e) {
        if (editMode && hasUnconfirmedDraft()) { e.preventDefault(); e.returnValue = ''; }
    });

})(window.jQuery);