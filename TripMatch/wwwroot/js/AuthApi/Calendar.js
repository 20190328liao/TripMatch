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

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

let today = new Date();
let selectedYear = today.getFullYear();
let selectedMonth = today.getMonth();

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
        cell.textContent = d;
        cell.dataset.date = cur.toDateString();
        cell.addEventListener('click', (e) => {
            selected.textContent = `Selected Date : ${e.target.dataset.date}`;
        });

        // highlight today's date
        if (cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth() && cur.getDate() === today.getDate()) {
            cell.classList.add('current-date');
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

// initialize
renderMonthsGrid();
updateDisplays();
renderRightCalendar();