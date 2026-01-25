(async function () {
    'use strict';

    // 定義路由 (若 window.Routes 未定義則使用預設值)
    const ROUTES = window.Routes && window.Routes.AuthApi ? window.Routes.AuthApi : {
        GetBackupLookupResult: '/api/auth/GetBackupLookupResult',
        CheckDbStatus: '/api/auth/CheckDbStatus',
        CheckEmailStatus: '/api/auth/CheckEmailStatus',
        SendConfirmation: '/api/auth/SendConfirmation',
        Login: '/Auth/Login',           // [新增] 預設登入頁
        ForgotEmail: '/Auth/ForgotEmail', // [新增] 忘記帳號頁
        Register: '/Auth/Register'      // [新增] 註冊頁
    };

    function qs(sel) { return document.querySelector(sel); }

    // 通用 Fetch 函式
    async function fetchJson(url, opts = {}) {
        try {
            // 加入時間戳避免快取
            const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), Object.assign({ credentials: 'include' }, opts));
            if (!res.ok) return { ok: false, status: res.status, json: null };
            const json = await res.json().catch(() => null);
            return { ok: true, status: res.status, json };
        } catch (ex) {
            console.debug('fetchJson error:', ex);
            return { ok: false, status: 0, json: null };
        }
    }

    // 更新主圖片
    function updateMainImage(isSuccess) {
        const img = qs('.main-img');
        if (!img) return;

        const successSrc = (window.Routes && window.Routes.Img && window.Routes.Img.CheckEmail)
            ? window.Routes.Img.CheckEmail
            : '/img/checkEmailimg.png';
        const failSrc = (window.Routes && window.Routes.Img && window.Routes.Img.CheckEmailFail)
            ? window.Routes.Img.CheckEmailFail
            : '/img/checkEmailimg_2.png';

        const targetBase = isSuccess ? successSrc : failSrc;
        const cacheBuster = '?v=' + Date.now();
        const target = targetBase + cacheBuster;

        img.onerror = null;
        img.src = target;
        img.style.display = '';

        img.onerror = function () {
            console.warn(`checkEmail: image not found -> ${targetBase}`);
            img.style.display = 'none';
        };
    }

    // 更新標題文字
    function updateTitleText(isSuccess, shortText) {
        const title = qs('#displayArea .titleWrap.titleH5');
        if (!title) return;
        if (shortText) title.textContent = shortText;
        title.style.color = isSuccess ? '' : '#FF6B6B';
    }

    // 更新狀態訊息
    function setStatusMessage(msg, isSuccess, detailForConsole, titleShort) {
        const el = qs('#verifyStatus');
        if (el) {
            el.textContent = '';
            el.style.display = 'none';
        }

        updateMainImage(!!isSuccess);
        updateTitleText(!!isSuccess, titleShort);

        if (detailForConsole) {
            if (isSuccess) console.debug('CheckEmail detail:', detailForConsole);
            else console.warn('CheckEmail detail:', detailForConsole);
        }
    }

    // ★ [核心修正] 啟用下一步按鈕並決定導向網址
    function enableNextButton(email) {
        let btn = qs('#btn_next_step') || qs('#btn_next') || qs('a#btn_next_step');
        if (!btn) return;

        // 移除舊監聽器 (透過複製節點)
        const cloned = btn.cloneNode(true);
        btn.parentNode.replaceChild(cloned, btn);
        btn = cloned;

        // 啟用按鈕樣式
        btn.removeAttribute('disabled');
        btn.classList.remove('btn_Gray');
        btn.classList.add('btn_light');

        // 1. 優先讀取 URL 參數 next (例如 ?next=/Auth/Register)
        const params = new URLSearchParams(window.location.search);
        let targetUrl = params.get('next');

        // 2. 次要讀取 HTML 屬性 data-next-url
        if (!targetUrl) {
            targetUrl = btn.getAttribute('data-next-url');
        }

        // 3. [智慧判斷] 若無指定，根據當前情境決定預設值
        if (!targetUrl) {
            // 如果是「忘記帳號流程」 (網址有 backupVerified 或從 forgot 頁面來)
            if (params.has('backupVerified') || document.referrer.toLowerCase().includes('forgot')) {
                targetUrl = ROUTES.ForgotEmail || '/Auth/ForgotEmail';
            } else {
                // 預設「註冊流程」 -> 驗證後去登入頁
                targetUrl = ROUTES.Login || '/Auth/Login';
            }
        }

        targetUrl = decodeURIComponent(targetUrl);

        // 點擊事件
        btn.addEventListener('click', (e) => {
            e.preventDefault();

            // 若目標是「忘記帳號」，強制加上參數以進入 Step 2
            if (targetUrl.toLowerCase().includes('forgotemail')) {
                if (!targetUrl.includes('goStep=')) {
                    targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'goStep=2';
                }
            }

            // 若目標是「註冊頁」且您希望帶回 email (選填)
            // if (targetUrl.toLowerCase().includes('register') && email) { ... }

            // 通用：補上 Email 參數方便目標頁面預填
            if (email && !targetUrl.includes('email=')) {
                targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'email=' + encodeURIComponent(email);
            }

            console.log('Redirecting to:', targetUrl);
            window.location.href = targetUrl;
        }, { once: true });
    }

    function disableNextButton() {
        const btn = qs('#btn_next_step') || qs('#btn_next') || qs('a#btn_next_step');
        if (!btn) return;
        btn.setAttribute('disabled', 'disabled');
        btn.classList.add('btn_Gray');
    }

    // 檢查 Email 狀態 (註冊前檢查)
    async function checkEmailByAddress(email) {
        if (!email) return { exists: false, verified: false };
        try {
            const res = await fetch(ROUTES.CheckEmailStatus, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(email)
            });
            if (!res.ok) return { exists: null, verified: false };
            const json = await res.json().catch(() => null);
            return { exists: json !== null, verified: !!(json && json.verified), raw: json };
        } catch (ex) {
            console.debug('checkEmailByAddress error', ex);
            return { exists: null, verified: false };
        }
    }

    // 處理重寄驗證信
    async function handleSendVerificationClick() {
        const params = new URLSearchParams(window.location.search);
        const qEmail = params.get('email');
        const input = qs('#email') || qs('#inputEmail') || qs('#input_email') || qs('input[name="email"]');
        const email = (qEmail || (input && input.value) || '').trim();
        if (!email) {
            setStatusMessage('找不到 email', false, '找不到 email，請至註冊頁重新輸入寄驗證信', '找不到 email');
            return;
        }

        try {
            const res = await fetch(ROUTES.SendConfirmation, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(email)
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                if (json && json.verified) {
                    setStatusMessage('恭喜您，信箱驗證成功！', true, json.message || 'server returned verified', '恭喜您，驗證成功');
                    enableNextButton(email);
                    return;
                }
                setStatusMessage(json.message || '驗證信已發送，請檢查信箱', true, json.message, '驗證信已發送');
                // 寫入 LocalStorage 暫存
                try { localStorage.setItem('PendingEmailLocal', JSON.stringify({ email, expiresAt: Date.now() + 30 * 60 * 1000 })); } catch { }
            } else {
                if (json && json.action === 'redirect_login') {
                    setStatusMessage('此信箱已註冊，請登入', false, json.message, '此信箱已註冊');
                    setTimeout(() => { window.location.href = (ROUTES.Login) + '?email=' + encodeURIComponent(email); }, 900);
                    return;
                }
                setStatusMessage(json.message || '寄信失敗', false, json.message || '寄信失敗，請稍候再試', '寄信失敗');
            }
        } catch (ex) {
            console.error('SendConfirmation error', ex);
            setStatusMessage('系統忙碌，請稍後再試', false, ex.toString(), '系統忙碌');
        }
    }

    function bindSendButton() {
        const btn = qs('#btn_send_verification') || qs('#btn_send_reset') || qs('#btn_send');
        if (!btn) return;
        try { btn.replaceWith(btn.cloneNode(true)); } catch { }
        const newBtn = qs('#btn_send_verification') || qs('#btn_send_reset') || qs('#btn_send');
        if (!newBtn) return;

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSendVerificationClick();
        });
        newBtn.removeAttribute('disabled');
        newBtn.classList.remove('btn_Gray');
    }

    // 處理「忘記帳號」流程的特殊參數 (backupVerified)
    function handleBackupVerifiedQuery() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('backupVerified')) return false;

        const email = params.get('email') || null;
        setStatusMessage('恭喜您，信箱驗證成功！', true, `backupVerified param present. email=${email}`, '恭喜您，驗證成功');

        // 寫入 Storage 讓 forgotEmail.js 讀取
        try {
            if (email) {
                localStorage.setItem('BackupLookupVerified', JSON.stringify({ email, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }));
            }
        } catch { /* ignore */ }

        enableNextButton(email);
        return true;
    }

    // 主檢查函式：檢查 API 與 DB 狀態
    async function checkStatus() {
        setStatusMessage('正在檢查驗證狀態...', true, '開始 checkStatus', '檢查中');

        // 1. 檢查備援信箱 (Forgot Account Flow)
        const backup = await fetchJson(ROUTES.GetBackupLookupResult);
        if (backup.ok && backup.json) {
            const j = backup.json;
            if (j.found) {
                const accountEmail = j.accountEmail || j.lookupEmail || j.email || null;

                // 寫入 Storage
                try {
                    localStorage.setItem('BackupLookupVerified', JSON.stringify({ email: accountEmail, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }));
                } catch { }

                setStatusMessage('恭喜您，信箱驗證成功！', true, 'GetBackupLookupResult found: ' + JSON.stringify(j), '恭喜您，驗證成功');
                enableNextButton(accountEmail);
                return;
            }
        }

        // 2. 檢查主資料庫狀態 (Registration Flow)
        const db = await fetchJson(ROUTES.CheckDbStatus);
        if (db.ok && db.json) {
            // backupVerified: true 表示備援信箱驗證成功
            if (db.json.backupVerified === true) {
                setStatusMessage('恭喜您，信箱驗證成功！', true, 'CheckDbStatus backupVerified', '恭喜您，驗證成功');
                enableNextButton(db.json.email || null);
                return;
            }

            // verified: true 表示註冊的主信箱驗證成功
            if (db.json.verified) {
                setStatusMessage('恭喜您，信箱驗證成功！', true, 'CheckDbStatus verified', '恭喜您，驗證成功');
                // 註冊流程驗證成功，按鈕會預設導向 Login，或透過 url param 指定
                enableNextButton(db.json.email || null);
                return;
            }
        }

        // 3. 手動檢查 (依賴 URL email 參數或 pending storage)
        const params = new URLSearchParams(window.location.search);
        const explicitEmail = params.get('email') || (function () {
            try {
                const raw = localStorage.getItem('PendingEmailLocal');
                if (!raw) return null;
                const obj = JSON.parse(raw);
                return (obj && obj.email) ? obj.email : null;
            } catch { return null; }
        })();

        if (explicitEmail) {
            const r = await checkEmailByAddress(explicitEmail);
            if (r.exists === true && r.verified === true) {
                setStatusMessage('恭喜您，信箱驗證成功！', true, 'Email check verified', '恭喜您，驗證成功');
                enableNextButton(explicitEmail);
                return;
            }
            if (r.exists === true && r.verified === false) {
                setStatusMessage('此信箱尚未驗證', false, `email ${explicitEmail} exists but not verified`, '尚未驗證');
                bindSendButton();
                disableNextButton();
                return;
            }
            if (r.exists === false) {
                setStatusMessage('此信箱尚未註冊', false, `email ${explicitEmail} not registered`, '尚未註冊');
                bindSendButton();
                disableNextButton();
                return;
            }
        }

        // 4. 預設顯示失敗 (需重新寄信)
        setStatusMessage('驗證失敗', false, '驗證連結已失效或帳號不存在，請重新註冊或重新寄驗證信', '驗證失敗，請重新寄送驗證信，或連繫平台');
        bindSendButton();
        disableNextButton();
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindSendButton();

        // 檢查是否是「忘記帳號流程」帶過來的參數
        const handled = handleBackupVerifiedQuery();

        // 若不是直接驗證成功，則去 Server 檢查最新狀態
        if (!handled) {
            setTimeout(checkStatus, 120);
        }
    });

    // 支援切換分頁後自動檢查 (例如使用者去信箱點完連結回來)
    window.addEventListener('focus', () => setTimeout(checkStatus, 150));

})();