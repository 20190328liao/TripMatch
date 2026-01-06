// Two-panel calendar: left months grid + year controls, right month calendar
const monthsGrid = document.querySelector('.months-grid');
const yearDisplay = document.querySelector('.year-display');
const yearLeft = document.querySelector('.year-left');
const yearRight = document.querySelector('.year-right');

const monthDisplay = document.querySelector('.month-display');
const monthLeft = document.querySelector('.month-left');
const monthRight = document.querySelector('.month-right');

const days = document.querySelector('.days');
const selected = document.querySelector('.selected');

// New buttons
const singleSelectBtn = document.querySelector('.single-select');
const multiSelectBtn = document.querySelector('.multi-select');
const confirmBtn = document.querySelector('.confirm');
const editBtn = document.querySelector('.edit');

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

let today = new Date();
let selectedYear = today.getFullYear();
let selectedMonth = today.getMonth();

let mode = 'multi'; // 'single' or 'multi'
let startDate = null;
let endDate = null;
let lockedDates = []; // array of date strings from Recommandations
let savedDates = []; // array of date strings from Leaves

function renderMonthsGrid() {
    monthsGrid.innerHTML = '';
    for (let m = 0; m < 12; m++) {
        const btn = document.createElement('div');
        btn.className = 'month-btn';
        btn.dataset.month = m;
        btn.innerHTML = `<div class="mn">${m + 1} 月</div><div class="en">${monthNames[m]}</div>`;
        btn.addEventListener('click', () => {
            selectedMonth = m;
            renderRightCalendar();
            updateDisplays();
            highlightSelectedMonth();
        });
        monthsGrid.appendChild(btn);
    }
    highlightSelectedMonth();
}

function highlightSelectedMonth() {
    const btns = monthsGrid.querySelectorAll('.month-btn');
    btns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.month, 10) === selectedMonth));
}

function updateDisplays() {
    yearDisplay.textContent = selectedYear;
    monthDisplay.textContent = `${monthNames[selectedMonth]} ${selectedYear}`;
}

function renderRightCalendar() {
    days.innerHTML = '';
    selected.innerHTML = '';

    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
    const firstIndex = firstDay.getDay();
    const numberOfDays = lastDay.getDate();

    // empty slots
    for (let i = 0; i < firstIndex; i++) {
        const cell = document.createElement('div');
        days.appendChild(cell);
    }

    for (let d = 1; d <= numberOfDays; d++) {
        const cell = document.createElement('div');
        const cur = new Date(selectedYear, selectedMonth, d);
        cell.textContent = `${selectedMonth + 1}/${d}`;
        cell.dataset.date = cur.toDateString();
        
        // Check if date is locked
        if (lockedDates.includes(cur.toDateString())) {
            cell.classList.add('locked');
            cell.style.pointerEvents = 'none'; // disable click
        }
        
        // Check if date is saved
        if (savedDates.includes(cur.toDateString())) {
            cell.classList.add('saved');
        }
        
        cell.addEventListener('click', (e) => {
            if (cell.classList.contains('locked')) return; // cannot select locked dates
            
            const dateStr = e.target.dataset.date;
            if (mode === 'single') {
                startDate = dateStr;
                endDate = null;
                selected.textContent = `Selected Date: ${dateStr}`;
            } else { // multi
                if (!startDate) {
                    startDate = dateStr;
                    endDate = null;
                    selected.textContent = `Start Date: ${dateStr}`;
                } else if (!endDate) {
                    if (new Date(dateStr) < new Date(startDate)) {
                        endDate = startDate;
                        startDate = dateStr;
                    } else {
                        endDate = dateStr;
                    }
                    selected.textContent = `Selected Range: ${startDate} to ${endDate}`;
                } else {
                    // reset and start new
                    startDate = dateStr;
                    endDate = null;
                    selected.textContent = `Start Date: ${dateStr}`;
                }
            }
            renderRightCalendar(); // re-render to update highlights
        });

        // highlight today's date
        if (cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth() && cur.getDate() === today.getDate()) {
            cell.classList.add('current-date');
        }

        // highlight selected range
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (cur >= start && cur <= end) {
                cell.classList.add('selected-range');
            }
        }
        if (startDate && cur.toDateString() === startDate) {
            cell.classList.add('start-circle');
        }
        if (endDate && cur.toDateString() === endDate) {
            cell.classList.add('end-circle');
        }

        days.appendChild(cell);
    }
    highlightSelectedMonth();
}

// year controls
yearLeft.addEventListener('click', () => {
    selectedYear -= 1;
    updateDisplays();
    renderRightCalendar();
});
yearRight.addEventListener('click', () => {
    selectedYear += 1;
    updateDisplays();
    renderRightCalendar();
});

// month controls (top-right)
monthLeft.addEventListener('click', () => {
    selectedMonth -= 1;
    if (selectedMonth < 0) { selectedMonth = 11; selectedYear -= 1; }
    updateDisplays();
    renderRightCalendar();
});
monthRight.addEventListener('click', () => {
    selectedMonth += 1;
    if (selectedMonth > 11) { selectedMonth = 0; selectedYear += 1; }
    updateDisplays();
    renderRightCalendar();
});

// button events
singleSelectBtn.addEventListener('click', () => {
    mode = 'single';
    startDate = null;
    endDate = null;
    selected.textContent = '';
    renderRightCalendar();
});

multiSelectBtn.addEventListener('click', () => {
    mode = 'multi';
    startDate = null;
    endDate = null;
    selected.textContent = '';
    renderRightCalendar();
});

confirmBtn.addEventListener('click', async () => {
    if (!startDate) return;
    const dates = mode === 'single' ? [startDate] : getDatesInRange(startDate, endDate);
    try {
        const response = await fetch('/api/authapi/saveleaves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dates })
        });
        if (response.ok) {
            await fetchSavedDates(); // refresh saved dates
            renderRightCalendar();
            startDate = null;
            endDate = null;
            selected.textContent = 'Dates saved successfully';
        }
    } catch (error) {
        console.error('Error saving dates:', error);
    }
});

editBtn.addEventListener('click', async () => {
    if (!savedDates.length) return;
    try {
        const response = await fetch('/api/authapi/deleteleaves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dates: savedDates })
        });
        if (response.ok) {
            savedDates = [];
            renderRightCalendar();
            selected.textContent = 'Edit mode: select new dates';
        }
    } catch (error) {
        console.error('Error deleting dates:', error);
    }
});

// helper function
function getDatesInRange(start, end) {
    const dates = [];
    const startD = new Date(start);
    const endD = new Date(end);
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        dates.push(d.toDateString());
    }
    return dates;       
}

// initialize
async function init() {
    await fetchLockedDates();
    await fetchSavedDates();
    renderMonthsGrid();
    updateDisplays();
    renderRightCalendar();
}

init();     