const MemberProfile = {
    init() {
        console.log("MemberProfile 初始化開始");
        this.cacheDOM();
        this.bindEvents();
        this.loadProfile();
    },

    cacheDOM() {
        this.$avatarImg = $('#memberAvatar');
        this.$navAvatar = $('#navAvatar');
        this.$avatarInput = $('#avatarInput');
        this.$emailText = $('#displayEmail');
        this.$backupEmailText = $('#displayBackupEmail');
    },

    bindEvents() {
        const self = this;

        // 使用 .off().on() 確保不會因為多次 init 導致事件重複觸發
        $(document).off('click', '#btnEditAvatar').on('click', '#btnEditAvatar', function (e) {
            e.preventDefault();
            console.log("觸發編輯按鈕");

            // 優先找 HTML 裡的 input，找不到才動態建立
            let $input = $('#avatarInput');
            if ($input.length === 0) {
                $input = self.getAvatarInput();
            }
            $input.trigger('click');
        });

        $(document).off('change', '#avatarInput').on('change', '#avatarInput', function (e) {
            console.log("偵測到檔案變更");
            self.handleFileSelect(e);
            $(this).val(''); // 重要：清空值，讓同一張圖可以連續觸發 change
        });

        Calendar.init({
            lockedRanges: [
                { start: '2026-01-10', end: '2026-01-12' }
            ]
        });

        // 注意：登出事件已統一放到 logout.js，避免重複或衝突綁定
    },

    getAvatarInput() {
        let $input = $('#avatarInput');
        if ($input.length === 0) {
            $input = $('<input type="file" id="avatarInput" accept="image/jpeg,image/png,image/gif,image/webp">')
                .css({ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' })
                .appendTo('body');
        }
        return $input;
    },

    async loadProfile() {
        try {
            const url = window.Routes?.AuthApi?.GetMemberProfile ?? window.Routes?.AuthApi?.MemberCenter ?? '/api/auth/GetMemberProfile';
            const response = await $.ajax({
                url: url,
                method: 'GET',
                xhrFields: { withCredentials: true }
            });
            if (response.success) {
                this.updateUI(response);
            }
        } catch (error) {
            console.error('載入會員資料失敗:', error);
            if (error.status === 401) window.location.href = window.Routes?.Auth?.Login ?? '/Auth/Login';
        }
    },

    updateUI(data) {
        const defaultImg = '/img/default_avatar.png';
        const imgUrl = data.avatar || defaultImg;
        // 會員中心內的預覽元素由此更新（全站 navbar 的 avatar 由 avatar.js 處理，避免重複 API 呼叫）
        this.$avatarImg.attr('src', imgUrl);
        this.$emailText.text(data.email || '未設定');
        this.$backupEmailText.text(data.backupEmail || '未設定');
    },

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 檔案格式與大小檢查
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('僅支援 JPG、PNG、GIF、WebP');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            alert('檔案大小不能超過 2MB');
            return;
        }

        // 預覽與上傳
        const objectUrl = URL.createObjectURL(file);
        this.$avatarImg.attr('src', objectUrl);
        await this.uploadAvatar(file, objectUrl);
    },

    async uploadAvatar(file, objectUrl) {
        if (!window.Routes?.AuthApi?.UploadAvatar) {
            alert('伺服器未提供頭像上傳接口，請聯絡管理員。');
            URL.revokeObjectURL(objectUrl);
            this.loadProfile();
            return;
        }

        const formData = new FormData();
        formData.append('avatarFile', file);

        try {
            const response = await $.ajax({
                url: window.Routes.AuthApi.UploadAvatar,
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                xhrFields: { withCredentials: true }
            });

            if (response.success) {
                const newUrl = response.avatarUrl + '?v=' + Date.now();
                // 上傳成功需即時更新會員中心預覽
                $('#memberAvatar').attr('src', newUrl);
                // navbar 也立刻更新（上傳動作是使用者觸發，應即時反映）
                $('#navAvatar').attr('src', newUrl);
            }
        } catch (xhr) {
            alert(xhr.responseJSON?.message || '上傳失敗');
            this.loadProfile();
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    },

    async handleLogout() {
        if (!confirm("確定要登出嗎？")) return;
        try {
            await $.ajax({
                url: window.Routes.AuthApi.Logout,
                method: 'POST',
                xhrFields: { withCredentials: true }
            });
            window.location.href = '/';
        } catch (error) {
            alert('登出失敗');
        }
    }
};

// DOMReady：只初始化一次
$(function () {
    MemberProfile.init();

    // 密碼變更事件（修正為使用 AuthApi 的 ChangePassword）
    $("#btnChangePwd").off('click').on("click", function () {
        const oldPwd = $("#cp_old").val();
        const newPwd = $("#cp_new").val();
        const confirmPwd = $("#cp_confirm").val();

        if (!oldPwd || !newPwd || !confirmPwd) {
            alert("請完整填寫欄位");
            return;
        }
        if (newPwd !== confirmPwd) {
            alert("新密碼與確認不符");
            return;
        }

        const $btn = $(this);
        $btn.prop("disabled", true).text("處理中...");

        $.ajax({
            type: "POST",
            url: window.Routes.Auth.ChangePassword || window.Routes.AuthApi.ChangePassword,
            contentType: "application/json",
            data: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd, confirmPassword: confirmPwd }),
            success: function (res) {
                alert(res.message || "密碼已變更");
                $("#cp_old, #cp_new, #cp_confirm").val("");
            },
            error: function (err) {
                alert(err.responseJSON?.message || "變更失敗");
            },
            complete: function () {
                $btn.prop("disabled", false).text("變更密碼");
            }
        });
    });
});

async function loadMemberProfile() {
    try {
        const url = window.Routes?.AuthApi?.GetMemberProfile ?? window.Routes?.AuthApi?.MemberCenter ?? '/api/auth/GetMemberProfile';
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include', // 若使用 cookie-based auth，帶上 credentials
            headers: { 'Accept': 'application/json' }
        });

        if (res.status === 401) {
            // 尚未登入：在首頁不應該讓請求中斷整個腳本，顯示匿名頭像或引導登入
            showAnonymousAvatar();
            return;
        }

        if (!res.ok) {
            console.error('取得會員資料失敗', res.status);
            showAnonymousAvatar();
            return;
        }

        const profile = await res.json();
        renderAvatar(profile);
    } catch (err) {
        console.error('載入會員資料發生錯誤', err);
        showAnonymousAvatar();
    }
}

function showAnonymousAvatar() {
    const img = document.querySelector('#memberAvatar');
    if (img) img.src = '/images/default-avatar.png';
}

function renderAvatar(profile) {
    const img = document.querySelector('#memberAvatar');
    if (img && profile?.avatarUrl) img.src = profile.avatarUrl;
}