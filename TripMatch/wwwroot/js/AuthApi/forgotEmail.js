// 完整替換現有檔案內容：Step2 顯示時隱藏回到登入/忘記密碼連結，寄信後不再提前啟用下一步
(function () {
    const API_GET_RESULT = '/api/auth/GetBackupLookupResult';
    const API_SEND = '/api/auth/SendBackupLookup';

    function isValidEmailFormat(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return !!email && re.test(email);
    }

    function markLocalVerified(email, minutes = 30) {
        try {
            const payload = { email: email || null, expiresAt: Date.now() + minutes * 60 * 1000 };
            localStorage.setItem('BackupLookupVerified', JSON.stringify(payload));
        } catch { /* ignore */ }
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

    async function fetchBackupResult() {
        try {
            const res = await fetch(API_GET_RESULT, { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
        } catch { return null; }
    }

    function showMessage(message, type = 'info', autoCloseSeconds = 3) {
        try {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: type === 'error' ? '錯誤' : (type === 'success' ? '完成' : '提示'), message: message || '', type: type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info'), autoClose: !!autoCloseSeconds, seconds: autoCloseSeconds });
                return;
            }
        } catch { /* ignore */ }
        alert(message);
    }

    // 隱藏或顯示頁面上「回到登入 / 忘記密碼」連結（class=forgotEmailDisplay）
    function hideForgotEmailLinks() {
        document.querySelectorAll('.forgotEmailDisplay').forEach(el => el.classList.add('d-none'));
    }
    function showForgotEmailLinks() {
        document.querySelectorAll('.forgotEmailDisplay').forEach(el => el.classList.remove('d-none'));
    }

    // 顯示 Step2（接收遮罩字串與原始 email），並隱藏回到登入/忘記密碼連結
    function showStep2(maskedEmail, originalEmail) {
        const step1 = document.getElementById('step1_content');
        const step2 = document.getElementById('step3_content');
        if (step1) step1.classList.add('d-none');
        if (step2) step2.classList.remove('d-none');

        // 隱藏頁面上的 a 連結（因為 Step2 有按鈕）
        hideForgotEmailLinks();

        try {
            const h3 = step2.querySelector('h3');
            if (h3) h3.innerHTML = `成功找回帳號：您的帳號是：<strong>${maskedEmail || ''}</strong>`;
        } catch { /* ignore */ }

        // 插入安全說明（若不存在）
        let note = document.getElementById('forgotemail_security_note');
        if (!note) {
            note = document.createElement('p');
            note.id = 'forgotemail_security_note';
            note.style.marginTop = '8px';
            note.style.color = '#555';
            note.innerHTML = '基於安全僅提示前四個帳號名稱字元，不會完整呈現帳號。可能會有多個主要信箱使用相同備援帳號，或請聯繫 TripMatch 團隊。';
            step2.appendChild(note);
        } else {
            note.innerHTML = '基於安全僅提示前四個帳號名稱字元，不會完整呈現帳號。可能會有多個主要信箱使用相同備援帳號，或請聯繫 TripMatch 團隊。';
        }

        // 啟用 Step2 上的按鈕（登入 / 重設密碼）
        const btnLogin = document.getElementById('btn_next_step1');
        const btnReset = document.getElementById('btn_next_step2');
        if (btnLogin) {
            btnLogin.removeAttribute('disabled');
            btnLogin.classList.remove('btn_Gray');
        }
        if (btnReset) {
            btnReset.removeAttribute('disabled');
            btnReset.classList.remove('btn_Gray');
            btnReset.onclick = async () => {
                try {
                    const email = originalEmail || getLocalVerifiedEmail() || '';
                    if (!email) {
                        showMessage('找不到對應帳號，無法進行重設', 'error');
                        return;
                    }

                    const res = await fetch('/api/auth/CreatePasswordResetSessionForUser', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(email)
                    });

                    const json = await res.json().catch(() => ({}));
                    if (res.ok) {
                        window.location.href = json.redirect || '/Auth/ForgotPassword';
                    } else {
                        showMessage(json?.message || '建立重設連結失敗', 'error');
                    }
                } catch (ex) {
                    console.error(ex);
                    showMessage('網路錯誤，請稍後再試', 'error');
                }
            };
        }

        const s1 = document.getElementById('step1_indicator');
        const s2 = document.getElementById('step2_indicator');
        if (s1) { s1.classList.remove('step_incomplete'); s1.classList.add('step_complete'); }
        if (s2) { s2.classList.remove('step_incomplete'); s2.classList.add('step_complete'); }
    }

    // 顯示 Step1（顯示回到登入/忘記密碼連結）
    function showStep1() {
        const step1 = document.getElementById('step1_content');
        const step2 = document.getElementById('step3_content');
        if (step1) step1.classList.remove('d-none');
        if (step2) step2.classList.add('d-none');
        showForgotEmailLinks();
        // 確保 Step1 的下一步按鈕預設為 disabled（必須等到後端驗證成功才會進行切換）
        const btnNext = document.getElementById('btn_next_step');
        if (btnNext) {
            btnNext.setAttribute('disabled', 'disabled');
            btnNext.classList.add('btn_Gray');
        }
    }

    // 前端遮罩（備援）
    function maskEmailLocal(email) {
        if (!email) return '';
        const at = email.indexOf('@');
        if (at <= 0) return email;
        const local = email.substring(0, at);
        const domain = email.substring(at);
        if (local.length <= 4) return local + domain;
        return local.substring(0, 4) + '*'.repeat(local.length - 4) + domain;
    }

    // 使用 helper.js 的 Validator 與 setFieldHint 顯示 emailHint（fallback 為簡單 regex）
    function validateAndShowHint(rawEmail) {
        try {
            const v = String(rawEmail || '').trim();
            if (window.Validator && typeof window.Validator.validateEmail === 'function' && typeof window.setFieldHint === 'function') {
                const result = window.Validator.validateEmail(v);
                window.setFieldHint('email', result.message, result.valid ? 'success' : 'error');
                return result.valid;
            } else {
                const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
                if (window.setFieldHint) window.setFieldHint('email', ok ? '☑ Email 格式正確' : '☐ Email 格式不正確', ok ? 'success' : 'error');
                return ok;
            }
        } catch (ex) {
            console.error('validateAndShowHint error', ex);
            try { window.setFieldHint && window.setFieldHint('email'); } catch { }
            return false;
        }
    }

    // 啟用寄送按鈕（但不再自動啟用「下一步」）
    function enableSendControls($input, $btnSend) {
        if (!$input || !$btnSend) return;
        validateAndShowHint($input.value);

        $btnSend.removeAttribute('disabled');
        $btnSend.classList.remove('btn_Gray');
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
                    // 只在 local 儲存以改善 UX；不要提前啟用「下一步」
                    markLocalVerified(email, 30);
                    showMessage(json?.message || '驗證信已寄出，請至備援信箱點擊連結以驗證。', 'success', 4);
                } else {
                    showMessage(json?.message || '寄送失敗，請稍後再試', 'error');
                }
            } catch (ex) {
                console.error(ex);
                showMessage('網路錯誤，請稍後再試', 'error');
            } finally {
                $btnSend.disabled = false;
                $btnSend.textContent = '寄驗證信';
            }
        };
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const input = document.getElementById('inputBackupemail');
        const btnSend = document.getElementById('btn_send_reset');

        // 初始顯示 Step1 與連結
        showStep1();

        if (input) {
            input.addEventListener('input', () => {
                const v = String(input.value || '').trim();
                const isValid = validateAndShowHint(v);
                if (btnSend) {
                    btnSend.disabled = !isValid;
                    btnSend.classList.toggle('btn_Gray', !isValid);
                }
            });

            // 載入時若已有值也驗證一次
            validateAndShowHint(input.value);
        }

        enableSendControls(input, btnSend);

        async function handleApiRes(apiRes) {
            if (!apiRes || !apiRes.found) return;

            // 多帳號處理（若後端回 accounts 會另行顯示選單）
            if (Array.isArray(apiRes.accounts) && apiRes.accounts.length > 1) {
                // 顯示多帳號清單（會呼叫 showStep2 選項）
                showMultipleAccountsInStep2(apiRes.accounts, apiRes.lookupEmailMasked || maskEmailLocal(apiRes.lookupEmail));
                return;
            }

            const maskedAccount = apiRes.accountEmailMasked || apiRes.lookupEmailMasked || null;
            const originalAccount = apiRes.accountEmail || apiRes.lookupEmail || apiRes.email || null;
            const maskedToShow = maskedAccount || maskEmailLocal(originalAccount);

            // 如果該備援信箱已成功驗證並對應主帳號 -> 直接顯示 Step2（此時隱藏 a 連結）
            if (apiRes.accountBackupEmail !== undefined) {
                if (!apiRes.accountBackupEmail || !apiRes.accountBackupEmailConfirmed) {
                    showMessage('該帳號尚未填寫或完成備援信箱驗證，請先確認備援信箱。', 'info', 4);
                    markLocalVerified(apiRes.lookupEmail || null, 30);
                    return;
                }
                markLocalVerified(apiRes.lookupEmail || apiRes.accountEmail || null, 30);
                try { window.setFieldHint && window.setFieldHint('email', '☑ 已驗證備援信箱，可繼續下一步', 'success'); } catch {}
                showStep2(maskedToShow, originalAccount);
                return;
            }

            if (apiRes.primaryEmailConfirmed === true) {
                markLocalVerified(apiRes.lookupEmail || apiRes.accountEmail || null, 30);
                try { window.setFieldHint && window.setFieldHint('email', '☑ 已驗證主信箱，可繼續下一步', 'success'); } catch {}
                showStep2(maskedToShow, originalAccount);
                return;
            }

            if (apiRes.accountEmail && apiRes.primaryEmailConfirmed === false) {
                showMessage('找到對應帳號，但主信箱尚未驗證，請先完成 Email 驗證或重新註冊。', 'info', 5);
                return;
            }
        }

        // 如果 localStorage 標記有效或 URL 表示 backupVerified，嘗試取得 server 結果並處理
        if (isLocalVerifiedValid() || new URLSearchParams(window.location.search).get('backupVerified') === '1') {
            const apiRes = await fetchBackupResult();
            if (apiRes && apiRes.found) {
                markLocalVerified(apiRes.lookupEmail || apiRes.email || null, 30);
                await handleApiRes(apiRes);
                return;
            }
        }

        // 當頁面 focus 時再檢查一次（使用者可能在郵件分頁完成驗證）
        window.addEventListener('focus', async () => {
            if (isLocalVerifiedValid()) {
                const localEmail = getLocalVerifiedEmail();
                const apiRes = await fetchBackupResult();
                if (apiRes && apiRes.found) {
                    await handleApiRes(apiRes);
                } else if (localEmail) {
                    // 只有本地標記時仍顯示 Step2（非理想，但維持原 UX）
                    try { window.setFieldHint && window.setFieldHint('email', '☑ 本地驗證成功', 'success'); } catch {}
                    showStep2(maskEmailLocal(localEmail), localEmail);
                }
            } else {
                const apiRes = await fetchBackupResult();
                if (apiRes && apiRes.found) {
                    markLocalVerified(apiRes.lookupEmail || apiRes.email || null, 30);
                    await handleApiRes(apiRes);
                }
            }
        });
    });

    // 多帳號選擇顯示器（與之前版本一致）
    function showMultipleAccountsInStep2(accounts, lookupMasked) {
        // 延遲註冊，方便主流程呼叫
        // 簡單實作：在 DOMContentLoaded 裡也可呼叫到
        const step2 = document.getElementById('step3_content');
        if (!step2) return;

        showStep2(lookupMasked || '', '');

        const old = document.getElementById('forgotemail_accounts_list');
        if (old) old.remove();

        const list = document.createElement('div');
        list.id = 'forgotemail_accounts_list';
        list.style.marginTop = '12px';
        list.style.padding = '8px';
        list.style.border = '1px solid rgba(0,0,0,0.06)';
        list.style.borderRadius = '8px';
        list.style.background = '#fff';

        const title = document.createElement('div');
        title.textContent = '找到多個可能的主帳號，請選擇要使用的帳號：';
        title.style.marginBottom = '8px';
        title.style.fontWeight = '600';
        list.appendChild(title);

        accounts.forEach(ac => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '6px 4px';
            row.style.borderBottom = '1px solid rgba(0,0,0,0.04)';

            const left = document.createElement('div');
            left.innerHTML = `<div style="font-weight:600">${ac.masked || maskEmailLocal(ac.email)}</div><div style="font-size:0.9rem;color:#666">${ac.emailConfirmed ? '主信箱已驗證' : '主信箱未驗證'}</div>`;
            row.appendChild(left);

            const right = document.createElement('div');
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm btn-primary';
            btn.textContent = '使用此帳號';
            btn.onclick = () => {
                showStep2(ac.masked || maskEmailLocal(ac.email), ac.email);
                markLocalVerified(ac.email, 30);
                const el = document.getElementById('forgotemail_accounts_list');
                if (el) el.remove();
            };
            right.appendChild(btn);
            row.appendChild(right);

            list.appendChild(row);
        });

        step2.appendChild(list);
    }

})();