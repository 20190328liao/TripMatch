// ForgotEmail.cshtml 專用：修正 DOM id 與「無輪詢」流程，並在登入按鈕點擊時清除 session
(function () {
    async function sendBackupVerification(backupEmail) {
        try {
            const url = window.Routes?.AuthApi?.SendBackupLookup ?? '/api/auth/SendBackupLookup';
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backupEmail)
            });
            const json = await res.json();
            return { ok: res.ok, json };
        } catch (err) {
            return { ok: false, json: { message: '網路錯誤，請稍後再試' } };
        }
    }

    async function getBackupResult() {
        const url = window.Routes?.AuthApi?.GetBackupLookupResult ?? '/api/auth/GetBackupLookupResult';
        try {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
        } catch { return null; }
    }

    window.ForgotEmailClient = { sendBackupVerification, getBackupResult };

    document.addEventListener('DOMContentLoaded', function () {
        const input = document.getElementById('inputBackupemail');
        const btnSend = document.getElementById('btn_send_reset');
        const customAlert = document.getElementById('custom_alert');
        const resendWrap = document.getElementById('resend_wrap');
        const resendHint = document.getElementById('resend_hint');
        const btnNext = document.getElementById('btn_next_step');
        const step1Content = document.getElementById('step1_content');
        // View 使用 id="step3_content" 做 Step2 顯示（保持與 Razor 一致）
        const step2Content = document.getElementById('step3_content');
        const step1Indicator = document.getElementById('step1_indicator');
        const step2Indicator = document.getElementById('step2_indicator');

        let isSending = false;
        let isVerified = false;
        let cooldownTime = 0;
        let cooldownTimer = null;

        const validateEmail = (window.Validator && typeof window.Validator.validateEmail === 'function')
            ? window.Validator.validateEmail
            : (email => {
                const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!email) return { valid: false, message: "☐ 請輸入 Email" };
                if (!re.test(email)) return { valid: false, message: "☐ Email 格式不正確" };
                return { valid: true, message: "☑ Email 格式正確" };
            });

        const setHint = (message, status) => {
            if (typeof window.setFieldHint === 'function') {
                if (!message) window.setFieldHint('email');
                else window.setFieldHint('email', message, status);
            } else {
                const el = document.getElementById('emailHint');
                if (!el) return;
                el.textContent = message || '';
                el.className = 'inputHint mt-2';
                if (status === 'success') el.classList.add('text-success');
                else if (status === 'error') el.classList.add('text-danger');
            }
        };

        function startCooldown(seconds) {
            cooldownTime = seconds;
            if (!btnSend) return;
            btnSend.disabled = true;
            btnSend.classList.add('btn_Gray');
            if (cooldownTimer) clearInterval(cooldownTimer);
            cooldownTimer = setInterval(() => {
                cooldownTime--;
                if (cooldownTime <= 0) {
                    clearInterval(cooldownTimer);
                    cooldownTimer = null;
                    if (!isVerified) {
                        btnSend.disabled = false;
                        btnSend.classList.remove('btn_Gray');
                        btnSend.textContent = '寄驗證信';
                        setHint('☑ Email 格式正確，可重新發送驗證信', 'success');
                    }
                } else {
                    btnSend.textContent = `重送(${cooldownTime}s)`;
                }
            }, 1000);
        }

        // 顯示 Step2（頁面上的 step2_content）並插入帳號，啟用兩個按鈕
        function showStep2(account) {
            isVerified = true;
            if (input) input.readOnly = true;
            setHint('☑ 備援信箱驗證成功！', 'success');

            if (step1Content) step1Content.classList.add('d-none');
            if (step2Content) {
                step2Content.classList.remove('d-none');
                const h3 = step2Content.querySelector('h3');
                if (h3) h3.innerHTML = `成功找回帳號：您的帳號是：<strong>${account || ''}</strong>`;
            }

            // 啟用 Step2 的兩個按鈕（登入 / 重設密碼）
            const btnLogin = document.getElementById('btn_next_step1');
            const btnReset = document.getElementById('btn_next_step2');
            if (btnLogin) { btnLogin.disabled = false; btnLogin.classList.remove('btn_Gray'); btnLogin.classList.add('btn_light'); }
            if (btnReset) { btnReset.disabled = false; btnReset.classList.remove('btn_Gray'); btnReset.classList.add('btn_light'); }

            if (step1Indicator) {
                step1Indicator.classList.remove('step_incomplete');
                step1Indicator.classList.add('step_complete');
            }
            if (step2Indicator) {
                step2Indicator.classList.remove('step_incomplete');
                step2Indicator.classList.add('step_complete');
            }

            if (btnSend) {
                btnSend.disabled = true;
                btnSend.classList.add('btn_Gray');
                btnSend.textContent = '已完成驗證';
            }
            if (resendWrap) resendWrap.classList.add('d-none');
        }

        // 初次或 focus 時的單次檢查（不輪詢）
        async function checkOnceAndShow() {
            try {
                const result = await window.ForgotEmailClient.getBackupResult();
                if (result && (result.userId || result.email)) {
                    showStep2(result.email || result.account || '');
                }
            } catch { /* 忽略 */ }
        }

        // 若驗證信 redirect 回本頁並帶 query string backupVerified=1，立即呼叫一次後端取 account 並顯示
        (function handleUrlVerification() {
            try {
                const params = new URLSearchParams(window.location.search);
                const v = params.get('backupVerified') || params.get('verified');
                if (v === '1' || v === 'true') {
                    // 以 session 為準，向後端取一次資訊
                    checkOnceAndShow();
                    // 移除 query 以免重複處理
                    if (window.history && window.history.replaceState) {
                        const cleanUrl = window.location.pathname + window.location.hash;
                        window.history.replaceState({}, document.title, cleanUrl);
                    }
                }
            } catch { /* ignore */ }
        })();

        // 即時格式驗證（使用 Validator.validateEmail）
        if (input) {
            input.addEventListener('input', function () {
                const email = input.value.trim();
                if (!email) { setHint(); if (btnSend) btnSend.disabled = true; return; }
                const res = validateEmail(email);
                if (res.valid) {
                    if (isVerified) { setHint('☑ 備援信箱已驗證', 'success'); if (btnSend) btnSend.disabled = true; }
                    else if (cooldownTime > 0) { setHint(`☑ 驗證信已寄出（${cooldownTime} 秒後可重送）`, 'success'); if (btnSend) btnSend.disabled = true; }
                    else if (isSending) { setHint('發送中...', 'muted'); if (btnSend) btnSend.disabled = true; }
                    else { setHint(res.message || '☑ Email 格式正確', 'success'); if (btnSend) { btnSend.disabled = false; btnSend.classList.remove('btn_Gray'); } }
                } else {
                    setHint(res.message || '請輸入正確的 Email 格式', 'error');
                    if (btnSend) btnSend.disabled = true;
                }
            });
        }

        // 點擊寄驗證信（不啟動輪詢）
        if (btnSend) {
            btnSend.addEventListener('click', async function () {
                const email = input ? input.value.trim() : '';
                if (!email) { setHint('請先輸入 Email', 'error'); return; }
                const res = validateEmail(email);
                if (!res.valid) { setHint(res.message || '請輸入正確的 Email 格式', 'error'); return; }
                if (isSending || cooldownTime > 0) return;

                isSending = true;
                btnSend.disabled = true;
                btnSend.textContent = '發送中...';

                try {
                    const resp = await window.ForgotEmailClient.sendBackupVerification(email);
                    isSending = false;
                    if (resp.ok) {
                        const data = resp.json || {};
                        if (data.verified) {
                            // 後端直接回傳已驗證（少見）
                            showStep2(data.account || data.username || data.email || '');
                            if (typeof window.showPopup === 'function') window.showPopup({ title: "提示", message: data.message || "已驗證", type: "success", autoClose: true, seconds: 2 });
                        } else {
                            // 成功寄出驗證信 — 指示使用者點驗證信中的連結（連結建議 redirect 回本頁）
                            startCooldown(30);
                            setHint('已寄出驗證信，請前往信箱點擊連結以完成驗證', 'success');
                            if (customAlert) customAlert.classList.remove('d-none');
                            if (resendWrap) { resendWrap.classList.remove('d-none'); if (resendHint) resendHint.textContent = '已寄出驗證信，請檢查收件匣或垃圾信件。'; }
                            if (typeof window.showPopup === 'function') window.showPopup({ title: "發送成功", message: resp.json?.message || "驗證信已寄出，請檢查信箱。", type: "success", autoClose: true, seconds: 3 });
                        }
                    } else {
                        const msg = (resp.json && resp.json.message) ? resp.json.message : '發送失敗，請稍後再試';
                        setHint(msg, 'error');
                        btnSend.disabled = false;
                        btnSend.textContent = '寄驗證信';
                    }
                } catch (e) {
                    isSending = false;
                    setHint('發生錯誤，請稍後再試', 'error');
                    btnSend.disabled = false;
                    btnSend.textContent = '寄驗證信';
                }
            });
        }

        // 下一步（已驗證才可）
        if (btnNext) {
            btnNext.addEventListener('click', async function () {
                if (!isVerified) { setHint('請先完成備援信箱驗證', 'error'); return; }
                // 若需要再次從後端取 account，可呼叫一次 getBackupResult()
                const result = await window.ForgotEmailClient.getBackupResult();
                const account = result?.email || result?.account || result?.username || '';
                showStep2(account);
            });
        }

        // 修改：按下「重設密碼」會導到 ForgotPassword，並帶上備援信箱參數，讓頁面自動處理後續
        // Step2 的兩個按鈕行為（登入 / 重設密碼）
        const btnLogin = document.getElementById('btn_next_step1');
        if (btnLogin) btnLogin.addEventListener('click', function () { window.location.href = window.Routes?.Auth?.Login || '/Auth/Login'; });

        const btnReset = document.getElementById('btn_next_step2');
        if (btnReset) btnReset.addEventListener('click', function () {
            // 導到 ForgotPassword 並帶上參數 goStep=2 與備援信箱 email
            const emailValue = input ? input.value.trim() : '';
            const base = window.Routes?.Auth?.ForgotPassword || '/Auth/ForgotPassword';
            const qs = new URLSearchParams();
            qs.set('goStep', '2');
            if (emailValue) qs.set('email', emailValue);
            window.location.href = `${base}?${qs.toString()}`;
        });

        // 修改：強化回到頁面時以 session/cookie 判斷並啟用「下一步」按鈕（不自動跳轉）
        async function checkOnceAndShow() {
            try {
                const result = await window.ForgotEmailClient.getBackupResult();
                if (result && (result.userId || result.email)) {
                    // 標記已驗證，預填欄位並啟用下一步按鈕讓使用者可以前往 Step2
                    isVerified = true;
                    if (input) {
                        input.readOnly = true;
                    }
                    setHint('☑ 備援信箱驗證成功！', 'success');

                    // 啟用畫面上的「下一步」按鈕（id="btn_next_step"）
                    if (btnNext) {
                        btnNext.disabled = false;
                        btnNext.classList.remove('btn_Gray');
                        btnNext.classList.add('btn_light');
                    }

                    // 同時把 Step2 顯示內容的帳號文字更新（但不自動切換畫面）
                    const account = result.email || result.account || result.username || '';
                    const step2Content = document.getElementById('step3_content'); // 此頁以 step3_content 做 Step2 顯示
                    if (step2Content) {
                        const h3 = step2Content.querySelector('h3');
                        if (h3) h3.innerHTML = `成功找回帳號：您的帳號是：<strong>${account}</strong>`;
                    }
                }
            } catch (e) {
                console.error("checkOnceAndShow failed:", e);
            }
        }

        // 使用者回到視窗（可能在信箱點擊驗證）時只做一次檢查（不輪詢）
        window.addEventListener('focus', function () { if (!isVerified) checkOnceAndShow(); });

        // 初始狀態與一次性後端檢查
        if (btnSend) { btnSend.disabled = true; btnSend.classList.add('btn_Gray'); }
        if (btnNext) { btnNext.disabled = true; btnNext.classList.add('btn_Gray'); }

        (async function initialCheck() {
            try {
                const res = await window.ForgotEmailClient.getBackupResult();
                if (res && (res.userId || res.email)) showStep2(res.email || res.account || '');
            } catch { /* ignore */ }
        })();
    });
})();