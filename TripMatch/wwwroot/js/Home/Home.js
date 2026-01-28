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
   1. 吉祥物 Canvas 動畫函數定義 (9格動作 + 原地置中 + 隨機泡泡)
   ========================================== */
function initMascotAnimation() {
    const canvas = document.getElementById('mascotCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const spriteSheet = new Image();
    spriteSheet.src = "/img/animate.png";

    // === 參數設定 ===
    const cols = 9;            // 總寬 1800 / 每格 200 = 9 格
    const totalFrames = 9;
    const animationSpeed = 30;
    const maxDisplayHeight = 350; // 設定高度為 350

    let spriteWidth = 0;
    let spriteHeight = 0;
    let currentFrame = 0;
    let frameDrawn = 0;
    let isPaused = false;
    let firstRoundCompleted = false; // 追蹤第一輪是否完成

    // 隨機景點清單 (Place ID)
    const verifiedPlaceIds = [
        "ChIJ_TooXM3gAGARQR6hXH3QAQ8", // 大阪城
        "ChIJdePJiBvnAGAR3Brg9OzvKO0", // 
        "ChIJpehwXdLgAGARwNLCvUGv5aY", // 
        "ChIJTdPOeOPmAGAR_63Ex_WTubw"  //隨機大阪景點
    ];

    function showSpotBubble() {
        const bubble = document.getElementById('spotBubble');
        const link = document.getElementById('bubbleLink');

        if (bubble && link) {
            try {
                // 隨機挑選 ID
                const randomIndex = Math.floor(Math.random() * verifiedPlaceIds.length);
                const randomId = verifiedPlaceIds[randomIndex];

                // 修正點：請檢查您的 Controller 名稱。如果是 SpotController，路徑應為 /Spot/Details 或 /Spot
                // 如果您的路由設定是直接導向單一頁面，請確認 Action 名稱
                link.href = `${window.location.origin}/Spot?placeId=${randomId}`;

                bubble.style.display = 'block';
            } catch (error) {
                // 保底方案：若出錯則導向景點首頁
                link.href = `${window.location.origin}/Spot/Index`;
                bubble.style.display = 'block';
            }
        }
    }

    // 點擊暫停功能
    canvas.addEventListener('click', (e) => {
        e.stopPropagation();
        isPaused = !isPaused;
    });

    spriteSheet.onload = function () {
        spriteWidth = spriteSheet.width / cols;
        spriteHeight = spriteSheet.height;
        resizeCanvas();
        animate();
    };

    // 同步畫布解析度
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    window.addEventListener('resize', resizeCanvas);

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 檢查是否跑完一輪：當 currentFrame 達到總幀數
        if (!firstRoundCompleted && currentFrame >= totalFrames) {
            firstRoundCompleted = true;
            showSpotBubble();
        }

        let position = currentFrame % totalFrames;
        let srcX = position * spriteWidth;

        // --- 比例與置中計算 ---
        let targetHeight = maxDisplayHeight;
        if (canvas.height < targetHeight) {
            targetHeight = canvas.height;
        }

        const scaleRatio = targetHeight / spriteHeight;
        const finalWidth = spriteWidth * scaleRatio;
        const finalHeight = targetHeight;

        // 水平置中
        const dx = (canvas.width - finalWidth) / 2;
        // 垂直靠底
        const dy = canvas.height - finalHeight;

        ctx.drawImage(
            spriteSheet,
            srcX, 0, spriteWidth, spriteHeight,
            dx, dy, finalWidth, finalHeight
        );

        if (!isPaused) {
            frameDrawn++;
            if (frameDrawn >= animationSpeed) {
                currentFrame++;
                frameDrawn = 0;
            }
        }
        requestAnimationFrame(animate);
    }
}
/* ==========================================
   2. 主程式初始化 (合併執行)
   ========================================== */
document.addEventListener("DOMContentLoaded", function () {

    // --- 執行 A: 吉祥物動畫 ---
    initMascotAnimation();

    // --- 執行 B: 飛機卷軸動畫 (這就是您原本被移除的部分) ---
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
                    // 如果只想要飛一次，可以把下面這行註解掉
                    plane.classList.remove('take-off');
                }
            });
        }, observerOptions);

        observer.observe(trigger);
    }
});

