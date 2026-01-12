// 新增一個小檔案，於 ForgotEmail.cshtml 由 view 引入或在 helper.js 合併
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
            return { ok: false, json: { message: '網路錯誤' } };
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

    // 初始化綁定（在 ForgotEmail.cshtml 內呼叫）
    window.ForgotEmailClient = {
        sendBackupVerification,
        getBackupResult
    };
})();