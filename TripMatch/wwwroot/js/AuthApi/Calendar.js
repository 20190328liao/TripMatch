(function (jQuery, dateFns) {
    'use strict';

    if (!jQuery || typeof jQuery !== 'function') {
        console.error('Calendar.js: jQuery 未載入或 $ 被覆寫，請確認 jQuery 在此檔案之前載入。');
        return;
    }

    const $ = jQuery;
    const dateUtils = dateFns || {};
    const { format, parseISO, startOfDay, isBefore, isWithinInterval, isSameDay } = dateUtils;

    if (!format || !startOfDay || !isBefore || !isWithinInterval || !isSameDay) {
        console.warn('Calendar.js: window.dateFns 未完全載入，部分日期驗證可能無法正常運作。');
    }

    $(function () {
        // --- 1. 設定與狀態 ---
        let mode = 'range'; // 'single' | 'range'
        let editMode = false;

        // 追蹤刪除與暫存
        let datesToUnregister = new Set();
        let tempSingleDates = new Set();               // "yyyy-MM-dd"
        let tempRanges = [];                           // { id, start: "yyyy-MM-dd", end: "yyyy-MM-dd" }
        let savedDates = new Set();                    // 資料庫已存的 "yyyy-MM-dd"
        let lockedRanges = [];                         // 後端鎖定的範圍

        // DOM 元素綁定（防護：如果找不到元素，記錄錯誤）
        const monthsGrid = document.querySelector('.months-grid');
        const yearDisplay = document.querySelector('.year-display');
        const [yearLeft, yearRight] = [document.querySelector('.year-left'), document.querySelector('.year-right')];
        const monthDisplay = document.querySelector('.month-display');
        const [monthLeft, monthRight] = [document.querySelector('.month-left'), document.querySelector('.month-right')];
        const days = document.querySelector('.days');
        const status = document.querySelector('.selected');
        const selected = document.querySelector('.selected'); // 新增：修正 ReferenceError（renderRightCalendar 使用）
        const hintEl = document.getElementById('CalendarHint');
        const [singleSelectBtn, multiSelectBtn, confirmBtn, editBtn] = [
            document.querySelector('.single-select'),
            document.querySelector('.multi-select'),
            document.querySelector('.confirm'),
            document.querySelector('.edit')
        ];

        if (!days) {
            console.error('Calendar.js: 找不到 .days 容器，日曆無法顯示。請確認 MemberCenter.cshtml 或對應 partial 含有 .days 元素。');
            return;
        }

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const SESSION_KEY = 'calendar_temp_v1';

        let today = new Date();
        let selectedYear = today.getFullYear();
        let selectedMonth = today.getMonth();
        const startRangeBuffer = { start: null }; // ISO 字串
        const singleClickBuffer = { last: null }; // ISO 字串

        // --- 2. 工具函式 ---
        const toIso = (d) => {
            if (!d) return '';
            if (typeof d === 'string') return d;
            if (format && typeof format === 'function') return format(d, 'yyyy-MM-dd');
            // fallback
            return d.toISOString().split('T')[0];
        };
        const fromIso = (iso) => {
            const [y, m, d] = iso.split('-').map(Number);
            return new Date(y, m - 1, d); // 純本地日期
        };

        function makeId() {
            return (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : `r_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        }

        function showHint(msg, seconds = 3) {
            if (!hintEl) return;
            const defaultHint = "請選擇日期或範圍";
            hintEl.textContent = msg;
            setTimeout(() => { hintEl.textContent = defaultHint; }, seconds * 1000);
        }
        function getDatesInRangeIso(startIso, endIso) {
            const arr = [];
            let cur = fromIso(startIso);
            const end = fromIso(endIso);

            while (cur <= end) {
                arr.push(toIso(cur));
                cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
            }
            return arr;
        }

        function isLockedDateIso(iso) {
            try {
                const target = (startOfDay && typeof startOfDay === 'function') ? startOfDay(fromIso(iso)) : fromIso(iso);
                const now = (startOfDay && typeof startOfDay === 'function') ? startOfDay(new Date()) : new Date();
                if ((isBefore && typeof isBefore === 'function') ? isBefore(target, now) : (target < now)) return true; // 過去的日期不可選
                return lockedRanges.some(r =>
                    (isWithinInterval && typeof isWithinInterval === 'function')
                        ? isWithinInterval(target, { start: startOfDay(fromIso(r.start)), end: startOfDay(fromIso(r.end)) })
                        : (target >= fromIso(r.start) && target <= fromIso(r.end))
                );
            } catch (ex) {
                console.error('isLockedDateIso error', ex);
                return false;
            }
        }

        function findDuplicates(candidateIsoArr) {
            const dup = new Set();
            candidateIsoArr.forEach(iso => {
                if (savedDates.has(iso)) dup.add(iso);
                if (tempSingleDates.has(iso)) dup.add(iso);
                const isInRange = tempRanges.some(r => {
                    const d = fromIso(iso);
                    return (isWithinInterval && typeof isWithinInterval === 'function')
                        ? isWithinInterval(d, { start: fromIso(r.start), end: fromIso(r.end) })
                        : (d >= fromIso(r.start) && d <= fromIso(r.end));
                });
                if (isInRange) dup.add(iso);
            });
            return [...dup].sort();
        }

        // --- 月份選單與日曆 render（取代現有相應函式） ---
        function renderMonthsGrid() {
            if (!monthsGrid) return;
            monthsGrid.innerHTML = '';
            for (let m = 0; m < 12; m++) {
                const btn = document.createElement('div');
                btn.className = 'month-btn' + (m === selectedMonth ? ' active' : '');
                btn.tabIndex = 0;
                btn.role = 'button';
                btn.dataset.month = String(m);
                btn.innerHTML = `<div class="mn">${m + 1} 月</div><div class="en">${monthNames[m]}</div>`;
                btn.addEventListener('click', () => {
                    selectedMonth = m;
                    renderRightCalendar();
                    updateDisplays();
                    highlightSelectedMonth();
                });
                btn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        btn.click();
                    }
                });
                monthsGrid.appendChild(btn);
            }
            highlightSelectedMonth();
            updateDisplays();
        }

        function highlightSelectedMonth() {
            if (!monthsGrid) return;
            const btns = monthsGrid.querySelectorAll('.month-btn');
            btns.forEach(b => {
                const m = parseInt(b.dataset.month, 10);
                if (m === selectedMonth) b.classList.add('active'); else b.classList.remove('active');
            });
        }

        function updateDisplays() {
            if (yearDisplay) yearDisplay.textContent = String(selectedYear);
            if (monthDisplay) monthDisplay.textContent = `${monthNames[selectedMonth]} ${selectedYear}`;
        }

        // 調整 renderRightCalendar：週一為每週第一天（符合 UI 標示）並保留原有功能
        function renderRightCalendar() {
            if (!days) return;
            updateDisplays();
            days.innerHTML = '';
            // 若頁面有顯示已選文字容器則清空
            if (selected) selected.innerHTML = '';

            const firstDay = new Date(selectedYear, selectedMonth, 1);
            const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
            const firstIndex = (firstDay.getDay() + 6) % 7;
            const numberOfDays = lastDay.getDate();

            // empty slots for alignment
            for (let i = 0; i < firstIndex; i++) {
                const empty = document.createElement('div');
                empty.className = 'day-cell empty';
                days.appendChild(empty);
            }

            for (let d = 1; d <= numberOfDays; d++) {
                const curDate = new Date(selectedYear, selectedMonth, d);
                const iso = toIso(curDate);
                const cell = document.createElement('div');
                cell.className = 'day-cell';
                cell.dataset.iso = iso;
                cell.innerHTML = `<span class="day-label">${d}</span>`;

                // 狀態樣式
                if (isLockedDateIso(iso)) cell.classList.add('locked');
                if ((isSameDay && typeof isSameDay === 'function') ? isSameDay(curDate, new Date()) : (curDate.toDateString() === new Date().toDateString())) cell.classList.add('today');
                if (tempSingleDates.has(iso)) cell.classList.add('selected-single');
                if (savedDates.has(iso)) cell.classList.add('saved');

                // 標記為「待刪除」
                if (datesToUnregister.has(iso)) {
                    cell.classList.add('to-unregister');
                    // 加入視覺標記（避免重複加入）
                    if (!cell.querySelector('.to-unregister-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'to-unregister-mark';
                        mark.setAttribute('aria-hidden', 'true');
                        mark.textContent = '刪除';
                        cell.appendChild(mark);
                    }
                }

                // 範圍顯示邏輯
                tempRanges.forEach(r => {
                    const interval = { start: fromIso(r.start), end: fromIso(r.end) };
                    if ((isWithinInterval && typeof isWithinInterval === 'function')
                        ? isWithinInterval(curDate, interval)
                        : (curDate >= interval.start && curDate <= interval.end)) cell.classList.add('selected-range');
                    if (iso === r.start) cell.classList.add('range-start');
                    if (iso === r.end) cell.classList.add('range-end');
                });

                if (mode === 'range' && startRangeBuffer.start === iso) cell.classList.add('range-start');

                // 點擊事件
                cell.addEventListener('click', () => handleCellClick(iso));

                // 編輯模式的 X 按鈕
                if (editMode && (savedDates.has(iso) || tempSingleDates.has(iso) || cell.classList.contains('selected-range'))) {
                    appendCloseButton(cell, iso);
                }

                days.appendChild(cell);
            }

            updateStatusText();
        }

        // --- 3. 資料存取 API ---
        async function fetchLockedDates() {
            const url = window.Routes?.AuthApi?.GetLockedRanges || '/api/auth/GetLockedRanges';
            try {
                const res = await fetch(url, { credentials: 'same-origin' });
                if (res.ok) {
                    const data = await res.json();
                    lockedRanges = (data?.ranges || []).map(r => ({ start: toIso(r.start), end: toIso(r.end) }));
                }
            } catch (ex) { console.error('Locked dates error', ex); }
        }

        async function fetchSavedDates() {
            const url = window.Routes?.AuthApi?.GetLeaves || '/api/auth/GetLeaves';
            try {
                const res = await fetch(url, { credentials: 'same-origin' });
                if (res.ok) {
                    const data = await res.json();
                    savedDates = new Set((data?.dates || []).map(d => toIso(d)));
                }
            } catch (ex) { console.error('Saved dates error', ex); }
        }

        // --- 4. 核心邏輯：儲存 ---
        async function confirmSave() {
            const currentSelectedDates = new Set([...tempSingleDates]);
            tempRanges.forEach(range => {
                getDatesInRangeIso(range.start, range.end).forEach(date => currentSelectedDates.add(date));
            });

            const payload = {
                added: [...currentSelectedDates].filter(iso => !savedDates.has(iso)),
                removed: [...datesToUnregister]
            };

            if (payload.added.length === 0 && payload.removed.length === 0) {
                alert("無任何變更");
                return;
            }

            const url = window.Routes?.AuthApi?.SaveLeaves || '/api/auth/SaveLeaves';
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    payload.added.forEach(d => savedDates.add(d));
                    payload.removed.forEach(d => savedDates.delete(d));
                    tempSingleDates.clear();
                    tempRanges = [];
                    datesToUnregister.clear();
                    startRangeBuffer.start = null;
                    sessionStorage.removeItem(SESSION_KEY);
                    editMode = false;
                    renderRightCalendar();
                    showHint(`儲存成功！新增 ${payload.added.length} 天，移除 ${payload.removed.length} 天`);
                }
            } catch (ex) { console.error('Save error', ex); }
        }

        // --- 5. UI 渲染 ---
        function renderRightCalendar() {
            if (!days) return;
            updateDisplays();
            days.innerHTML = '';
            // 若頁面有顯示已選文字容器則清空
            if (selected) selected.innerHTML = '';

            const firstDay = new Date(selectedYear, selectedMonth, 1);
            const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
            const firstIndex = (firstDay.getDay() + 6) % 7;
            const numberOfDays = lastDay.getDate();

            // empty slots for alignment
            for (let i = 0; i < firstIndex; i++) {
                const empty = document.createElement('div');
                empty.className = 'day-cell empty';
                days.appendChild(empty);
            }

            for (let d = 1; d <= numberOfDays; d++) {
                const curDate = new Date(selectedYear, selectedMonth, d);
                const iso = toIso(curDate);
                const cell = document.createElement('div');
                cell.className = 'day-cell';
                cell.dataset.iso = iso;
                cell.innerHTML = `<span class="day-label">${d}</span>`;

                // 狀態樣式
                if (isLockedDateIso(iso)) cell.classList.add('locked');
                if ((isSameDay && typeof isSameDay === 'function') ? isSameDay(curDate, new Date()) : (curDate.toDateString() === new Date().toDateString())) cell.classList.add('today');
                if (tempSingleDates.has(iso)) cell.classList.add('selected-single');
                if (savedDates.has(iso)) cell.classList.add('saved');

                // 標記為「待刪除」
                if (datesToUnregister.has(iso)) {
                    cell.classList.add('to-unregister');
                    // 加入視覺標記（避免重複加入）
                    if (!cell.querySelector('.to-unregister-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'to-unregister-mark';
                        mark.setAttribute('aria-hidden', 'true');
                        mark.textContent = '刪除';
                        cell.appendChild(mark);
                    }
                }

                // 範圍顯示邏輯
                tempRanges.forEach(r => {
                    const interval = { start: fromIso(r.start), end: fromIso(r.end) };
                    if ((isWithinInterval && typeof isWithinInterval === 'function')
                        ? isWithinInterval(curDate, interval)
                        : (curDate >= interval.start && curDate <= interval.end)) cell.classList.add('selected-range');
                    if (iso === r.start) cell.classList.add('range-start');
                    if (iso === r.end) cell.classList.add('range-end');
                });

                if (mode === 'range' && startRangeBuffer.start === iso) cell.classList.add('range-start');

                // 點擊事件
                cell.addEventListener('click', () => handleCellClick(iso));

                // 編輯模式的 X 按鈕
                if (editMode && (savedDates.has(iso) || tempSingleDates.has(iso) || cell.classList.contains('selected-range'))) {
                    appendCloseButton(cell, iso);
                }

                days.appendChild(cell);
            }

            updateStatusText();
        }

        function handleCellClick(iso) {
            if (isLockedDateIso(iso)) {
                showHint('該日期不可操作');
                return;
            }

            if (mode === 'single') {
                if (singleClickBuffer.last === iso) {
                    const dup = findDuplicates([iso]);
                    if (dup.length > 0 && !tempSingleDates.has(iso)) {
                        showHint(`日期重複`);
                    } else {
                        if (tempSingleDates.has(iso)) tempSingleDates.delete(iso);
                        else tempSingleDates.add(iso);
                        saveTempToSession();
                    }
                    singleClickBuffer.last = null;
                } else {
                    singleClickBuffer.last = iso;
                    showHint('再點一次以確認');
                }
            } else {
                // Range 邏輯
                if (!startRangeBuffer.start) {
                    startRangeBuffer.start = iso;
                    showHint('請選擇結束日');
                } else {
                    let s = startRangeBuffer.start, e = iso;
                    if ((isBefore && typeof isBefore === 'function') ? isBefore(fromIso(e), fromIso(s)) : (fromIso(e) < fromIso(s))) [s, e] = [e, s];

                    const candidate = getDatesInRangeIso(s, e);
                    if (findDuplicates(candidate).length > 0) {
                        showHint('範圍內包含重複日期');
                    } else {
                        tempRanges.push({ id: makeId(), start: s, end: e });
                        saveTempToSession();
                    }
                    startRangeBuffer.start = null;
                }
            }
            renderRightCalendar();
        }

        function appendCloseButton(cell, iso) {
            const btn = document.createElement('button');
            btn.className = 'cell-close';
            btn.innerHTML = '&times;';
            btn.onclick = (e) => {
                e.stopPropagation();
                if (tempSingleDates.has(iso)) tempSingleDates.delete(iso);
                else if (savedDates.has(iso)) {
                    if (datesToUnregister.has(iso)) datesToUnregister.delete(iso);
                    else datesToUnregister.add(iso);
                } else {
                    // 移除 Range
                    tempRanges = tempRanges.filter(r => {
                        const d = fromIso(iso);
                        return !((isWithinInterval && typeof isWithinInterval === 'function')
                            ? isWithinInterval(d, { start: fromIso(r.start), end: fromIso(r.end) })
                            : (d >= fromIso(r.start) && d <= fromIso(r.end)));
                    });
                }
                saveTempToSession();
                renderRightCalendar();
            };
            cell.appendChild(btn);
        }

        function updateStatusText() {
            if (!status) return;

            // 先由範圍與單日建立顯示項目（格式：yyyy-MM-dd→yyyy-MM-dd）
            const rangeItems = tempRanges
                .map(r => `${r.start}→${r.end}`);

            const singleItems = [...tempSingleDates]
                .slice() // 複製後排序顯示
                .sort()
                .map(d => `${d}→${d}`);

            const allItems = [...rangeItems, ...singleItems];

            let text;
            if (allItems.length > 0) {
                text = `選擇日期：${allItems.join('，')} | 已選範圍: ${tempRanges.length}`;
            } 

            if (datesToUnregister.size > 0) {
                text += ` | 待刪除: ${datesToUnregister.size}`;
            }

            status.textContent = text;
        }

        function saveTempToSession() {
            const data = { singles: [...tempSingleDates], ranges: tempRanges };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
        }

        // --- 6. 初始化 --- (加上 month 導覽綁定與 monthsGrid 渲染)
        yearLeft?.addEventListener('click', () => { selectedYear--; renderMonthsGrid(); renderRightCalendar(); });
        yearRight?.addEventListener('click', () => { selectedYear++; renderMonthsGrid(); renderRightCalendar(); });

        monthLeft?.addEventListener('click', () => {
            selectedMonth = (selectedMonth + 11) % 12;
            if (selectedMonth === 11) selectedYear--;
            renderMonthsGrid(); renderRightCalendar();
        });
        monthRight?.addEventListener('click', () => {
            selectedMonth = (selectedMonth + 1) % 12;
            if (selectedMonth === 0) selectedYear++;
            renderMonthsGrid(); renderRightCalendar();
        });

        singleSelectBtn?.addEventListener('click', () => { mode = 'single'; renderRightCalendar(); });
        multiSelectBtn?.addEventListener('click', () => { mode = 'range'; renderRightCalendar(); });
        editBtn?.addEventListener('click', () => { editMode = !editMode; renderRightCalendar(); });
        confirmBtn?.addEventListener('click', confirmSave);

        async function init() {
            await fetchLockedDates();
            await fetchSavedDates();
            renderMonthsGrid(); // 新增：先渲染月份選單
            renderRightCalendar();
        }
        init();
    });
})(window.jQuery, window.dateFns);