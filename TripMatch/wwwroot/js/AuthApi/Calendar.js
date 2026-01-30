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
            window.Calendar.init({ lockedRanges, editMode: true });
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
    const styleId = 'calendar-drag-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .day-cell.range-start, .day-cell.range-end { 
                cursor: default !important; 
                z-index: 10; 
            }
            .day-cell.range-start:hover, .day-cell.range-end:hover { 
                transform: scale(1.1); 
                transition: transform 0.1s; 
            }
            body.calendar-dragging, 
            body.calendar-dragging * { 
                cursor: grabbing !important; 
            }
            body.calendar-dragging { 
                user-select: none; 
                -webkit-user-select: none; 
            }
        `;
        document.head.appendChild(style);
    }

    // --- 黑底白字 Toast（簡潔、可重用） ---
    function showBlackToast(htmlText, seconds = 2) {
        try {
            const ID = 'tm-calendar-toast';
            const old = document.getElementById(ID);
            if (old) old.remove();
            const t = document.createElement('div');
            t.id = ID;
            t.innerHTML = htmlText;
            t.style.cssText = [
                'position:fixed',
                'top:20px',
                'left:50%',
                'transform:translateX(-50%)',
                'background:rgba(0,0,0,0.92)',
                'color:#fff',
                'padding:10px 16px',
                'border-radius:8px',
                'z-index:120000',
                'font-weight:600',
                'box-shadow:0 10px 30px rgba(0,0,0,0.3)',
                'max-width:90%',
                'text-align:center',
                'line-height:1.3'
            ].join(';');
            document.body.appendChild(t);

            let remaining = seconds;
            const timer = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(timer);
                    t.style.transition = 'opacity 260ms';
                    t.style.opacity = '0';
                    setTimeout(() => { try { t.remove(); } catch (e) { } }, 300);
                }
            }, 1000);
        } catch (e) { console.warn('showBlackToast failed', e); }
    }

    function dedupeDates(arr) {
        if (!Array.isArray(arr)) return [];
        try {
            const normalized = arr.filter(Boolean).map(s => String(s).trim()).filter(s => s.length > 0);
            return Array.from(new Set(normalized)).sort();
        } catch (e) { return []; }
    }

    /* 狀態變數 */
    let currentYear, currentMonth;
    let selectedSingles = [], selectedRanges = [];
    let rangeDraftStart = null;
    let lockedRanges = [];
    let _calendarDraftPromptShown = false;
    let editMode = true;
    let showDeleteButtons = false;
    let submittedDates = [];
    let lastSubmittedSet = new Set();
    let _listHeaderTimer = null;
    let dragState = null;
    let tutorialStep = 0;

    const SESSION_KEY = 'calendar_draft';

    function saveDraftToSession() {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ singles: selectedSingles, ranges: selectedRanges }));
    }
    function loadDraftFromSession() {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
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
        const set = new Set(selectedSingles);
        selectedRanges.forEach(r => expandRangeToIsoDates(r.start, r.end).forEach(d => set.add(d)));
        return Array.from(set);
    }

    function hasIntersectionWithExisting(candidateDates, options = {}) {
        const { ignoreDraftSingles = false, excludeRangeIndex = -1 } = options;
        let forbiddenIsoList = [].concat(submittedDates);
        selectedRanges.forEach((r, idx) => {
            if (idx === excludeRangeIndex) return;
            forbiddenIsoList = forbiddenIsoList.concat(expandRangeToIsoDates(r.start, r.end));
        });
        if (!ignoreDraftSingles) forbiddenIsoList = forbiddenIsoList.concat(selectedSingles);
        const forbiddenSet = new Set(forbiddenIsoList);
        return candidateDates.some(d => {
            if (forbiddenSet.has(d)) return true;
            try { if (isLocked(d)) return true; } catch { return false; }
            return false;
        });
    }

    //function notifyLockedSelection(message) {
    //    if (typeof window.showPopup === 'function') {
    //        try { window.showPopup({ title: '日期衝突', message: message || '選擇的日期包含已鎖定或重疊的期間。', type: 'error', autoClose: true, seconds: 3 }); return; } catch { }
    //    }
    //    console.log(message || 'Conflict detected');
    //}

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
            try { return DH.fromIso(iso).getFullYear() === currentYear && DH.fromIso(iso).getMonth() === currentMonth; } catch { return false; }
        });

        try {
            const count = filtered.length;
            const badge = document.getElementById('selectedCount');
            if (badge) {
                badge.textContent = String(count);
                if (!dragState) setListHeaderMessage(`已選 ${count} 個時段`, 3);
            }
        } catch (e) { }

        if (!filtered.length) {
            if ($list.length) $list.html('<div class="text-muted">本月份尚無選擇的日期</div>');
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

    function formatIsoToLabel(iso) {
        try { const d = DH.fromIso(iso); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; } catch { return iso; }
    }

    function renderCalendarRange() {
        const $el = $('#calendarRange');
        if ($el.length === 0) return;
        const all = Array.from(new Set(getAllDraftDates().concat(submittedDates || [])));
        if (!all.length) {
            $el.html('');
            try { document.getElementById('selectedCount').textContent = '0'; } catch { }
            return;
        }
        all.sort();
        $el.html(all.map(iso => `<div class="calendar-range-item">${formatIsoToLabel(iso)}</div>`).join(''));
    }

    async function fetchSubmittedDatesFromServer() {
        try {
            const data = await new Promise((resolve, reject) => {
                $.ajax({
                    url: '/api/auth/GetLeaves', method: 'GET', xhrFields: { withCredentials: true },
                    headers: { 'RequestVerificationToken': window.csrfToken || '' },
                    success(res) { resolve(res); }, error(xhr) { reject(xhr); }
                });
            });
            submittedDates = dedupeDates(data?.dates || []);
            lastSubmittedSet = new Set();
            renderSubmittedList();
            renderMonth();
        } catch (e) { }
    }

    async function syncLeaves(addedDates, removedDates) {
        try {
            const ok = await new Promise((resolve) => {
                $.ajax({
                    url: '/api/auth/SaveLeaves', method: 'POST', contentType: 'application/json',
                    xhrFields: { withCredentials: true },
                    headers: { 'RequestVerificationToken': window.csrfToken || '' },
                    data: JSON.stringify({ Added: addedDates, Removed: removedDates }),
                    success(res) { resolve(true); }, error(xhr) { resolve(false); }
                });
            });
            if (ok) {
                // 依據操作型態呈現更清楚的訊息
                let toastMsg = '儲存成功';
                if (addedDates && addedDates.length > 0 && (!removedDates || removedDates.length === 0)) toastMsg = '提交成功';
                else if (removedDates && removedDates.length > 0 && (!addedDates || addedDates.length === 0)) toastMsg = '刪除成功';
                else if ((addedDates && addedDates.length > 0) || (removedDates && removedDates.length > 0)) toastMsg = '更新成功';

                setListHeaderMessage(toastMsg, 3);
                // 顯示黑底白字提示（符合需求）
                showBlackToast(toastMsg, 2);

                document.dispatchEvent(new CustomEvent('calendar:saved'));
            } else {
                setListHeaderMessage('同步失敗，請稍後重試', 4);
                showBlackToast('同步失敗，請稍後重試', 3);
            }
            return ok;
        } catch (e) { return false; }
    }

    function init(options = {}) {
        const today = DH.startOfToday();
        currentYear = options.year ?? today.getFullYear();
        currentMonth = options.month ?? today.getMonth();
        lockedRanges = options.lockedRanges ?? [];
        if (typeof options.showEnglishMonths !== 'undefined') showEnglishMonths = !!options.showEnglishMonths;

        if (typeof options.editMode !== 'undefined') {
            editMode = !!options.editMode;
        }

        const $editBtn = $('.edit');
        if (editMode) {
            $('body').addClass('calendar-editing');
            // ★ 修改：編輯模式時，顯示文字「編輯模式」，加上橘色 Active 樣式
            $editBtn.text('編輯模式').addClass('active-orange');
        } else {
            $('body').removeClass('calendar-editing');
            // ★ 修改：鎖定模式時，顯示文字「鎖定模式」，移除橘色樣式
            $editBtn.text('鎖定模式').removeClass('active-orange');
        }

        const draft = loadDraftFromSession();
        if (draft && ((draft.singles && draft.singles.length) || (draft.ranges && draft.ranges.length)) && !_calendarDraftPromptShown) {
            _calendarDraftPromptShown = true;
            setTimeout(() => {
                if (confirm('偵測到上次尚未確認的日曆變更，是否要匯入？')) {
                    selectedSingles = (draft.singles || []).slice();
                    selectedRanges = draft.ranges || [];
                    editMode = true;
                    $('body').addClass('calendar-editing');
                    $editBtn.text('編輯模式').addClass('active-orange');
                    renderMonth();
                } else { clearDraftSession(); }
            }, 200);
        }

        submittedDates = options.submittedDates ?? [];
        fetchSubmittedDatesFromServer();
        buildMonthPanel();
        bindEvents();
        renderMonth();
        renderSubmittedList();

        checkAndShowStepHints();
    }

    function checkAndShowStepHints() {
        const raw = sessionStorage.getItem('calendar_check_pending');
        if (raw) {
            startTutorialFlow();
        }
    }

    function startTutorialFlow() {
        tutorialStep = 1;
        setTimeout(() => {
            $('.edit').addClass('guide-hint btn-edit');
        }, 500);
    }

    function advanceTutorialStep() {
        if (tutorialStep === 1) {
            $('.edit').removeClass('guide-hint btn-edit');
            tutorialStep = 2;
            setTimeout(() => {
                $('.month-right').addClass('guide-hint');
            }, 300);
        }
        else if (tutorialStep === 2) {
            $('.month-right').removeClass('guide-hint');
            tutorialStep = 3;
            setTimeout(() => {
                const $target = $('.day-cell:not(.empty):not(.locked)').first();
                if ($target.length) $target.addClass('guide-hint');
            }, 300);
        }
        else if (tutorialStep === 3) {
            $('.day-cell').removeClass('guide-hint');
            tutorialStep = 4;
            setTimeout(() => {
                $('.confirm').addClass('guide-hint').attr('id', 'btn-confirm');
            }, 300);
        }
        else if (tutorialStep === 4) {
            $('.confirm').removeClass('guide-hint');
            tutorialStep = 0;
            document.dispatchEvent(new CustomEvent('calendarui:dismissHints'));

            if (window.CalendarUI && typeof window.CalendarUI.showBellHint === 'function') {
                setTimeout(() => window.CalendarUI.showBellHint(), 500);
            }
        }
    }

    function bindEvents() {
        let wasDragging = false;

        $(document)
            .off('.calendar')
            .on('calendar:startTutorial', function () {
                startTutorialFlow();
            })
            .on('click.calendar', '.guide-hint', function () {
                // handled by button logic
            })
            .on('click.calendar', '.year-left', () => { currentYear--; buildMonthPanel(); renderMonth(); })
            .on('click.calendar', '.year-right', () => { currentYear++; buildMonthPanel(); renderMonth(); })
            .on('click.calendar', '.month-left', () => changeMonth(-1))
            .on('click.calendar', '.month-right', function () {
                changeMonth(1);
                if (tutorialStep === 2) advanceTutorialStep();
            })
            .on('click.calendar', '.month-btn', function () { currentMonth = Number($(this).data('month')); renderMonth(); updateMonthActive(); })

            // --- Click Logic ---
            .on('click.calendar', '.day-cell:not(.locked)', function (e) {
                if (wasDragging) { wasDragging = false; return; }
                if (dragState || !editMode) return;
                if ($(e.target).hasClass('cell-delete')) return;
                onDateClick($(this).data('date'));

                if (tutorialStep === 3) advanceTutorialStep();
            })
            // --- Double Click Logic ---
            .on('dblclick.calendar', '.day-cell:not(.locked)', function (e) {
                if (!editMode) return;
                if ($(e.target).hasClass('cell-delete')) return;
                const iso = $(this).data('date');
                const candidate = [iso];
                if (hasIntersectionWithExisting(candidate, { ignoreDraftSingles: false }) && !selectedSingles.includes(iso)) return;

                if (selectedSingles.includes(iso)) {
                    selectedSingles = selectedSingles.filter(s => s !== iso);
                } else {
                    selectedSingles.push(iso);
                    selectedRanges = selectedRanges.filter(r => !expandRangeToIsoDates(r.start, r.end).includes(iso));
                }
                saveDraftToSession(); renderMonth();
                if (tutorialStep === 3) advanceTutorialStep();
            })
            // --- Drag Start ---
            .on('mousedown.calendar', '.day-cell', function (e) {
                if (!editMode || e.button !== 0) return;
                if ($(e.target).hasClass('cell-delete')) return;

                const $cell = $(this);
                const iso = $cell.data('date');

                let foundIndex = -1, type = null;
                selectedRanges.forEach((r, idx) => {
                    if (r.start === iso) { foundIndex = idx; type = 'start'; }
                    else if (r.end === iso) { foundIndex = idx; type = 'end'; }
                });

                if (foundIndex !== -1 && type) {
                    e.preventDefault();
                    dragState = { index: foundIndex, type: type };
                    $('body').addClass('calendar-dragging');
                }
            })
            // --- Drag Move ---
            .on('mousemove.calendar', function (e) {
                if (dragState) {
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    const $target = $(el).closest('.day-cell');
                    if ($target.length === 0) return;
                    const hoverIso = $target.data('date');
                    if (!hoverIso || isLocked(hoverIso)) return;

                    const range = selectedRanges[dragState.index];
                    let newStart = (dragState.type === 'start') ? hoverIso : range.start;
                    let newEnd = (dragState.type === 'end') ? hoverIso : range.end;

                    if (DH.fromIso(newStart) > DH.fromIso(newEnd)) {
                        [newStart, newEnd] = [newEnd, newStart];
                        dragState.type = (dragState.type === 'start') ? 'end' : 'start';
                    }

                    const candidate = expandRangeToIsoDates(newStart, newEnd);
                    if (!hasIntersectionWithExisting(candidate, { ignoreDraftSingles: true, excludeRangeIndex: dragState.index })) {
                        selectedRanges[dragState.index] = { start: newStart, end: newEnd };
                        selectedSingles = selectedSingles.filter(s => !candidate.includes(s));
                        renderMonth();
                    }
                    return;
                }
            })
            // --- Drag End ---
            .on('mouseup.calendar', function () {
                if (dragState) {
                    dragState = null;
                    wasDragging = true;
                    setTimeout(() => wasDragging = false, 50);
                    $('body').removeClass('calendar-dragging');
                    saveDraftToSession(); renderSubmittedList();

                    if (tutorialStep === 3) advanceTutorialStep();
                }
            })
            // --- Step 1: 點擊編輯按鈕 (切換模式與樣式) ---
            .on('click.calendar', '.edit', function () {
                editMode = !editMode;
                const $btn = $(this);
                // ★ 修改：切換文字與 class
                $btn.text(editMode ? '編輯模式' : '鎖定模式');
                $btn.toggleClass('active-orange', editMode);

                rangeDraftStart = null;
                $('body').toggleClass('calendar-editing', editMode);
                renderMonth();

                if (tutorialStep === 1) advanceTutorialStep();
            })
            .on('click.calendar', '.btn-delete', function () {
                showDeleteButtons = !showDeleteButtons;
                renderMonth();
            })
            // --- Step 4: 點擊提交按鈕 ---
            .on('click.calendar', '.confirm', async function () {
                if (tutorialStep === 4) advanceTutorialStep();

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
                await syncLeaves(toAdd, []);
            });

        $(document).on('click.calendar', '#calendarList .calendar-range-item', function () {
            const iso = $(this).data('date');
            focusMonthAndHighlight(iso);
        });
        $(document).on('keydown.calendar', '#calendarList .calendar-range-item', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                focusMonthAndHighlight($(this).data('date'));
            }
        });
    }

    function buildMonthPanel() {
        const $grid = $('.months-grid');
        $('.year-display').text(currentYear);
        $grid.empty();
        for (let m = 0; m < 12; m++) {
            const d = new Date(currentYear, m, 1);
            const enHtml = showEnglishMonths ? `<div class="en">${d.toLocaleString('en-US', { month: 'long' })}</div>` : '';
            const $btn = $(`<div class="month-btn" data-month="${m}"><div class="mn">${m + 1} 月</div>${enHtml}</div>`);
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
        renderMonth(); updateMonthActive();
    }

    function onDateClick(iso) {
        if (!editMode) return;
        if (rangeDraftStart) {
            const candidate = expandRangeToIsoDates(rangeDraftStart, iso);
            if (!hasIntersectionWithExisting(candidate, { ignoreDraftSingles: true })) {
                selectedRanges.push({ start: rangeDraftStart, end: iso });
                selectedSingles = selectedSingles.filter(s => !candidate.includes(s));
            } else { notifyLockedSelection(); }
            rangeDraftStart = null;
        } else {
            if (isLocked(iso) || submittedDates.includes(iso)) { notifyLockedSelection(); return; }
            if (selectedRanges.some(r => DH.isBetweenInclusive(DH.fromIso(iso), DH.fromIso(r.start), DH.fromIso(r.end)))) { notifyLockedSelection('該日期已在範圍內。'); return; }
            rangeDraftStart = iso;
        }
        renderMonth(); saveDraftToSession();
    }

    async function removeDate(iso) {
        if (selectedSingles.includes(iso)) selectedSingles = selectedSingles.filter(s => s !== iso);
        selectedRanges = selectedRanges.filter(r => !expandRangeToIsoDates(r.start, r.end).includes(iso));
        if (submittedDates.includes(iso)) {
            submittedDates = submittedDates.filter(d => d !== iso);
            await syncLeaves([], [iso]);
        }
        renderMonth(); renderSubmittedList(); saveDraftToSession();
    }

    function isLocked(iso) {
        const d = DH.fromIso(iso);
        if (DH.isBefore(d, DH.startOfToday())) return true;
        return lockedRanges.some(r => DH.isBetweenInclusive(d, DH.fromIso(r.start), DH.fromIso(r.end)));
    }

    function renderMonth() {
        const $days = $('.days');
        $('.month-display').text(new Date(currentYear, currentMonth, 1).toLocaleString('zh-TW', { year: 'numeric', month: 'long' }));
        $days.empty();
        const firstDay = new Date(currentYear, currentMonth, 1);
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const startIndex = (firstDay.getDay() + 6) % 7;

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
            if (submittedDates.includes(iso)) $cell.addClass(lastSubmittedSet.has(iso) ? 'submitted-new' : 'submitted-old');
            if (selectedSingles.includes(iso)) $cell.addClass('selected-single');

            const isSelected = selectedSingles.includes(iso) || selectedRanges.some(r => DH.isBetweenInclusive(date, DH.fromIso(r.start), DH.fromIso(r.end)));
            if (showDeleteButtons && !isLocked(iso) && (isSelected || submittedDates.includes(iso))) {
                const $del = $('<button>', { class: 'cell-delete', text: '×', title: '刪除', type: 'button' });
                $del.on('mousedown click', (e) => { e.stopPropagation(); removeDate(iso); });
                $cell.append($del);
            }
            $cell.append($label);
            $days.append($cell);
        }
        renderCalendarList ? renderCalendarList() : renderCalendarRange();

        if (tutorialStep === 3) {
            const $target = $('.day-cell:not(.empty):not(.locked)').first();
            if ($target.length) $target.addClass('guide-hint');
        }
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