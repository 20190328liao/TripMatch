// ForgotEmail.cshtml 專用：處理備援信箱驗證流程，支援 localStorage 與後端 cookie 作為雙重判定
// - 在使用者點郵件連結後，CheckEmail 會寫入短期 cookie 或 localStorage（由 checkEmail.js 負責）
// - 本檔載入時會自動檢查是否已驗證，若已驗證則直接顯示 Step2（或自動跳轉）
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

    // 使用 showPopup（若存在）否則回退到 alert
    function showMessage(message, type = 'info', autoCloseSeconds = 3) {
        try {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: type === 'error' ? '錯誤' : (type === 'success' ? '完成' : '提示'), message: message || '', type: type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info'), autoClose: !!autoCloseSeconds, seconds: autoCloseSeconds });
                return;
            }
        } catch { /* ignore */ }
        // fallback
        alert(message);
    }

    function showStep2(accountEmail) {
        // 顯示 Step2（step3_content id 在 cshtml 中）
        const step1 = document.getElementById('step1_content');
        const step2 = document.getElementById('step3_content');
        if (step1) step1.classList.add('d-none');
        if (step2) step2.classList.remove('d-none');

        // 更新 Step2 文字
        try {
            const h3 = step2.querySelector('h3');
            if (h3) h3.innerHTML = `成功找回帳號：您的帳號是：<strong>${accountEmail || ''}</strong>`;
        } catch { /* ignore */ }

        // 啟用按鈕
        const btnLogin = document.getElementById('btn_next_step1');
        const btnReset = document.getElementById('btn_next_step2');
        if (btnLogin) {
            btnLogin.removeAttribute('disabled');
            btnLogin.classList.remove('btn_Gray');
        }
        if (btnReset) {
            btnReset.removeAttribute('disabled');
            btnReset.classList.remove('btn_Gray');
            // 導到重設密碼頁（若需要帶參數，可修改）
            btnReset.onclick = async () => {
                try {
                    const email = accountEmail || getLocalVerifiedEmail() || '';
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
                        // 直接導向 ForgotPassword 頁面（Step2 會由 Session 驗證）
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

        // 更新指示器
        const s1 = document.getElementById('step1_indicator');
        const s2 = document.getElementById('step2_indicator');
        if (s1) { s1.classList.remove('step_incomplete'); s1.classList.add('step_complete'); }
        if (s2) { s2.classList.remove('step_incomplete'); s2.classList.add('step_complete'); }
    }

    function enableSendControls($input, $btnSend) {
        if (!$input || !$btnSend) return;
        $btnSend.removeAttribute('disabled');
        $btnSend.classList.remove('btn_Gray');
        $btnSend.onclick = async (e) => {
            e.preventDefault();
            const email = String($input.value || '').trim();
            if (!isValidEmailFormat(email)) {
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
                    // 顯示提示
                    const alertEl = document.getElementById('custom_alert');
                    if (alertEl) alertEl.classList.remove('d-none');
                    // 寫入 local cache（避免 cookie 被阻擋時 UX 斷裂）
                    markLocalVerified(email, 30);
                    // 啟用下一步按鈕（使用者仍需按下一步進入 Step2 或手動點郵件）
                    const btnNext = document.getElementById('btn_next_step');
                    if (btnNext) {
                        btnNext.removeAttribute('disabled');
                        btnNext.classList.remove('btn_Gray');
                        btnNext.onclick = () => { window.location.href = '/Auth/ForgotEmail?backupVerified=1'; };
                    }
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
        const btnNext = document.getElementById('btn_next_step');

        // 綁定輸入驗證
        if (input) {
            input.addEventListener('input', () => {
                const v = String(input.value || '').trim();
                if (v && isValidEmailFormat(v)) {
                    if (btnSend) btnSend.disabled = false;
                } else {
                    if (btnSend) btnSend.disabled = true;
                }
            });
        }

        enableSendControls(input, btnSend);

        // 如果 localStorage 標記有效 -> 直接取後端結果並進 Step2
        if (isLocalVerifiedValid() || new URLSearchParams(window.location.search).get('backupVerified') === '1') {
            const apiRes = await fetchBackupResult();
            if (apiRes && apiRes.found) {
                markLocalVerified(apiRes.lookupEmail || apiRes.email || null, 30);
                showStep2(apiRes.accountEmail || apiRes.lookupEmail || apiRes.email || '');
                return;
            }
        }

        // 當頁面 focus 時再檢查一次（使用者可能在郵件分頁完成驗證）
        window.addEventListener('focus', async () => {
            if (isLocalVerifiedValid()) {
                const localEmail = getLocalVerifiedEmail();
                // 仍嘗試從 server 取得更完整資訊
                const apiRes = await fetchBackupResult();
                if (apiRes && apiRes.found) {
                    showStep2(apiRes.accountEmail || apiRes.lookupEmail || apiRes.email || localEmail || '');
                } else if (localEmail) {
                    // 如果只有 localEmail，也顯示 Step2（不含 accountEmail）
                    showStep2(localEmail);
                }
            } else {
                const apiRes = await fetchBackupResult();
                if (apiRes && apiRes.found) {
                    markLocalVerified(apiRes.lookupEmail || apiRes.email || null, 30);
                    showStep2(apiRes.accountEmail || apiRes.lookupEmail || apiRes.email || '');
                }
            }
        });
    });
})();