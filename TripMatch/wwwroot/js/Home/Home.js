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
    const name = window.currentUserName || '使用者';

    if (isLoggedIn) {
        // 更新首頁內容
        if (statusText) {
            statusText.innerText = "歡迎您，" + name + " 用戶";
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
                        <a href="#"><i class="fa-regular fa-calendar-check"></i> 個人行事曆</a>
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

// 更新登入狀態 UI 的可重用函式（歡迎文字）
function updateAuthUi() {
  const isAuth = (String(window.isAuthenticated) === 'true') || window.isAuthenticated === true;
  const name = window.currentUserName || '';
  const statusEl = document.getElementById('loginStatus');
  const mainBtn = document.getElementById('mainActionButton');

  if (statusEl) {
    statusEl.innerText = isAuth ? ('歡迎您，' + name + ' 用戶') : '未登入';
    statusEl.style.color = isAuth ? 'var(--btn-dark)' : 'white';
  }

  if (mainBtn) {
    if (isAuth) {
      mainBtn.innerText = '下一步 (開始規劃)';
      // optional: adjust href if server rendered login link
      if (mainBtn.getAttribute('href') && mainBtn.getAttribute('href').includes('/Auth/Login')) {
        mainBtn.setAttribute('href', '/Match/Index');
      }
    } else {
      mainBtn.innerText = '請先登入';
    }
  }
}

// 在 DOM ready 時執行一次
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateAuthUi, { once: true });
} else {
  updateAuthUi();
}

// 對外暴露，登入後若不重新整理可呼叫此函式同步 UI
window.updateAuthUi = updateAuthUi;

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


/* ==========================================
   1. 吉祥物 Canvas 動畫函數定義
   ========================================== */
function initMascotAnimation() {
    const canvas = document.getElementById('mascotCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // 設定互動游標
    canvas.style.cursor = 'pointer';

    const spriteSheet = new Image();
    // ★ 請確認您的新圖片檔名與路徑
    spriteSheet.src = "/img/animate.png";

    // === 參數設定 ===
    const cols = 9;             // 總共有 9 個動作
    const rows = 1;             // 直向 1 列
    const totalFrames = 9;      // 總幀數

    // ★ 精準裁切設定
    const usePreciseWidth = true;
    const logicalWidthRatio = 200 / 1800; // 單格 200mm / 總寬 1800mm (修正為 1800 以符合您的圖片)

    // 動畫顯示設定
    const animationSpeed = 30; // 速度 (數字越大越慢)
    const maxDisplayHeight = 250;

    let spriteWidth = 0;
    let spriteHeight = 0;
    let currentFrame = 0;
    let frameDrawn = 0;
    let isPaused = false;
    let animationId;

    // 點擊切換 暫停/播放
    canvas.addEventListener('click', function () {
        isPaused = !isPaused;
    });

    spriteSheet.onload = function () {
        // 計算單格尺寸
        if (usePreciseWidth) {
            spriteWidth = spriteSheet.width * logicalWidthRatio;
        } else {
            spriteWidth = spriteSheet.width / cols;
        }

        spriteHeight = spriteSheet.height / rows;
        animate();
    };

    spriteSheet.onerror = function () {
        console.error("找不到圖片，請確認路徑：/img/animate.png");
    };

    function animate() {
        // 清除畫布
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 計算當前幀
        let position = currentFrame % totalFrames;

        // 計算裁切 X 座標
        let srcX = position * spriteWidth;
        let srcY = 0;

        // === 縮放與置中邏輯 ===
        const scaleRatio = maxDisplayHeight / spriteHeight;
        const displayWidth = spriteWidth * scaleRatio;
        const displayHeight = maxDisplayHeight;

        // 計算置中座標 (在 Canvas 中置中)
        const dx = (canvas.width - displayWidth) / 2;
        const dy = (canvas.height - displayHeight) / 2;

        // 繪製圖片
        ctx.drawImage(
            spriteSheet,
            srcX, srcY, spriteWidth, spriteHeight,
            dx, dy, displayWidth, displayHeight
        );

        // 更新下一幀
        if (!isPaused) {
            frameDrawn++;
            if (frameDrawn >= animationSpeed) {
                currentFrame++;
                frameDrawn = 0;
            }
        }

        animationId = requestAnimationFrame(animate);
    }
}

/* ==========================================
   2. 主程式初始化 (合併執行)
   ========================================== */
document.addEventListener("DOMContentLoaded", function () {

    // --- 執行 A: 吉祥物動畫 ---
    initMascotAnimation();

    // --- 執行 B: 飛機卷軸動畫 ---
    const plane = document.getElementById('airplane');
    const trigger = document.getElementById('plane-trigger');


    if (plane && trigger) {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.5 // 當區塊出現一半時觸發
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // 進入視窗：起飛
                    plane.classList.add('take-off');
                } else {
                    // 離開視窗：重置 (下次捲動會再飛一次)
                    plane.classList.remove('take-off');
                }
            });
        }, observerOptions);

        observer.observe(trigger);
    }
});