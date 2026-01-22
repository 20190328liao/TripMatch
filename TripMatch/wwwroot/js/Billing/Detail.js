//const currentUser = '小蘇';
let appState = {
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

window.onload = () => {
    renderAll();

    // 讀取上次停留的頁籤，如果有紀錄，就自動切換過去
    const lastTab = localStorage.getItem('lastActiveTab');
    if (lastTab) {
        switchTab(lastTab);
    }
};

function renderAll() {
    // 載入支出資料
    if (window.dbExpenses) {
        appState.expenses = window.dbExpenses;
    }

    // 載入個人預算，如果後端有傳預算來，就覆蓋掉預設值
    if (window.currentUser && window.currentUser.budget > 0) {
        appState.budget = window.currentUser.budget;
    } else {
        appState.budget = 0; // 可設一個預設值，例如 3000
    }

    // 渲染各個區塊
    //renderGroupTab();
    renderPersonalTab();
    renderBalanceTab();
    updateTotalHeader();
}

function switchTab(tabName) {
    //  UI 切換邏輯 
    document.querySelectorAll('.content-area').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    // 加上簡單防呆，避免找不到元素報錯
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');

    const btnIndex = tabName === 'group' ? 0 : tabName === 'personal' ? 1 : 2;
    const btns = document.querySelectorAll('.tab-btn');
    if (btns[btnIndex]) btns[btnIndex].classList.add('active');

    // 把現在的分頁名稱存到瀏覽器記憶體
    localStorage.setItem('lastActiveTab', tabName);
}

function renderGroupTab() {
    const container = document.getElementById('group-content');
    container.innerHTML = '';
    const groups = {};
    appState.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 過濾掉 '轉帳/結清'，不顯示在群組花費
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

//function renderPersonalTab() {
//    let myTotal = 0;
//    const personalList = document.getElementById('personal-list');
//    personalList.innerHTML = '';

//    appState.expenses.forEach(ex => {
//        if (ex.cat === '轉帳/結清') return;
//        const myShare = ex.parts[currentUser] || 0;
//        if (myShare > 0) {
//            myTotal += myShare;
//            personalList.innerHTML += `
//                        <div class="expense-item">
//                            <div class="exp-details">
//                                <span class="exp-name">${ex.name}</span>
//                                <span class="exp-sub">總額 $${ex.total}</span>
//                            </div>
//                            <div class="exp-amount" style="color:var(--text-dark);">
//                                -$${myShare.toFixed(0)}
//                            </div>
//                        </div>
//                    `;
//        }
//    });

//    const percent = Math.min((myTotal / appState.budget) * 100, 100);
//    document.getElementById('budget-bar').style.width = `${percent}%`;
//    document.getElementById('budget-bar').style.backgroundColor = percent > 90 ? '#ff5252' : 'var(--primary-mint)';
//    document.getElementById('budget-text').innerHTML = `<span style="color:var(--dark-mint)">$${myTotal.toFixed(0)}</span> <span style="color:#94a3b8; font-size:14px; font-weight:normal;">/ $${appState.budget}</span>`;
//}

function renderPersonalTab() {
    let myTotal = 0;
    const personalList = document.getElementById('personal-list');
    if (!personalList) return; // 防呆檢查

    personalList.innerHTML = '';

    // 1. 取得當前登入者的 ID (轉成字串，因為 JSON 的 Key 是字串)
    // 如果沒有 currentUser (例如訪客)，就預設空字串
    const myId = window.currentUser ? window.currentUser.id.toString() : "";

    appState.expenses.forEach(ex => {
        if (ex.cat === '轉帳/結清') return;

        // 2. 用 ID 去查分攤金額
        const myShare = ex.parts[myId] || 0;

        if (myShare > 0) {
            myTotal += myShare;
            personalList.innerHTML += `
                <div class="expense-item">
                    <div class="exp-details">
                        <span class="exp-name">${ex.name}</span>
                        <span class="exp-sub">總額 $${ex.total.toLocaleString()}</span>
                    </div>
                    <div class="exp-amount" style="color:var(--text-dark);">
                        -$${myShare.toFixed(0)}
                    </div>
                </div>
            `;
        }
    });

    // 3. 更新預算條顯示 (這就是您原本問的那段邏輯，這裡寫得更嚴謹)
    const budget = appState.budget || 3000; // 如果沒設定預算，預設 3000
    const percent = Math.min((myTotal / budget) * 100, 100);

    // 安全地更新 DOM
    const bar = document.getElementById('budget-bar');
    if (bar) {
        bar.style.width = `${percent}%`;
        bar.style.backgroundColor = percent > 90 ? '#ff5252' : 'var(--primary-mint)';
    }

    const txt = document.getElementById('budget-text');
    if (txt) {
        txt.innerHTML = `<span style="color:var(--dark-mint)">$${myTotal.toFixed(0)}</span> <span style="color:#94a3b8; font-size:14px; font-weight:normal;">/ $${budget}</span>`;
    }
}

function calculateDebts() {
    let balances = {};

    // 初始化餘額
    if (window.dbMembers) {
        window.dbMembers.forEach(m => balances[m.id] = 0);
    }

    // 只計算「實際消費」，完全忽略還款紀錄
    appState.expenses.forEach(ex => {
        // 絕對要過濾掉 '轉帳/結清' 類別，確保只算消費債務
        if (ex.cat === '轉帳/結清') return;

        // 計算誰幫誰付了錢
        for (let p in ex.payer) { balances[p] = (balances[p] || 0) + ex.payer[p]; }
        for (let m in ex.parts) { balances[m] = (balances[m] || 0) - ex.parts[m]; }
    });

    // 找出債權人與債務人並配對
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

    // 這裡回傳的是「完全還沒扣除還款」的原始債務建議
    return transactions;
}

// 用 ID 查名字的小幫手
function getMemberName(id) {
    if (!window.dbMembers) return id;
    const m = window.dbMembers.find(x => x.id == id);
    return m ? m.name : "未知成員";
}
function renderBalanceTab() {
    const debtContainer = document.getElementById('balance-list');
    const settledContainer = document.getElementById('settled-list');

    // 1. 取得「原始債務」
    const debts = calculateDebts();
    // 2. 取得「還款紀錄」 (從 Controller 傳來的 window.dbSettlements)
    const settlements = window.dbSettlements || [];

    if (debts.length === 0) {
        debtContainer.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">目前無待結清項目</div>';
    } else {
        debtContainer.innerHTML = debts.map(d => {
            const fromName = getMemberName(d.from);
            const toName = getMemberName(d.to);

            // 計算這個債務組合 (A -> B) 已經還了多少錢
            // 篩選條件：還款人是 A (d.from) 且 收款人是 B (d.to)
            const paidAmount = settlements
                .filter(s => s.payerId == d.from && s.payeeId == d.to)
                .reduce((sum, s) => sum + s.amount, 0);

            // 判斷狀態
            const isFullyPaid = paidAmount >= d.amount - 1; // 容許 1 元誤差
            const remaining = d.amount - paidAmount;

            // 根據狀態決定顯示樣式
            if (isFullyPaid) {
                // === 狀態 A：已結清 (顯示綠色，不可點擊) ===
                return `
                    <div class="debt-card" style="border-left: 4px solid var(--primary-mint); opacity: 0.8; background-color: #f0fdf4;">
                        <div class="debt-info">
                            <span style="text-decoration: line-through; color: #888;">
                                ${fromName} <i class="fa-solid fa-arrow-right arrow-icon"></i> ${toName}
                            </span>
                            <span style="margin-left:10px; color:var(--primary-mint); font-weight:bold; font-size:12px;">
                                <i class="fa-solid fa-check"></i> 已還款
                            </span>
                        </div>
                        <div class="debt-amount" style="color: #888;">
                            NT$${Math.round(d.amount)}
                        </div>
                    </div>
                `;
            } else {
                // === 狀態 B：未結清 / 部分結清 (顯示紅色，可點擊) ===
                // 如果有部分還款，顯示剩餘金額
                const subText = paidAmount > 0 ? `<br><span style="font-size:12px; color:#666;">(已還 $${Math.round(paidAmount)})</span>` : '';

                return `
                    <div class="debt-card" onclick="openSettleModal('${d.from}', '${d.to}', ${remaining})" style="cursor:pointer;">
                        <div class="debt-info">
                            ${fromName} <i class="fa-solid fa-arrow-right arrow-icon"></i> ${toName}
                            ${paidAmount > 0 ? '<span style="font-size:12px; color:#f59e0b; margin-left:5px;">(部分還款)</span>' : ''}
                        </div>
                        <div class="debt-amount">
                            NT$${Math.round(remaining)}
                        </div>
                    </div>
                `;
            }
        }).join('');
    }

    // 顯示詳細還款紀錄的區塊，可以查閱每一筆還款的時間點
    if (settlements.length === 0) {
        settledContainer.innerHTML = '<div style="text-align:center; color:#ccc; font-size:13px;">尚無還款紀錄</div>';
    } else {
        // 按 ID 倒序排列 (最新的在上面)
        const sortedSettlements = [...settlements].sort((a, b) => b.id - a.id);

        settledContainer.innerHTML = sortedSettlements.map(item => {
            const payerName = getMemberName(item.payerId);
            const receiverName = getMemberName(item.payeeId);

            return `
                <div class="settled-card" onclick="openUndoSettleModal(${item.id})">
                    <div class="settled-info">
                        ${payerName} <i class="fa-solid fa-check" style="color:var(--dark-mint);"></i> ${receiverName}
                        <span class="settled-badge">還款紀錄</span>
                    </div>
                    <div class="settled-amount">
                        NT$${Math.round(item.amount)}
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

    // 取得資料
    const { from, to, amount } = appState.pendingSettle; // 這裡的 from/to 都是 ID

    // 取得 TripId
    const urlParams = new URLSearchParams(window.location.search);
    const tripId = urlParams.get('id');

    // 準備表單
    const formData = new FormData();
    formData.append('tripId', tripId);
    formData.append('payerId', from); // 還錢的人
    formData.append('payeeId', to);   // 收錢的人
    formData.append('amount', amount);

    // 發送請求給後端
    fetch('/Home/CreateSettlement', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                closeModal('settleModal');
                location.reload();
            } else {
                alert("還款失敗：" + data.message);
            }
        })
        .catch(err => alert("系統錯誤"));
}

function openUndoSettleModal(id) {
    appState.pendingUndoId = id;
    const modal = document.getElementById('undoSettleModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function confirmUndoSettle() {
    // 防呆檢查
    if (!appState.pendingUndoId) return;

    // 呼叫後端 API 刪除資料庫紀錄
    fetch('/Billing/DeleteSettlement?id=' + appState.pendingUndoId, {
        method: 'POST'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // 成功後關閉視窗
                closeModal('undoSettleModal');
                // 重新整理頁面，讓還款紀錄消失，債務金額恢復
                location.reload();
            } else {
                alert("取消失敗：" + (data.message || "未知錯誤"));
            }
        })
        .catch(err => {
            console.error(err);
            alert("系統發生錯誤");
        });
}

function updateTotalHeader() {
    const total = appState.expenses.filter(ex => ex.cat !== '轉帳/結清').reduce((sum, item) => sum + item.total, 0);
    document.getElementById('header-total').innerText = total.toLocaleString();
}

// 1. 刪除功能 (連接資料庫)
function deleteExpense(id) {
    if (!confirm("確定要刪除這筆支出嗎？（此操作無法復原）")) return;

    // 發送 POST 請求給後端
    fetch('/Billing/DeleteExpense?id=' + id, { method: 'POST' })
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

    // 收集付款人資料 (payers)
    let payers = {};
    document.querySelectorAll('.pay-amt').forEach(input => {
        const val = Number(input.value);
        // 只有金額 > 0 且有被勾選才算
        if (val > 0 && input.closest('.checkbox-row').querySelector('.pay-check').checked) {
            payers[input.dataset.user] = val;
        }
    });

    // 收集分攤人資料 (parts)
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
    fetch('/Billing/SaveExpense', {
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

        // 智慧判斷預設日期
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
    // 1. 跳出輸入框
    const oldBudget = appState.budget || 0;
    const input = prompt("請輸入新的預算金額：", oldBudget);

    // 驗證輸入
    if (input === null) return; // 按取消
    const newBudget = Number(input);
    if (isNaN(newBudget) || newBudget < 0) { alert("請輸入有效的數字"); return; }

    // 2. 抓取 TripId
    const urlParams = new URLSearchParams(window.location.search);
    const tripId = urlParams.get('id');

    // 3. 呼叫後端存檔
    const formData = new FormData();
    formData.append('tripId', tripId);
    formData.append('newBudget', newBudget);

    fetch('/Home/UpdateBudget', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // 更新成功，修改前端顯示
                appState.budget = newBudget;

                // 同步更新 window.currentUser 避免切換時跑掉
                if (window.currentUser) window.currentUser.budget = newBudget;

                renderPersonalTab(); // 重畫進度條
                // alert("預算已更新！"); //這行看你想不想跳通知
            } else {
                alert("更新失敗：" + data.message);
            }
        })
        .catch(err => alert("系統錯誤"));
}