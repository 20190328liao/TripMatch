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

    // 更新主圖（若檔案不存在，隱藏並在 console.warn）
    function updateMainImage(isSuccess) {
        const img = qs('.main-img');
        if (!img) return;

        const successSrc = (window.Routes && window.Routes.Img && window.Routes.Img.CheckEmail)
            ? window.Routes.Img.CheckEmail
            : '/img/checkEmailimg.png';
        const failSrc = (window.Routes && window.Routes.Img && window.Routes.Img.CheckEmailFail)
            ? window.Routes.Img.CheckEmailFail
            : '/img/checkEmailimg_2.png';

        // 避免快取造成錯誤顯示，附加版本號（僅前端測試用）
        const targetBase = isSuccess ? successSrc : failSrc;
        const cacheBuster = '?v=' + Date.now();
        const target = targetBase + cacheBuster;

        // debug：印出實際將要設定的圖（有助於排查是路徑或邏輯問題）
        console.debug('checkEmail: set main image ->', { isSuccess, targetBase, target });

        // 先移除前一次的 onerror，然後設定 src
        img.onerror = null;
        img.src = target;
        img.style.display = ''; // 顯示圖片區域

        // 若圖片無法載入，隱藏 element 並在 console 顯示詳細資訊
        img.onerror = function () {
            console.warn(`checkEmail: image not found -> ${targetBase} (with cache-buster ${cacheBuster})`);
            img.style.display = 'none';
        };
    }

    // 更新標題（server 預設的 titleWrap 也會被覆寫）
    function updateTitleText(isSuccess, shortText) {
        const title = qs('#displayArea .titleWrap.titleH5');
        if (!title) return;
        if (shortText) title.textContent = shortText;
        title.style.color = isSuccess ? '' : '#FF6B6B';
    }

    // 簡潔的 UI 顯示，詳細內容寫到 console；同時會同步更新主圖與標題
    function setStatusMessage(msg, isSuccess, detailForConsole, titleShort) {
        const el = qs('#verifyStatus');

        // 始終隱藏小字（不在頁面顯示），避免重複或冗長訊息
        if (el) {
            el.textContent = '';
            el.style.display = 'none';
        }

        // 更新主圖與大標題
        updateMainImage(!!isSuccess);
        updateTitleText(!!isSuccess, titleShort);

        // 詳細訊息仍輸出到 console 供除錯
        if (detailForConsole) {
            if (isSuccess) console.debug('CheckEmail detail:', detailForConsole);
            else console.warn('CheckEmail detail:', detailForConsole);
        }
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

        // 改為導向 ForgotEmail 的 Step2（帶上 email）
        const forgotEmailUrl = (window.Routes && window.Routes.Auth && window.Routes.Auth.ForgotEmail)
            ? window.Routes.Auth.ForgotEmail
            : '/Auth/ForgotEmail';

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            let url = forgotEmailUrl + '?goStep=2';
            if (email) url += '&email=' + encodeURIComponent(email);
            window.location.href = url;
        }, { once: true });
    }

    function disableNextButton() {
        const btn = qs('#btn_next_step') || qs('#btn_next') || qs('a#btn_next_step');
        if (!btn) return;
        btn.setAttribute('disabled', 'disabled');
        btn.classList.add('btn_Gray');
    }

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
            return { exists: json !== null, verified: !!(json && json.verified), raw: json };
        } catch (ex) {
            console.debug('checkEmailByAddress error', ex);
            return { exists: null, verified: false };
        }
    }

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
            const res = await fetch(ROUTES.SendConfirmation || '/api/auth/SendConfirmation', {
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
                try { localStorage.setItem('PendingEmailLocal', JSON.stringify({ email, expiresAt: Date.now() + 30 * 60 * 1000 })); } catch { }
            } else {
                if (json && json.action === 'redirect_login') {
                    setStatusMessage('此信箱已註冊，請登入', false, json.message, '此信箱已註冊');
                    setTimeout(() => { window.location.href = (window.Routes && window.Routes.Auth && window.Routes.Auth.Login) ? window.Routes.Auth.Login + '?email=' + encodeURIComponent(email) : '/Auth/Login?email=' + encodeURIComponent(email); }, 900);
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

    function handleBackupVerifiedQuery() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('backupVerified')) return false;

        const email = params.get('email') || null;
        setStatusMessage('恭喜您，信箱驗證成功！', true, `backupVerified param present. email=${email}`, '恭喜您，驗證成功');
        try {
            if (email) {
                localStorage.setItem('PendingEmailLocal', JSON.stringify({ email, expiresAt: Date.now() + 30 * 60 * 1000 }));
            }
        } catch { /* ignore */ }

        enableNextButton(email);
        return true;
    }

    async function checkStatus() {
        setStatusMessage('正在檢查驗證狀態...', true, '開始 checkStatus', '檢查中');

        const backup = await fetchJson(ROUTES.GetBackupLookupResult || '/api/auth/GetBackupLookupResult');
        if (backup.ok && backup.json) {
            const j = backup.json;
            if (j.found) {
                const accountEmail = j.accountEmail || j.lookupEmail || j.email || null;
                setStatusMessage('恭喜您，信箱驗證成功！', true, 'GetBackupLookupResult found: ' + JSON.stringify(j), '恭喜您，驗證成功');
                enableNextButton(accountEmail);
                return;
            }
        }

        const db = await fetchJson(ROUTES.CheckDbStatus || '/api/auth/CheckDbStatus');
        if (db.ok && db.json) {
            if (db.json.backupVerified === true) {
                setStatusMessage('恭喜您，信箱驗證成功！', true, 'CheckDbStatus backupVerified', '恭喜您，驗證成功');
                enableNextButton(db.json.email || null);
                return;
            }

            if (db.json.verified) {
                setStatusMessage('恭喜您，信箱驗證成功！', true, 'CheckDbStatus verified', '恭喜您，驗證成功');
                enableNextButton(db.json.email || null);
                return;
            }
        }

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
            if (r.exists === null) {
                setStatusMessage('伺服器無回應', false, 'CheckEmailStatus API error', '伺服器無回應');
                bindSendButton();
                disableNextButton();
                return;
            }
        }

        // 簡短失敗顯示，詳細寫入 console；並切換到失敗圖與標題
        setStatusMessage('驗證失敗', false, '驗證連結已失效或帳號不存在，請重新註冊或重新寄驗證信', '驗證失敗，請重新寄送驗證信，或連繫平台');
        bindSendButton();
        disableNextButton();
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindSendButton();

        const handled = handleBackupVerifiedQuery();
        if (!handled) {
            setTimeout(checkStatus, 120);
        }
    });

    window.addEventListener('focus', () => setTimeout(checkStatus, 150));

})();