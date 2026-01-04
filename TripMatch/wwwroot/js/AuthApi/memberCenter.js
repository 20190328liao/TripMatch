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
            const response = await $.get('/AuthApi/GetMemberProfile');
            if (response.success) {
                this.updateUI(response);
            }
        } catch (error) {
            console.error('載入會員資料失敗:', error);
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
                url: '/AuthApi/UploadAvatar',
                method: 'POST',
                data: formData,
                processData: false, // 必備：告訴 jQuery 不要處理資料
                contentType: false  // 必備：告訴 jQuery 不要設定 Content-Type
            });

            if (response.success) {
                // 上傳成功，更新為後端回傳的正式路徑
                this.$avatarImg.attr('src', response.avatarUrl);
                this.$navAvatar.attr('src', response.avatarUrl);
                alert('頭像上傳成功！');
            }
        } catch (xhr) {
            const errorMsg = xhr.responseJSON?.message || '上傳失敗';
            alert(errorMsg);
            // 失敗時還原回舊頭像
            this.loadProfile();
        } finally {
            // 釋放記憶體
            URL.revokeObjectURL(objectUrl);
        }
    },

    // 登出處理
    async handleLogout() {
        try {
            await $.post('/AuthApi/Logout');
            window.location.href = '/';
        } catch (error) {
            alert('登出失敗');
        }
    }
};

// DOM Ready
$(() => MemberProfile.init());