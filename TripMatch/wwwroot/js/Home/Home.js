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
    const mainBtn = document.getElementById('mainActionButton');
    if (mainBtn) {
        mainBtn.style.display = (mode === 'match') ? 'none' : 'block';
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

// 檢查加入行程的輸入框 (控制按鈕顏色變化)
function checkJoinInput() {
    const val = document.getElementById('joinCodeInput').value;
    const btn = document.getElementById('btnJoinTrip');
    if (btn) {
        // 當邀請碼長度大於等於 4 時啟用按鈕視覺效果
        if (val.trim().length >= 4) {
            btn.classList.add('ready');
        } else {
            btn.classList.remove('ready');
        }
    }
}

// 跳轉-加入團隊
function joinTrip() {
    const code = document.getElementById('joinCodeInput').value.trim();
    if (!code) {
        alert("請輸入邀請碼");
        return;
    }
    window.location.href = `/Match/Join/${encodeURIComponent(code)}`;
}

// 跳轉-建立新團
function createTrip() {
    window.location.href = '/Match/Create';
}