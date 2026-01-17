// 檢查短期驗證 token，若已驗證則啟用「下一步」或自動跳轉到 ForgotEmail Step2
(async function () {
    async function getBackupResult() {
        try {
            const res = await fetch('/api/auth/GetBackupLookupResult', { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    function markLocalVerified(email, minutes = 30) {
        try {
            const payload = { email: email || null, expiresAt: Date.now() + minutes * 60 * 1000 };
            localStorage.setItem('BackupLookupVerified', JSON.stringify(payload));
        } catch { /* ignore storage errors */ }
    }

    function isLocalVerifiedValid() {
        try {
            const raw = localStorage.getItem('BackupLookupVerified');
            if (!raw) return false;
            const obj = JSON.parse(raw);
            return obj && obj.expiresAt && Date.now() < obj.expiresAt;
        } catch {
            return false;
        }
    }

    function openForgotStep2() {
        // 導到 ForgotEmail 的 Step2（前端會以 backupVerified 讀取狀態）
        window.location.href = '/Auth/ForgotEmail?backupVerified=1';
    }

    function enableNextButton(btnNext) {
        if (!btnNext) return;
        btnNext.removeAttribute('disabled');
        btnNext.classList.remove('btn_Gray');
        // 綁定一次性的事件處理器，避免多次綁定
        btnNext.addEventListener('click', () => {
            openForgotStep2();
        }, { once: true });
    }

    function disableNextButton(btnNext) {
        if (!btnNext) return;
        btnNext.setAttribute('disabled', 'disabled');
        btnNext.classList.add('btn_Gray');
        // 不移除事件，因為我們使用 { once: true } 綁定
    }

    // 小型 UI 更新（若頁面有對應元素則顯示）
    function setStatusMessage(msg, isSuccess) {
        try {
            const el = document.querySelector('#verifyStatus');
            if (!el) return;
            el.textContent = msg || '';
            el.classList.toggle('text-success', !!isSuccess);
            el.classList.toggle('text-danger', !isSuccess);
        } catch { /* ignore */ }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const btnNext = document.querySelector('#btn_next_step') || document.querySelector('#btn_next'); // 根據頁面 id 調整
        const autoProceed = new URLSearchParams(window.location.search).get('auto') === '1'
            || new URLSearchParams(window.location.search).get('backupVerified') === '1';

        // 1) localStorage 優先（使用者在 CheckEmail 成功驗證後關閉可恢復）
        if (isLocalVerifiedValid()) {
            enableNextButton(btnNext);
            setStatusMessage('已驗證，可進行下一步', true);
            if (autoProceed) {
                // 小延遲讓使用者看到狀態
                setTimeout(openForgotStep2, 300);
                return;
            }
        }

        // 2) 向後端確認（cookie-based token）
        const result = await getBackupResult();
        if (result && result.found) {
            // 儲存 localStorage 作為 fallback（30 分鐘）
            markLocalVerified(result.lookupEmail || result.email || null, 30);

            enableNextButton(btnNext);
            setStatusMessage('驗證成功，請按下一步繼續', true);

            if (autoProceed) {
                setTimeout(openForgotStep2, 300);
            }
        } else {
            // 未找到或過期
            disableNextButton(btnNext);
            setStatusMessage('尚未完成驗證或驗證已過期', false);
        }
    });

    // 當視窗獲得焦點時再次檢查（使用者可能在郵件分頁完成驗證後回來）
    window.addEventListener('focus', async () => {
        if (isLocalVerifiedValid()) return;
        const result = await getBackupResult();
        if (result && result.found) {
            markLocalVerified(result.lookupEmail || result.email || null, 30);
            const btnNext = document.querySelector('#btn_next_step') || document.querySelector('#btn_next');
            enableNextButton(btnNext);
            setStatusMessage('驗證成功，請按下一步繼續', true);
        }
    });
})();