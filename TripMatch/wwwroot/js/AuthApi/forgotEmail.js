(function () {
    const API_GET_RESULT = '/api/auth/GetBackupLookupResult';
    const API_SEND = '/api/auth/SendBackupLookup';
    const API_CLEAR_SESSION = '/api/auth/ClearPasswordResetSession';
    // ★ 移除 CreatePasswordResetSessionForUser，因為我們不再自動跳轉 Step 2

    let cooldownTime = 0;
    let cooldownTimer = null;

    // [驗證] 格式檢查
    function isValidEmailFormat(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return !!email && re.test(email);
    }

    // [功能] 冷卻倒數
    function startCooldown(seconds, $btn) {
        cooldownTime = seconds;
        $btn.disabled = true;
        $btn.classList.add('btn_Gray');

        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(() => {
            cooldownTime--;
            if (cooldownTime <= 0) {
                clearInterval(cooldownTimer);
                cooldownTimer = null;
                $btn.textContent = '寄驗證信';
                const input = document.getElementById('inputBackupemail');
                if (input) updateSendButtonState(input, $btn);
            } else {
                $btn.textContent = `重送(${cooldownTime}s)`;
            }
        }, 1000);
    }

    // [Storage] 標記驗證
    function markLocalVerified(email, minutes = 30) {
        try {
            const payload = { email: email || null, expiresAt: Date.now() + minutes * 60 * 1000 };
            localStorage.setItem('BackupLookupVerified', JSON.stringify(payload));
        } catch { }
    }

    function clearLocalVerified() {
        try {
            localStorage.removeItem('BackupLookupVerified');
            localStorage.removeItem('PendingEmailLocal');
        } catch { }
    }

    function isLocalVerifiedValid() {
        try {
            const raw = localStorage.getItem('BackupLookupVerified');
            if (!raw) return false;
            const obj = JSON.parse(raw);
            return obj && obj.expiresAt && Date.now() < obj.expiresAt;
        } catch { return false; }
    }

    function getLocalVerifiedEmail() {
        try {
            const raw = localStorage.getItem('BackupLookupVerified');
            if (!raw) return null;
            const obj = JSON.parse(raw);
            return obj?.email ?? null;
        } catch { return null; }
    }

    // [API]
    async function fetchBackupResult() {
        try {
            const res = await fetch(API_GET_RESULT, { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
        } catch { return null; }
    }

    // [UI] 訊息提示
    function showMessage(message, type = 'info', autoCloseSeconds = 3) {
        try {
            if (typeof window.showPopup === 'function') {
                window.showPopup({
                    title: type === 'error' ? '錯誤' : (type === 'success' ? '完成' : '提示'),
                    message: message || '',
                    type: type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info'),
                    autoClose: !!autoCloseSeconds,
                    seconds: autoCloseSeconds
                });
                return;
            }
        } catch { }
        alert(message);
    }

    function hideForgotEmailLinks() {
        document.querySelectorAll('.forgotEmailDisplay').forEach(el => el.classList.add('d-none'));
    }
    function showForgotEmailLinks() {
        document.querySelectorAll('.forgotEmailDisplay').forEach(el => el.classList.remove('d-none'));
    }

    // [核心] 顯示 Step 2 (結果頁)
    function showStep2(displayHtml, verifiedEmail) {
        const step1 = document.getElementById('step1_content');
        const step2 = document.getElementById('step2_content');

        if (step1) step1.classList.add('d-none');
        if (step2) step2.classList.remove('d-none');

        hideForgotEmailLinks();

        try {
            const h3 = step2.querySelector('h3');
            if (h3) h3.innerHTML = displayHtml;
        } catch { }

        // 插入安全提示
        let note = document.getElementById('forgotemail_security_note');
        if (!note) {
            note = document.createElement('p');
            note.id = 'forgotemail_security_note';
            note.className = 'text-muted mt-2 small';
            note.innerHTML = '基於安全僅提示前四個帳號名稱字元。若無法回想完整帳號，請聯繫客服。';
            step2.appendChild(note);
        }

        // 顯示操作區塊
        const actionArea = document.getElementById('step2_actions');
        if (actionArea) actionArea.classList.remove('d-none');

        // 移除舊動態按鈕
        const oldLoginBtn = document.getElementById('dynamic_login_btn');
        if (oldLoginBtn) oldLoginBtn.remove();

        // 處理「重設密碼」按鈕 (改成單純導向 ForgotPassword Step 1)
        const btnReset = document.getElementById('btn_next_step2');
        if (btnReset) {
            btnReset.style.display = '';
            btnReset.removeAttribute('disabled');
            btnReset.classList.remove('btn_Gray');

            // ★ 修改：不再自動跳轉 Step 2，而是去 ForgotPassword 填寫帳號
            btnReset.onclick = () => {
                const targetEmail = verifiedEmail || getLocalVerifiedEmail() || '';
                let url = (window.Routes && window.Routes.Auth && window.Routes.Auth.ForgotPassword)
                    ? window.Routes.Auth.ForgotPassword
                    : '/Auth/ForgotPassword';

                // 如果有找到 email，幫忙帶入參數 (方便使用者不用重打)，但不會自動跳過驗證
                if (targetEmail) {
                    url += `?email=${encodeURIComponent(targetEmail)}`;
                }
                window.location.href = url;
            };
        }

        updateStepIndicators();
    }

    // 更新指示器樣式
    function updateStepIndicators() {
        const s1 = document.getElementById('step1_indicator');
        const s2 = document.getElementById('step2_indicator');

        if (s1) {
            s1.className = 'step_item step_completed';
            const badge = s1.querySelector('.step_badge');
            if (badge) {
                badge.style.backgroundColor = 'var(--color_Light)';
                badge.style.borderColor = 'var(--color_Light)';
                badge.style.color = '#ffffff';
                badge.innerHTML = '<span class="step_number">1</span>';
            }
            const label = s1.querySelector('.step_label');
            if (label) label.style.fontWeight = 'normal';
        }

        if (s2) {
            s2.className = 'step_item step_active';
            const badge = s2.querySelector('.step_badge');
            if (badge) {
                badge.style.backgroundColor = 'var(--color_Contrast)';
                badge.style.borderColor = 'var(--color_Contrast)';
                badge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#000000" class="bi bi-check-lg" viewBox="0 0 16 16">
                        <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
                    </svg>
                `;
            }
            const label = s2.querySelector('.step_label');
            if (label) {
                label.style.fontWeight = 'bold';
                label.style.color = 'var(--color_DarkGray)';
            }
        }
    }

    function showStep1() {
        const step1 = document.getElementById('step1_content');
        const step2 = document.getElementById('step2_content');
        if (step1) step1.classList.remove('d-none');
        if (step2) step2.classList.add('d-none');
        showForgotEmailLinks();

        const btnNext = document.getElementById('btn_next_step');
        if (btnNext) {
            btnNext.setAttribute('disabled', 'disabled');
            btnNext.classList.add('btn_Gray');
        }
    }

    function maskEmailLocal(email) {
        if (!email) return '';
        const at = email.indexOf('@');
        if (at <= 0) return email;
        const local = email.substring(0, at);
        const domain = email.substring(at);
        const visiblePart = local.substring(0, 4);
        const stars = local.length > 4 ? '*'.repeat(local.length - 4) : '***';
        return visiblePart + stars + domain;
    }

    function validateAndShowHint(email) {
        if (window.Validator && typeof window.Validator.validateEmail === 'function') {
            const result = window.Validator.validateEmail(email);
            if (window.setFieldHint) {
                window.setFieldHint('email', result.message, result.valid ? 'success' : 'error');
            }
            return result.valid;
        } else {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const valid = re.test(email);
            if (window.setFieldHint) {
                window.setFieldHint('email', valid ? '' : '格式不正確', valid ? 'success' : 'error');
            }
            return valid;
        }
    }

    function updateSendButtonState(emailValue, $btn) {
        if (!$btn) return;
        const isValid = validateAndShowHint(emailValue);
        const isCooldown = cooldownTime > 0;

        if (isCooldown) {
            $btn.disabled = true;
            $btn.classList.add('btn_Gray');
        } else {
            $btn.disabled = !isValid;
            if (isValid) {
                $btn.classList.remove('btn_Gray');
                $btn.textContent = '寄驗證信';
            } else {
                $btn.classList.add('btn_Gray');
            }
        }
    }

    function enableSendControls($input, $btnSend) {
        if (!$input || !$btnSend) return;
        updateSendButtonState($input.value, $btnSend);

        $btnSend.onclick = async (e) => {
            e.preventDefault();
            const email = String($input.value || '').trim();
            if (!validateAndShowHint(email)) {
                showMessage('請輸入正確的 Email 格式', 'error');
                return;
            }

            $btnSend.disabled = true;
            $btnSend.textContent = '寄送中...';
            try {
                const res = await fetch(API_SEND, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(email)
                });
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    const alertEl = document.getElementById('custom_alert');
                    if (alertEl) alertEl.classList.remove('d-none');
                    markLocalVerified(email, 30);
                    showMessage(json?.message || '驗證信已寄出，請至備援信箱點擊連結以驗證。', 'success', 4);
                    startCooldown(30, $btnSend);

                    const btnNext = document.getElementById('btn_next_step');
                    if (btnNext) {
                        btnNext.removeAttribute('disabled');
                        btnNext.classList.remove('btn_Gray');
                    }
                } else {
                    showMessage(json?.message || '寄送失敗，請稍後再試', 'error');
                    updateSendButtonState($input.value, $btnSend);
                }
            } catch (ex) {
                console.error(ex);
                showMessage('網路錯誤，請稍後再試', 'error');
                updateSendButtonState($input.value, $btnSend);
            }
        };
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const input = document.getElementById('inputBackupemail');
        const btnSend = document.getElementById('btn_send_reset');
        const btnNext = document.getElementById('btn_next_step');
        const btnClear = document.getElementById('btnClearAndNew');

        showStep1();

        if (input) {
            input.addEventListener('input', () => {
                updateSendButtonState(input.value, btnSend);
            });
            updateSendButtonState(input.value, btnSend);
        }

        enableSendControls(input, btnSend);

        // 重新註冊
        if (btnClear) {
            btnClear.onclick = async () => {
                clearLocalVerified();
                try { fetch(API_CLEAR_SESSION, { method: 'POST' }); } catch { }
                const signupUrl = (window.Routes && window.Routes.Auth && window.Routes.Auth.Signup) ? window.Routes.Auth.Signup : '/Auth/Signup';
                window.location.href = signupUrl;
            };
        }

        // 下一步按鈕
        if (btnNext) {
            btnNext.onclick = async () => {
                const apiRes = await fetchBackupResult();
                if (apiRes && apiRes.found) {
                    await handleApiRes(apiRes);
                } else {
                    showMessage('尚未完成驗證，請先至信箱點擊連結。', 'error');
                }
            };
        }

        // ★ 核心判斷
        async function handleApiRes(apiRes) {
            if (!apiRes || !apiRes.found) return;

            // [多帳號]
            if (Array.isArray(apiRes.accounts) && apiRes.accounts.length > 1) {
                const backupEmail = apiRes.lookupEmail || '';
                const backupMasked = apiRes.lookupEmailMasked || maskEmailLocal(backupEmail);
                showMultipleAccountsInStep2(apiRes.accounts, backupMasked, backupEmail);
                return;
            }

            // [單一帳號]
            const maskedAccount = apiRes.accountEmailMasked || apiRes.lookupEmailMasked || maskEmailLocal(apiRes.accountEmail || apiRes.lookupEmail);
            const originalAccount = apiRes.accountEmail || apiRes.lookupEmail || apiRes.email || null;

            if (apiRes.accountBackupEmailConfirmed || apiRes.primaryEmailConfirmed) {
                markLocalVerified(apiRes.lookupEmail || originalAccount, 30);
                showSingleAccountStep2(maskedAccount, originalAccount);
            }
        }

        // 檢查 LocalStorage 或 URL
        if (isLocalVerifiedValid() || new URLSearchParams(window.location.search).get('backupVerified') === '1') {
            const apiRes = await fetchBackupResult();
            if (apiRes && apiRes.found) {
                markLocalVerified(apiRes.lookupEmail || apiRes.email || null, 30);
                await handleApiRes(apiRes);
                return;
            } else {
                if (btnNext) {
                    btnNext.removeAttribute('disabled');
                    btnNext.classList.remove('btn_Gray');
                }
            }
        }

        window.addEventListener('focus', async () => {
            if (isLocalVerifiedValid()) {
                const apiRes = await fetchBackupResult();
                if (apiRes && apiRes.found) {
                    await handleApiRes(apiRes);
                }
            }
        });
    });

    // [UI] 單一帳號顯示邏輯
    function showSingleAccountStep2(maskedAccount, originalAccount) {
        const html = `成功找回帳號：<br><strong style="font-size: 1.4rem; color: #333;">${maskedAccount}</strong>`;
        showStep2(html, originalAccount);

        const btnReset = document.getElementById('btn_next_step2');
        if (btnReset && btnReset.parentNode) {
            const loginBtn = document.createElement('button');
            loginBtn.id = 'dynamic_login_btn';
            loginBtn.type = 'button';
            loginBtn.className = 'btn_next_step mt-3 btn-Login';
            loginBtn.textContent = '登入';
            loginBtn.onclick = () => {
                const loginUrl = (window.Routes && window.Routes.Auth && window.Routes.Auth.Login) ? window.Routes.Auth.Login : '/Auth/Login';
                if (originalAccount) {
                    window.location.href = `${loginUrl}?email=${encodeURIComponent(originalAccount)}`;
                } else {
                    window.location.href = loginUrl;
                }
            };
            btnReset.parentNode.insertBefore(loginBtn, btnReset);
        }
    }

    // [UI] 多帳號顯示邏輯
    function showMultipleAccountsInStep2(accounts, backupEmailMasked, rawBackupEmail) {
        const html = `您的備援帳號是：<br><strong style="font-size: 1.4rem; color: #333;">${backupEmailMasked}</strong>`;
        showStep2(html, rawBackupEmail);

        const step2 = document.getElementById('step2_content');
        const oldList = document.getElementById('forgotemail_accounts_list');
        if (oldList) oldList.remove();

        const list = document.createElement('div');
        list.id = 'forgotemail_accounts_list';
        list.className = 'multiple-accounts-wrap p-3 border rounded mt-3 bg-light text-start';

        const title = document.createElement('div');
        title.textContent = '找到多個帳號，請選擇：';
        title.style.fontWeight = '600';
        title.className = 'mb-2';
        list.appendChild(title);

        accounts.forEach(ac => {
            const row = document.createElement('div');
            row.className = 'd-flex justify-content-between align-items-center py-2 border-bottom';
            row.innerHTML = `<div>${ac.masked || maskEmailLocal(ac.email)}</div>`;
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm btn-Login';
            btn.textContent = '使用此帳號登入';
            btn.onclick = () => {
                const loginUrl = (window.Routes && window.Routes.Auth && window.Routes.Auth.Login) ? window.Routes.Auth.Login : '/Auth/Login';
                window.location.href = `${loginUrl}?email=${encodeURIComponent(ac.email)}`;
            };
            row.appendChild(btn);
            list.appendChild(row);
        });

        const actions = document.getElementById('step2_actions');
        if (actions) {
            step2.insertBefore(list, actions);
        } else {
            step2.appendChild(list);
        }
    }
})();