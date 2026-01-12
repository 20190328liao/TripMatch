// 新增簡單前端邏輯（MemberCenter 編輯 Email 流程的 client-side）
(function () {
    const apiSendChangePrimary = window.Routes?.AuthApi?.SendChangePrimaryEmail ?? '/api/auth/SendChangePrimaryEmail';
    const apiSendChangeBackup = window.Routes?.AuthApi?.SendChangeBackupEmail ?? '/api/auth/SendChangeBackupEmail';

    async function sendChangeRequest(url, email) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(email)
            });
            return await res.json();
        } catch { return { success: false, message: '網路錯誤' }; }
    }

    // 綁定 UI（呼叫於 memberCenter.js init）
    window.MemberEmailUX = {
        bind() {
            $('#btnEditEmail').on('click', () => $('#inputEmail').prop('disabled', false));
            $('#btnCancelEmail').on('click', () => { $('#inputEmail').prop('disabled', true); });

            $('#btnSaveEmail').on('click', async () => {
                const email = $('#inputEmail').val();
                const r = await sendChangeRequest(apiSendChangePrimary, email);
                alert(r.message || (r.success ? '已寄出驗證信，完成驗證後才會更新主信箱' : '寄信失敗'));
                $('#inputEmail').prop('disabled', true);
            });

            $('#btnEditBackupEmail').on('click', () => $('#inputBackupEmail').prop('disabled', false));
            $('#btnCancelBackupEmail').on('click', () => { $('#inputBackupEmail').prop('disabled', true); });

            $('#btnSaveBackupEmail').on('click', async () => {
                const email = $('#inputBackupEmail').val();
                const r = await sendChangeRequest(apiSendChangeBackup, email);
                alert(r.message || (r.success ? '已寄出驗證信，完成驗證後才會更新備援信箱' : '寄信失敗'));
                $('#inputBackupEmail').prop('disabled', true);
            });
        }
    };
})();ㄍ