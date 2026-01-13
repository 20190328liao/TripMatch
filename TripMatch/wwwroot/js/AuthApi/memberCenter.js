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
        this.primaryEmail = ''; // 快取主信箱
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

        // 新增：刪除帳號（重設帳號）按鈕行為
        $(document).off('click', '#btnResetEmail').on('click', '#btnResetEmail', async function (e) {
            e.preventDefault();
            // Step1：基本確認
            if (!confirm("你即將刪除目前帳號並導向註冊頁面。刪除後所有個人資料將被移除。是否繼續？")) return;

            // Step2：是否先匯出日曆
            if (confirm("是否要先匯出日曆資料（JSON）？按「確定」會先下載日曆資料，再執行刪除；按「取消」直接刪除。")) {
                try {
                    const leavesRes = await fetch('/api/auth/GetLeaves', { method: 'GET', credentials: 'include' });
                    if (leavesRes.ok) {
                        const json = await leavesRes.json();
                        const filename = `calendar_export_${(self.primaryEmail||'me').replace(/[^a-z0-9@._-]/ig,'')}_${new Date().toISOString().slice(0,10)}.json`;
                        const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        URL.revokeObjectURL(url);
                        a.remove();
                    } else {
                        console.warn('匯出日曆失敗', leavesRes.status);
                        alert('匯出日曆失敗，將直接進行刪除。');
                    }
                } catch (ex) {
                    console.error('匯出日曆發生錯誤', ex);
                    alert('匯出過程發生錯誤，將直接進行刪除。');
                }
            }

            // Step3：呼叫刪除 API
            try {
                const res = await fetch('/api/MemberCenterApi/DeleteAccount', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    alert(data.message || '帳號已刪除，即將導向註冊頁');
                    window.location.href = data.redirect || '/Auth/Signup';
                } else {
                    alert(data.message || '刪除帳號失敗，請聯絡管理員');
                }
            } catch (ex) {
                console.error('刪除帳號失敗', ex);
                alert('刪除帳號失敗，請稍後再試');
            }
        });

        // 安全呼叫 Calendar：如果 library 尚未載入，避免拋錯
        try {
            if (typeof Calendar !== 'undefined' && Calendar && typeof Calendar.init === 'function') {
                Calendar.init({
                    lockedRanges: [
                        { start: '2026-01-10', end: '2026-01-12' }
                    ]
                });
            } else {
                console.warn('Calendar 未載入，跳過日曆初始化。若需日曆功能，請在 layout 或頁面載入相對應的腳本。');
            }
        } catch (ex) {
            console.error('初始化 Calendar 發生例外，已忽略：', ex);
        }

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
        this.primaryEmail = data.email || '';
        // 禁止在 UI 上編輯主信箱：隱藏/移除相關編輯按鈕與輸入框，避免誤用
        $('#btnEditEmail, #btnSaveEmail, #btnCancelEmail, #inputEmail').addClass('d-none');
    },

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 檔案格式與大小檢查
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '檔案格式錯誤', message: '僅支援 JPG、PNG、GIF、WebP', type: 'error', autoClose: true, seconds: 3 });
            } else {
                alert('僅支援 JPG、PNG、GIF、WebP');
            }
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '檔案過大', message: '檔案大小不能超過 2MB', type: 'error', autoClose: true, seconds: 3 });
            } else {
                alert('檔案大小不能超過 2MB');
            }
            return;
        }

        // 預覽與上傳
        const objectUrl = URL.createObjectURL(file);
        this.$avatarImg.attr('src', objectUrl);
        await this.uploadAvatar(file, objectUrl);
    },

    async uploadAvatar(file, objectUrl) {
        if (!window.Routes?.AuthApi?.UploadAvatar) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '錯誤', message: '伺服器未提供頭像上傳接口，請聯絡管理員。', type: 'error' });
            } else {
                alert('伺服器未提供頭像上傳接口，請聯絡管理員。');
            }
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
                if (typeof window.showPopup === 'function') {
                    window.showPopup({ title: '上傳成功', message: '頭像已上傳。', type: 'success', autoClose: true, seconds: 2 });
                }
            }
        } catch (xhr) {
            const msg = xhr?.responseJSON?.message || '上傳失敗';
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '上傳失敗', message: msg, type: 'error' });
            } else {
                alert(msg);
            }
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
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '登出失敗', message: '登出失敗，請稍後再試。', type: 'error' });
            } else {
                alert('登出失敗');
            }
        }
    }
};

// DOMReady：只初始化一次
$(function () {
    const hasMemberCenterDom =
        $('#memberAvatar').length > 0 ||
        $('#profile_section').length > 0 ||
        $('#calendar_section').length > 0 ||
        $('#wishlist_section').length > 0;

    // 備援信箱編輯按鈕事件（保留原行為）
    function toggleBackupEmailEdit(show) {
        $("#displayBackupEmail").toggleClass("d-none", show);
        $("#inputBackupEmail").toggleClass("d-none", !show);
        $("#btnEditBackupEmail").toggleClass("d-none", show);
        $("#btnSaveBackupEmail, #btnCancelBackupEmail").toggleClass("d-none", !show);
        if (show) {
            $("#inputBackupEmail").val($("#displayBackupEmail").text().trim());
            $("#inputBackupEmail").trigger("focus");
        }
    }

    //驗證email格式:使用 helper.js 的 Validator（有則使用）
    function isValidEmail(email) {
        if (window.Validator && typeof window.Validator.validateEmail === 'function') {
            return window.Validator.validateEmail(email).valid;
        }
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    $(document).on('click', '#btnEditBackupEmail', function (e) {
        e.preventDefault();
        toggleBackupEmailEdit(true);
    });
    $(document).on('click', '#btnCancelBackupEmail', function (e) {
        e.preventDefault();
        toggleBackupEmailEdit(false);
    });

    // 備援信箱儲存事件（type = 'backup'）
    $(document).on('click', '#btnSaveBackupEmail', async function (e) {
        e.preventDefault();
        const newEmail = $("#inputBackupEmail").val().trim();
        if (!isValidEmail(newEmail)) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '格式錯誤', message: '請輸入有效的電子郵件地址', type: 'error' });
            } else {
                alert("請輸入有效的電子郵件地址");
            }
            return;
        }

        // 前端禁止把主信箱當備援（減少不必要的 server 呼叫）
        const primary = $("#displayEmail").text().trim();
        if (primary && primary.toLowerCase() === newEmail.toLowerCase()) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '錯誤', message: '備援信箱不得與主信箱相同', type: 'error' });
            } else {
                alert('備援信箱不得與主信箱相同');
            }
            return;
        }

        const $btn = $(this).prop("disabled", true).text("處理中...");
        try {
            const url = window.Routes?.MemberCenterApi?.RequestChangeEmail || '/api/MemberCenterApi/RequestChangeEmail';
            const res = await fetch(url, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newEmail: newEmail, type: "backup" })
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                if (typeof window.showPopup === 'function') {
                    window.showPopup({ title: '已寄出', message: '備援驗證信已送出，請至新信箱收取驗證信完成變更。', type: 'success', autoClose: true, seconds: 3 });
                } else {
                    alert("備援驗證信已送出，請至新信箱收取驗證信完成變更。");
                }
                toggleBackupEmailEdit(false);
            } else {
                const msg = json?.message || '寄送驗證信失敗';
                if (typeof window.showPopup === 'function') {
                    window.showPopup({ title: '寄送失敗', message: msg, type: 'error' });
                } else {
                    alert(msg);
                }
            }
        } catch (ex) {
            console.error("變更備援信箱失敗", ex);
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '錯誤', message: '變更備援信箱失敗，請稍後再試。', type: 'error' });
            } else {
                alert("變更備援信箱失敗，請稍後再試。");
            }
        } finally {
            $btn.prop("disabled", false).text("寄驗證信");
        }
    });

    // 初始化 MemberProfile（如有 DOM）
    if (hasMemberCenterDom && typeof MemberProfile !== 'undefined' && MemberProfile && typeof MemberProfile.init === 'function') {
        MemberProfile.init();
    }
});