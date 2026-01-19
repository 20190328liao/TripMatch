let isLoggedIn = false;

// 模式切換 (計畫 vs 媒合)
function switchMode(mode) {
    const btnPlan = document.getElementById('btnPlan');
    const btnMatch = document.getElementById('btnMatch');
    const contentPlan = document.getElementById('contentPlan');
    const contentMatch = document.getElementById('contentMatch');
    if (mode === 'plan') {
        btnPlan.classList.add('active'); btnMatch.classList.remove('active');
        contentPlan.classList.add('active'); contentMatch.classList.remove('active');
    } else {
        btnMatch.classList.add('active'); btnPlan.classList.remove('active');
        contentMatch.classList.add('active'); contentPlan.classList.remove('active');
    }
}

// 登入狀態切換 (注意：這裡會操作到 Layout 上的元素 id="navAuth")
function toggleLogin() {
    isLoggedIn = !isLoggedIn;
    const statusText = document.getElementById('loginStatus');
    const actionBtn = document.getElementById('mainActionButton');

    // 這裡是抓取 Layout 上的導覽列 ID，確保 _Layout.cshtml 裡有 id="navAuth"
    const navAuth = document.getElementById('navAuth');

    if (isLoggedIn) {
        // 更新首頁內容
        if (statusText) {
            statusText.innerText = "已登入";
            statusText.style.color = "var(--btn-dark)";
        }
        if (actionBtn) actionBtn.innerText = "下一步 (開始規劃)";

        // 更新 Layout 導覽列 (模擬)
        if (navAuth) {
            navAuth.innerHTML = `
                <div style="position:relative;">
                    <img id="userAvatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" onclick="toggleAvatarMenu(event)" style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid white; cursor: pointer;">
                    <div id="userMenu" class="custom-dropdown-menu">
                        <div class="menu-group-title">會員中心</div>
                        <a href="#"><i class="fa-regular fa-circle-user"></i> 個人資料</a>
                        <a href="#"><i class="fa-regular fa-calendar-check"></i> 媒合行事曆</a>
                        <div class="menu-divider"></div>
                        <div class="menu-group-title">我的行程</div>
                        <a href="#"><i class="fa-solid fa-suitcase"></i> 查看所有行程</a>
                        <a href="#" onclick="toggleLogin()" style="color:#ff5252;"><i class="fa-solid fa-right-from-bracket"></i> 登出</a>
                    </div>
                </div>`;
        }
    } else {
        // 未登入狀態
        if (statusText) {
            statusText.innerText = "未登入";
            statusText.style.color = "white";
        }
        if (actionBtn) actionBtn.innerText = "請先登入";

        if (navAuth) {
            navAuth.innerHTML = `
                <a href="#" class="btn-text" style="text-decoration: none; color: #444; font-size: 15px; margin-right: 15px;">註冊</a>
                <button class="btn-login-nav" onclick="toggleLogin()" style="background-color: var(--primary-mint); padding: 15px 22px; border-radius: 6px; color: white; font-weight: bold; border: none; cursor: pointer;">登入</button>`;
        }
    }
}

// 複製文字
function copyText(id) {
    const input = document.getElementById(id);
    input.select();
    navigator.clipboard.writeText(input.value);
    alert('已成功複製到剪貼簿！');
}

// 隨機生成邀請碼
function generateNewCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'TRIP';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('inviteCode').value = result;
    document.getElementById('inviteLink').value = `https://trip.ai/join?code=${result}`;
}

// 複製並自動填入
function copyAndFill(id) {
    const code = document.getElementById(id).value;
    navigator.clipboard.writeText(code);

    // 自動填入上方的輸入框
    const joinInput = document.getElementById('joinCodeInput');
    if (joinInput) {
        joinInput.value = code;
        checkJoinInput();
    }

    alert(`已複製邀請碼：${code}\n並已自動為您填入「加入行程」輸入框！`);
}

// 檢查加入行程的輸入框
function checkJoinInput() {
    const val = document.getElementById('joinCodeInput').value;
    const btn = document.getElementById('btnJoinTrip');
    if (val.length >= 4) {
        btn.classList.add('ready');
    } else {
        btn.classList.remove('ready');
    }
}

// 加入行程互動
function joinTrip() {
    const code = document.getElementById('joinCodeInput').value;
    if (!isLoggedIn) {
        alert('請先點擊右上角「登入」後再加入行程！');
        return;
    }
    if (code.trim() === "") {
        alert('請輸入有效的邀請碼！');
        return;
    }

    alert(`🎉 加入成功！\n您已進入行程：[ ${code} ]\n現在可以開始與朋友共同規劃時間了！`);
    document.getElementById('joinCodeInput').value = "";
    checkJoinInput();
}

// 主按鈕動作（修正後）
function handleMainAction() {
    const btn = document.getElementById('mainActionButton');
    // 可從按鈕 data-return-url 讀取目標（若有），否則預設導向 Match Index
    const returnUrl = (btn && btn.dataset && btn.dataset.returnUrl) ? btn.dataset.returnUrl : '/Match/Index';

    if (!isLoggedIn) {
        // 引導到登入頁並帶上 returnUrl，登入成功後伺服器/前端會導回 returnUrl
        window.location.href = '/Auth/Login?returnUrl=' + encodeURIComponent(returnUrl);
    } else {
        // 已登入直接前往 Match
        window.location.href = returnUrl;
    }
}