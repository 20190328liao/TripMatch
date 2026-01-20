(async function () {
    'use strict';

    const ROUTES = window.Routes && window.Routes.AuthApi ? window.Routes.AuthApi : {
        GetBackupLookupResult: '/api/auth/GetBackupLookupResult',
        CheckDbStatus: '/api/auth/CheckDbStatus',
        CheckEmailStatus: '/api/auth/CheckEmailStatus',
        SendConfirmation: '/api/auth/SendConfirmation'
    };

    function qs(sel) { return document.querySelector(sel); }

    async function fetchJson(url, opts = {}) {
        try {
            const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), Object.assign({ credentials: 'include' }, opts));
            if (!res.ok) return { ok: false, status: res.status, json: null };
            const json = await res.json().catch(() => null);
            return { ok: true, status: res.status, json };
        } catch (ex) {
            console.debug('fetchJson error:', ex);
            return { ok: false, status: 0, json: null };
        }
    }

    function setStatusMessage(msg, isSuccess) {
        const el = qs('#verifyStatus');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = isSuccess ? '#28a745' : '#dc3545';
    }

    function enableNextButton(email) {
        const btn = qs('#btn_next_step') || qs('#btn_next') || qs('a#btn_next_step');
        if (!btn) return;
        // replace to remove prior handlers, then re-query
        const cloned = btn.cloneNode(true);
        btn.parentNode.replaceChild(cloned, btn);

        const newBtn = qs('#btn_next_step') || qs('#btn_next') || qs('a#btn_next_step');
        if (!newBtn) return;

        newBtn.removeAttribute('disabled');
        newBtn.classList.remove('btn_Gray');
        newBtn.classList.add('btn_light');

        const signupUrl = (window.Routes && window.Routes.Auth && window.Routes.Auth.Signup) ? window.Routes.Auth.Signup : '/Auth/Signup';
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            let url = signupUrl;
            if (email) url += '?email=' + encodeURIComponent(email);
            window.location.href = url;
        }, { once: true });
    }

    function disableNextButton() {
        const btn = qs('#btn_next_step') || qs('#btn_next') || qs('a#btn_next_step');
        if (!btn) return;
        btn.setAttribute('disabled', 'disabled');
        btn.classList.add('btn_Gray');
    }

    // 用 email 查 DB 的 EmailConfirmed（POST body: "email" 字串）
    async function checkEmailByAddress(email) {
        if (!email) return { exists: false, verified: false };
        try {
            const res = await fetch(ROUTES.CheckEmailStatus || '/api/auth/CheckEmailStatus', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(email)
            });
            if (!res.ok) return { exists: null, verified: false };
            const json = await res.json().catch(() => null);
            // 現行 CheckEmailStatus 回傳 { verified: true/false }
            return { exists: json !== null, verified: !!(json && json.verified), raw: json };
        } catch (ex) {
            console.debug('checkEmailByAddress error', ex);
            return { exists: null, verified: false };
        }
    }

    // 寄驗證信（若頁面有可讀的 email）
    async function handleSendVerificationClick() {
        const params = new URLSearchParams(window.location.search);
        const qEmail = params.get('email');
        const input = qs('#email') || qs('#inputEmail') || qs('#input_email') || qs('input[name="email"]');
        const email = (qEmail || (input && input.value) || '').trim();
        if (!email) {
            setStatusMessage('找不到 email，請至註冊頁重新輸入寄驗證信', false);
            return;
        }

        try {
            const res = await fetch(ROUTES.SendConfirmation || '/api/auth/SendConfirmation', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(email)
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                if (json && json.verified) {
                    setStatusMessage('此信箱已驗證，請直接設定密碼或登入', true);
                    enableNextButton(email);
                    return;
                }
                setStatusMessage(json.message || '驗證信已發送，請檢查信箱', true);
                try { localStorage.setItem('PendingEmailLocal', JSON.stringify({ email, expiresAt: Date.now() + 30 * 60 * 1000 })); } catch { }
            } else {
                // 處理後端回傳 action（例如 redirect_login）
                if (json && json.action === 'redirect_login') {
                    setStatusMessage(json.message || '此信箱已註冊，請登入', false);
                    setTimeout(() => { window.location.href = (window.Routes && window.Routes.Auth && window.Routes.Auth.Login) ? window.Routes.Auth.Login + '?email=' + encodeURIComponent(email) : '/Auth/Login?email=' + encodeURIComponent(email); }, 900);
                    return;
                }
                setStatusMessage(json.message || '寄信失敗，請稍候再試', false);
            }
        } catch (ex) {
            console.error('SendConfirmation error', ex);
            setStatusMessage('系統忙碌，請稍後再試', false);
        }
    }

    // 綁定寄信按鈕（若頁面提供）
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
        // 顯示並啟用按鈕（讓使用者可手動重寄）
        newBtn.removeAttribute('disabled');
        newBtn.classList.remove('btn_Gray');
    }

    // 主檢查流程：備援 lookup -> pending cookie -> direct email check（若有）
    async function checkStatus() {
        setStatusMessage('正在檢查驗證狀態...', true);

        // 1) 備援查詢（如果此頁為備援驗證流程）
        const backup = await fetchJson(ROUTES.GetBackupLookupResult || '/api/auth/GetBackupLookupResult');
        if (backup.ok && backup.json) {
            const j = backup.json;
            if (j.found) {
                const accountEmail = j.accountEmail || j.lookupEmail || j.email || null;
                setStatusMessage('驗證成功，找到帳號：' + (accountEmail || ''), true);
                enableNextButton(accountEmail);
                return;
            }
        }

        // 2) 透過 PendingEmail cookie 檢查（後端使用 cookie 判斷）
        const db = await fetchJson(ROUTES.CheckDbStatus || '/api/auth/CheckDbStatus');
        if (db.ok && db.json) {
            if (db.json.verified) {
                setStatusMessage('驗證成功，請按下一步繼續', true);
                enableNextButton(db.json.email || null);
                return;
            }
            // 如果沒驗證，再嘗試以顯式 email 檢查（querystring or local fallback）
        }

        // 3) 若頁面可取得 email（querystring 或 localStorage），以 email 直接向 DB 查 EmailConfirmed
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
            // r.exists === null 表示 API call error； === false 表示查無帳號； === true exist
            if (r.exists === true && r.verified === true) {
                setStatusMessage('驗證成功，系統已確認 email 已驗證，請按下一步', true);
                enableNextButton(explicitEmail);
                return;
            }
            // 若 r.exists true && verified false => 可以重寄驗證信
            if (r.exists === true && r.verified === false) {
                setStatusMessage('此信箱尚未驗證，您可以重新寄驗證信', false);
                bindSendButton(); // 顯示與綁定寄信按鈕
                disableNextButton();
                return;
            }
            // 如果查無帳號或 API 錯誤
            if (r.exists === false) {
                setStatusMessage('此信箱尚未註冊，請重新註冊或先寄驗證信', false);
                bindSendButton();
                disableNextButton();
                return;
            }
            if (r.exists === null) {
                // API 錯誤 fallback
                setStatusMessage('伺服器無回應，請稍後再試', false);
                bindSendButton();
                disableNextButton();
                return;
            }
        }

        // 4) 皆無法判定時：允許使用者手動重寄或回註冊
        setStatusMessage('驗證連結已失效或帳號不存在，請重新註冊或重新寄驗證信', false);
        bindSendButton();
        disableNextButton();
    }

    // init
    document.addEventListener('DOMContentLoaded', function () {
        bindSendButton();
        setTimeout(checkStatus, 120);
    });

    // 當使用者回到分頁時重新檢查
    window.addEventListener('focus', () => setTimeout(checkStatus, 150));

})();