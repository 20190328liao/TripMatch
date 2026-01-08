/**
 * 會員中心模組
 */
const MemberProfile = {
    // 初始化
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadProfile();
    },

    // 快取 jQuery 物件，避免重複查找 DOM
    cacheDOM() {
        this.$avatarImg = $('#memberAvatar');
        this.$navAvatar = $('#navAvatar');
        this.$avatarInput = $('#avatarInput');
        this.$emailText = $('#displayEmail');
        this.$backupEmailText = $('#displayBackupEmail');
    },

    // 事件綁定
    bindEvents() {
        // 點擊按鈕觸發隱藏的 input:file
        $('#btnEditAvatar').on('click', () => this.$avatarInput.click());

        // 檔案選擇變更
        this.$avatarInput.on('change', (e) => this.handleFileSelect(e));

        // 登出按鈕
        $('#btnLogout').on('click', () => this.handleLogout());
    },

    // 取得會員資料
    async loadProfile() {
        try {
            const response = await $.ajax({
                url: window.Routes.AuthApi.GetMemberProfile,
                method: 'GET',
                xhrFields: {
                    withCredentials: true  // ★ 確保攜帶 Cookie
                }
            });
            if (response.success) {
                this.updateUI(response);
            }
        } catch (error) {
            console.error('載入會員資料失敗:', error);
            // 如果是 401，可能需要重新登入
            if (error.status === 401) {
                window.location.href = window.Routes.Auth.Login;
            }
        }
    },

    // 更新介面
    updateUI(data) {
        this.$avatarImg.attr('src', data.avatar || '/img/default_avatar.png');
        this.$navAvatar.attr('src', data.avatar || '/img/default_avatar.png');
        this.$emailText.text(data.email || '未設定');
        this.$backupEmailText.text(data.backupEmail || '未設定');
    },

    // 處理檔案選擇
    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 前端初步驗證
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif',];
        if (!allowedTypes.includes(file.type)) {
            alert('僅支援 JPG、PNG、GIF');
            return;
        }

        // 限制 2MB (對應後端的限制)
        if (file.size > 2 * 1024 * 1024) {
            alert('檔案大小不能超過 2MB');
            return;
        }

        // 1. 立即預覽 (現代做法：Object URL)
        const objectUrl = URL.createObjectURL(file);
        this.$avatarImg.attr('src', objectUrl);

        // 2. 執行上傳
        await this.uploadAvatar(file, objectUrl);
    },

    // 上傳頭像 API
    async uploadAvatar(file, objectUrl) {
        const formData = new FormData();
        formData.append('avatarFile', file);

        try {
            const response = await $.ajax({
                url: window.Routes.AuthApi.UploadAvatar,
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                xhrFields: {
                    withCredentials: true  // ★ 確保攜帶 Cookie
                }
            });

            if (response.success) {
                this.$avatarImg.attr('src', response.avatarUrl);
                this.$navAvatar.attr('src', response.avatarUrl);
                alert('頭像上傳成功！');
            }
        } catch (xhr) {
            const errorMsg = xhr.responseJSON?.message || '上傳失敗';
            alert(errorMsg);
            this.loadProfile();
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    },

    // 登出處理
    async handleLogout() {
        try {
            await $.ajax({
                url: window.Routes.AuthApi.Logout,
                method: 'POST',
                xhrFields: {
                    withCredentials: true  // ★ 確保攜帶 Cookie
                }
            });
            window.location.href = '/';
        } catch (error) {
            alert('登出失敗');
        }
    }
};

// 密碼變更
$(function () {
    $("#btnChangePwd").on("click", function () {
        const oldPwd = $("#cp_old").val();
        const newPwd = $("#cp_new").val();
        const confirm = $("#cp_confirm").val();

        if (!oldPwd || !newPwd || !confirm) {
            showPopup({ title: "提示", message: "請完整填寫欄位", type: "error" });
            return;
        }
        if (newPwd !== confirm) {
            showPopup({ title: "提示", message: "新密碼與確認不符", type: "error" });
            return;
        }

        // 可額外用 Validator.validatePassword(newPwd) 先在前端檢查格式
        const pwdResult = Validator.validatePassword(newPwd);
        if (!pwdResult.valid) {
            setFieldHint("password", pwdResult.message, "error");
            return;
        }

        const $btn = $(this);
        $btn.prop("disabled", true).text("處理中...");

        $.ajax({
            type: "POST",
            url: window.Routes.Auth.ChangePassword,
            contentType: "application/json",
            data: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd, confirmPassword: confirm }),
            success: function (res) {
                showPopup({ title: "成功", message: res.message || "密碼已變更", type: "success" }).then(() => {
                    // 可選：清空欄位
                    $("#cp_old, #cp_new, #cp_confirm").val("");
                    $btn.prop("disabled", false).text("變更密碼");
                });
            },
            error: function (err) {
                $btn.prop("disabled", false).text("變更密碼");
                const msg = err.responseJSON?.message || "變更失敗";
                showPopup({ title: "錯誤", message: msg, type: "error" });
            }
        });
    });
});

// DOM Ready
$(() => MemberProfile.init());