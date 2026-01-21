const currentUser = '小蘇';
let appState = {
    members: ['小蘇', '小一', '小二'],
    budget: 3000,
    splitMode: 'avg',
    editingId: null,
    pendingSettle: null,
    pendingUndoId: null,
    //expenses: [
    //    { id: 1, date: '2026-01-19', name: '安平老街早餐', cat: '食物', total: 200, payer: { '小一': 200 }, parts: { '小蘇': 67, '小一': 67, '小二': 66 } },
    //    { id: 2, date: '2026-01-19', name: '香格里拉飯店', cat: '住宿', total: 2000, payer: { '小蘇': 2000 }, parts: { '小蘇': 666, '小一': 667, '小二': 667 } }
    //]
    expenses: []
};

//window.onload = () => { renderAll(); };

function renderAll() {
    //renderGroupTab();
    renderPersonalTab();
    renderBalanceTab();
    updateTotalHeader();
}

function switchTab(tabName) {
    document.querySelectorAll('.content-area').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    const btnIndex = tabName === 'group' ? 0 : tabName === 'personal' ? 1 : 2;
    document.querySelectorAll('.tab-btn')[btnIndex].classList.add('active');
}

function renderGroupTab() {
    const container = document.getElementById('group-content');
    container.innerHTML = '';
    const groups = {};
    appState.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 修改：過濾掉 '轉帳/結清'，不顯示在群組花費
    const visibleExpenses = appState.expenses.filter(ex => ex.cat !== '轉帳/結清');

    visibleExpenses.forEach(ex => {
        if (!groups[ex.date]) groups[ex.date] = [];
        groups[ex.date].push(ex);
    });

    Object.keys(groups).forEach(date => {
        const dateObj = new Date(date);
        const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        container.innerHTML += `<div class="date-header">${dateStr}</div>`;

        groups[date].forEach(item => {
            let icon = 'fa-utensils';
            if (item.cat === '住宿') icon = 'fa-bed';
            if (item.cat === '交通') icon = 'fa-car';
            if (item.cat === '購物') icon = 'fa-bag-shopping';
            if (item.cat === '娛樂') icon = 'fa-gamepad';

            let payerNames = Object.keys(item.payer);
            let payerText = payerNames.length > 1 ? `${payerNames[0]} 等人` : payerNames[0];

            container.innerHTML += `
                        <div class="expense-item">
                            <div class="cat-icon"><i class="fa-solid ${icon}"></i></div>
                            <div class="exp-details">
                                <span class="exp-name">${item.name}</span>
                                <span class="exp-sub">${payerText} 付款</span>
                            </div>
                            <div class="exp-right">
                                <span class="exp-amount">NT$${item.total}</span>
                                <div class="exp-actions">
                                    <button class="action-icon-btn" onclick="editExpense(${item.id})"><i class="fa-solid fa-pen"></i></button>
                                    <button class="action-icon-btn delete" onclick="deleteExpense(${item.id})"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
        });
    });
    if (visibleExpenses.length === 0) container.innerHTML = '<div style="text-align:center; color:#999; margin-top:50px;">目前沒有支出紀錄<br>點擊右上角 + 記一筆</div>';
}

function renderPersonalTab() {
    let myTotal = 0;
    const personalList = document.getElementById('personal-list');
    personalList.innerHTML = '';

    appState.expenses.forEach(ex => {
        if (ex.cat === '轉帳/結清') return;
        const myShare = ex.parts[currentUser] || 0;
        if (myShare > 0) {
            myTotal += myShare;
            personalList.innerHTML += `
                        <div class="expense-item">
                            <div class="exp-details">
                                <span class="exp-name">${ex.name}</span>
                                <span class="exp-sub">總額 $${ex.total}</span>
                            </div>
                            <div class="exp-amount" style="color:var(--text-dark);">
                                -$${myShare.toFixed(0)}
                            </div>
                        </div>
                    `;
        }
    });

    const percent = Math.min((myTotal / appState.budget) * 100, 100);
    document.getElementById('budget-bar').style.width = `${percent}%`;
    document.getElementById('budget-bar').style.backgroundColor = percent > 90 ? '#ff5252' : 'var(--primary-mint)';
    document.getElementById('budget-text').innerHTML = `<span style="color:var(--dark-mint)">$${myTotal.toFixed(0)}</span> <span style="color:#94a3b8; font-size:14px; font-weight:normal;">/ $${appState.budget}</span>`;
}

function calculateDebts() {
    let balances = {};
    appState.members.forEach(m => balances[m] = 0);
    appState.expenses.forEach(ex => {
        for (let p in ex.payer) { balances[p] += ex.payer[p]; }
        for (let m in ex.parts) { balances[m] -= ex.parts[m]; }
    });

    let debtors = [], creditors = [];
    for (const [member, amount] of Object.entries(balances)) {
        if (amount < -1) debtors.push({ member, amount });
        else if (amount > 1) creditors.push({ member, amount });
    }
    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    let transactions = [], i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        let debtor = debtors[i], creditor = creditors[j];
        let amount = Math.min(Math.abs(debtor.amount), creditor.amount);
        transactions.push({ from: debtor.member, to: creditor.member, amount: amount });
        debtor.amount += amount; creditor.amount -= amount;
        if (Math.abs(debtor.amount) < 1) i++;
        if (creditor.amount < 1) j++;
    }
    return transactions;
}

function renderBalanceTab() {
    const debtContainer = document.getElementById('balance-list');
    const settledContainer = document.getElementById('settled-list');

    const debts = calculateDebts();
    if (debts.length === 0) {
        debtContainer.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">目前無待結清項目</div>';
    } else {
        debtContainer.innerHTML = debts.map(d => `
                    <div class="debt-card" onclick="openSettleModal('${d.from}', '${d.to}', ${d.amount})">
                        <div class="debt-info">
                            ${d.from} <i class="fa-solid fa-arrow-right arrow-icon"></i> ${d.to}
                        </div>
                        <div class="debt-amount">
                            NT$${Math.round(d.amount)}
                        </div>
                    </div>
                `).join('');
    }

    const settledItems = appState.expenses.filter(ex => ex.cat === '轉帳/結清');
    if (settledItems.length === 0) {
        settledContainer.innerHTML = '<div style="text-align:center; color:#ccc; font-size:13px;">尚無結清紀錄</div>';
    } else {
        settledItems.sort((a, b) => b.id - a.id);
        settledContainer.innerHTML = settledItems.map(item => {
            const payer = Object.keys(item.payer)[0];
            const receiver = Object.keys(item.parts)[0];
            return `
                        <div class="settled-card" onclick="openUndoSettleModal(${item.id})">
                            <div class="settled-info">
                                ${payer} <i class="fa-solid fa-check" style="color:var(--dark-mint);"></i> ${receiver}
                                <span class="settled-badge">已結清</span>
                            </div>
                            <div class="settled-amount">
                                NT$${item.total}
                            </div>
                        </div>
                    `;
        }).join('');
    }
}

function openSettleModal(from, to, amount) {
    appState.pendingSettle = { from, to, amount: Math.round(amount) };
    document.getElementById('settle-desc').innerHTML = `<b>${from}</b> 需支付 <b>${to}</b>`;
    document.getElementById('settle-amount').innerText = `NT$${Math.round(amount)}`;
    const modal = document.getElementById('settleModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function confirmSettle() {
    if (!appState.pendingSettle) return;
    const { from, to, amount } = appState.pendingSettle;
    const newExpense = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        name: '結清款項',
        cat: '轉帳/結清',
        total: amount,
        payer: { [from]: amount },
        parts: { [to]: amount }
    };
    appState.expenses.push(newExpense);
    closeModal('settleModal');
    renderAll();
}

function openUndoSettleModal(id) {
    appState.pendingUndoId = id;
    const modal = document.getElementById('undoSettleModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function confirmUndoSettle() {
    if (!appState.pendingUndoId) return;
    appState.expenses = appState.expenses.filter(e => e.id !== appState.pendingUndoId);
    closeModal('undoSettleModal');
    renderAll();
}

function updateTotalHeader() {
    const total = appState.expenses.filter(ex => ex.cat !== '轉帳/結清').reduce((sum, item) => sum + item.total, 0);
    document.getElementById('header-total').innerText = total.toLocaleString();
}

//function deleteExpense(id) {
//    if (confirm("確定要刪除這筆支出嗎？")) {
//        appState.expenses = appState.expenses.filter(e => e.id !== id);
//        renderAll();
//    }
//}

//function editExpense(id) {
//    const item = appState.expenses.find(e => e.id === id);
//    if (!item) return;
//    openExpenseModal(true);
//    appState.editingId = id;
//    document.getElementById('m-date').value = item.date;
//    document.getElementById('m-name').value = item.name;
//    document.getElementById('m-cat').value = item.cat;
//    document.querySelectorAll('.pay-amt').forEach(input => {
//        const user = input.dataset.user;
//        const amt = item.payer[user] || 0;
//        input.value = amt > 0 ? amt : '';
//        input.closest('.checkbox-row').querySelector('.pay-check').checked = (amt > 0);
//    });
//    updatePayTotal();
//    changeSplitMode('custom');
//    document.querySelectorAll('.part-amt').forEach(input => {
//        const user = input.dataset.user;
//        const amt = item.parts[user] || 0;
//        input.value = amt;
//        input.closest('.checkbox-row').querySelector('.part-check').checked = (amt > 0);
//    });
//    updateSplitTotal();
//}

// 1. 刪除功能 (連接資料庫)
function deleteExpense(id) {
    if (!confirm("確定要刪除這筆支出嗎？（此操作無法復原）")) return;

    // 發送 POST 請求給後端
    fetch('/Home/DeleteExpense?id=' + id, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                location.reload(); // 成功後重新整理頁面
            } else {
                alert("刪除失敗：" + (data.message || "未知錯誤"));
            }
        });
}

// 2. 開啟編輯視窗 (接收 HTML 傳來的資料)
function openEditModal(id, title, amount, catId, dateStr) {
    openExpenseModal(true); // 打開模態框 (設定為編輯模式)

    // 設定全域變數，讓儲存時知道現在是編輯哪一筆
    appState.editingId = id;

    // 填入表單資料
    document.getElementById('m-date').value = dateStr;
    document.getElementById('m-name').value = title;
    // 注意：這裡假設您的 CategoryId 是 1~6，對應 select 的 value (例如 value="1" 代表食物)
    // 如果您的 select value 是文字 (例如 "食物")，這裡可能要寫判斷轉換
    document.getElementById('m-cat').selectedIndex = catId - 1;

    // 填寫金額 (暫時簡化：編輯時先不處理分帳細節的顯示，只讓您改總額)
    document.getElementById('pay-total-val').innerText = amount;

    // 為了讓 UI 正常，把金額填入第一位成員的欄位 (這裡您可以再優化)
    const firstInput = document.querySelector('.pay-amt');
    if (firstInput) firstInput.value = amount;
}

function saveExpense() {
    // 1. 取得基本欄位資料
    const date = document.getElementById('m-date').value;
    const name = document.getElementById('m-name').value;
    const totalPay = Number(document.getElementById('pay-total-val').innerText);
    const totalSplit = Number(document.getElementById('split-total-val').innerText);
    const catIndex = document.getElementById('m-cat').value;

    // 2. 基本驗證
    if (!name || totalPay <= 0) { alert('請填寫完整資訊'); return; }
    // 寬容度設為 5 元，避免小數點誤差
    if (Math.abs(totalPay - totalSplit) > 5) { alert('付款總額與分攤總額不符！'); return; }

    // ★★★ 3. 補上這段：收集付款人資料 (payers) ★★★
    let payers = {};
    document.querySelectorAll('.pay-amt').forEach(input => {
        const val = Number(input.value);
        // 只有金額 > 0 且有被勾選才算
        if (val > 0 && input.closest('.checkbox-row').querySelector('.pay-check').checked) {
            payers[input.dataset.user] = val;
        }
    });

    // ★★★ 4. 補上這段：收集分攤人資料 (parts) ★★★
    let parts = {};
    document.querySelectorAll('.part-amt').forEach(input => {
        const val = Number(input.value);
        if (val > 0 && input.closest('.checkbox-row').querySelector('.part-check').checked) {
            parts[input.dataset.user] = val;
        }
    });

    // 5. 準備傳送給後端的資料
    const formData = new FormData();
    if (appState.editingId) formData.append('id', appState.editingId);

    const urlParams = new URLSearchParams(window.location.search);
    const currentTripId = urlParams.get('id');
    formData.append('tripId', currentTripId);

    formData.append('title', name);
    formData.append('amount', totalPay);
    formData.append('date', date);
    formData.append('categoryId', catIndex);

    // ★★★ 現在這裡不會報錯了，因為上面已經定義了 payers 和 parts ★★★
    formData.append('payersJson', JSON.stringify(payers));
    formData.append('partsJson', JSON.stringify(parts));

    // 6. 發送請求
    fetch('/Home/SaveExpense', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                closeModal('expenseModal');
                location.reload();
            } else {
                alert("儲存失敗：" + data.message);
            }
        })
        .catch(err => {
            console.error(err);
            alert("系統發生錯誤");
        });
}

function openExpenseModal(isEdit = false) {
    const modal = document.getElementById('expenseModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    renderAddForm();
    if (isEdit) {
        document.getElementById('modal-title-text').innerText = "編輯支出";
        document.getElementById('modal-submit-btn').innerText = "確認修改";
    } else {
        document.getElementById('modal-title-text').innerText = "新增支出";
        document.getElementById('modal-submit-btn').innerText = "確認新增";
        appState.editingId = null;

        // ★★★ 智慧判斷預設日期 ★★★
        const today = new Date().toISOString().split('T')[0];
        const range = window.tripRange; // 取得剛剛從 C# 傳來的範圍

        // 如果 "今天" 在範圍內，就用今天；否則預設帶入 "旅程開始日"
        if (range && (today < range.start || today > range.end)) {
            document.getElementById('m-date').value = range.start;
        } else {
            document.getElementById('m-date').value = today;
        }

        changeSplitMode('avg');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

//function renderAddForm() {
//    const payerList = document.getElementById('m-payer-list');
//    payerList.innerHTML = appState.members.map(m => `
//                <div class="checkbox-row">
//                    <input type="checkbox" class="pay-check" value="${m}" onchange="updatePayTotal()">
//                    <span>${m}</span>
//                    <input type="number" class="pay-amt form-control" data-user="${m}" placeholder="金額" style="margin-left:10px;" oninput="updatePayTotal()">
//                </div>
//            `).join('');
//    const splitList = document.getElementById('m-split-list');
//    splitList.innerHTML = appState.members.map(m => `
//                <div class="checkbox-row">
//                    <input type="checkbox" class="part-check" checked value="${m}" onchange="handlePartCheck()">
//                    <span>${m}</span>
//                    <input type="number" class="part-amt form-control" data-user="${m}" placeholder="0" style="margin-left:10px;" disabled oninput="updateSplitTotal()">
//                </div>
//            `).join('');
//    document.getElementById('m-name').value = '';
//    document.getElementById('pay-total-val').innerText = '0';
//    document.getElementById('split-total-val').innerText = '0';
//}

// 讀取資料庫傳來的成員
function renderAddForm() {
    const payerList = document.getElementById('m-payer-list');
    const splitList = document.getElementById('m-split-list');

    // 檢查是否有資料
    if (!window.dbMembers || window.dbMembers.length === 0) {
        payerList.innerHTML = '無成員資料';
        return;
    }

    // 1. 產生付款人清單 (使用 dbMembers)
    // 注意：value 改用 m.id (資料庫的 TripMemberId)，顯示用 m.name
    payerList.innerHTML = window.dbMembers.map(m => `
        <div class="checkbox-row">
            <input type="checkbox" class="pay-check" value="${m.id}" onchange="updatePayTotal()">
            <span>${m.name}</span>
            <input type="number" class="pay-amt form-control" data-user="${m.id}" placeholder="金額" style="margin-left:10px;" oninput="updatePayTotal()">
        </div>
    `).join('');

    // 2. 產生分攤人清單
    splitList.innerHTML = window.dbMembers.map(m => `
        <div class="checkbox-row">
            <input type="checkbox" class="part-check" checked value="${m.id}" onchange="handlePartCheck()">
            <span>${m.name}</span>
            <input type="number" class="part-amt form-control" data-user="${m.id}" placeholder="0" style="margin-left:10px;" disabled oninput="updateSplitTotal()">
        </div>
    `).join('');

    // 重置其他欄位
    document.getElementById('m-name').value = '';
    document.getElementById('pay-total-val').innerText = '0';
    document.getElementById('split-total-val').innerText = '0';
}


function updatePayTotal() {
    let total = 0;
    document.querySelectorAll('.pay-amt').forEach(input => {
        const row = input.closest('.checkbox-row');
        const checkbox = row.querySelector('.pay-check');
        const val = Number(input.value);
        if (val > 0 && !checkbox.checked) checkbox.checked = true;
        if (checkbox.checked) total += val;
    });
    document.getElementById('pay-total-val').innerText = total;
    if (appState.splitMode === 'avg') calcAverageSplit();
}

function changeSplitMode(mode) {
    appState.splitMode = mode;
    document.getElementById('mode-avg').classList.toggle('active', mode === 'avg');
    document.getElementById('mode-custom').classList.toggle('active', mode === 'custom');
    document.querySelectorAll('.part-amt').forEach(input => input.disabled = (mode === 'avg'));
    if (mode === 'avg') calcAverageSplit();
}

function handlePartCheck() {
    if (appState.splitMode === 'avg') calcAverageSplit(); else updateSplitTotal();
}

function calcAverageSplit() {
    if (appState.splitMode !== 'avg') return;
    const total = Number(document.getElementById('pay-total-val').innerText);
    const checkedBoxes = document.querySelectorAll('.part-check:checked');
    const count = checkedBoxes.length;
    const avg = count > 0 ? (total / count).toFixed(0) : 0;
    document.querySelectorAll('.part-amt').forEach(inp => inp.value = 0);
    checkedBoxes.forEach(box => {
        box.closest('.checkbox-row').querySelector('.part-amt').value = avg;
    });
    updateSplitTotal();
}

function updateSplitTotal() {
    let total = 0;
    document.querySelectorAll('.part-amt').forEach(input => {
        if (input.closest('.checkbox-row').querySelector('.part-check').checked) {
            total += Number(input.value) || 0;
        }
    });
    document.getElementById('split-total-val').innerText = total;
}

function editMyBudget() {
    const newB = prompt("請輸入新的預算金額：", appState.budget);
    if (newB && !isNaN(newB)) {
        appState.budget = Number(newB);
        renderPersonalTab();
    }
}

//function saveExpense() {
//    const date = document.getElementById('m-date').value;
//    const name = document.getElementById('m-name').value;
//    const totalPay = Number(document.getElementById('pay-total-val').innerText);
//    const totalSplit = Number(document.getElementById('split-total-val').innerText);
//    if (!name || totalPay <= 0) { alert('請填寫完整資訊'); return; }
//    if (Math.abs(totalPay - totalSplit) > 5) { alert('付款總額與分攤總額不符！'); return; }

//    let payers = {};
//    document.querySelectorAll('.pay-amt').forEach(input => {
//        const val = Number(input.value);
//        if (val > 0 && input.closest('.checkbox-row').querySelector('.pay-check').checked) {
//            payers[input.dataset.user] = val;
//        }
//    });

//    let parts = {};
//    document.querySelectorAll('.part-amt').forEach(input => {
//        const val = Number(input.value);
//        if (val > 0 && input.closest('.checkbox-row').querySelector('.part-check').checked) {
//            parts[input.dataset.user] = val;
//        }
//    });

//    const newExpense = {
//        id: appState.editingId ? appState.editingId : Date.now(),
//        date: date,
//        name: name,
//        cat: document.getElementById('m-cat').value,
//        total: totalPay,
//        payer: payers,
//        parts: parts
//    };

//    if (appState.editingId) {
//        const idx = appState.expenses.findIndex(e => e.id === appState.editingId);
//        if (idx !== -1) appState.expenses[idx] = newExpense;
//    } else {
//        appState.expenses.push(newExpense);
//    }

//    closeModal('expenseModal');
//    renderAll();
//    switchTab('group');
//}