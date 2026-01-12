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

    //主信箱編輯按鈕事件
    function toggleEmailEdit(show) {
        $("#displayEmail").toggleClass("d-none", show);
        $("#inputEmail").toggleClass("d-none", !show);
        $("#btnEditEmail").toggleClass("d-none", show);
        $("#btnSaveEmail, #btnCancelEmail").toggleClass("d-none", !show);
        if (show) {
            $("#inputEmail").val($("#displayEmail").text().trim());
            $("#inputEmail").trigger("focus");
        }
    }

    // 備援信箱編輯按鈕事件
    function toggleBackupEmailEdit(show) {
        $("#displayBackupEmail").toggleClass("d-none", show);
        $("#inputBackupEmail").toggleClass("d-none", !show);
        $("#btnEditBackupEmail").toggleClass("d-none", show);
        $("#btnSaveBackupEmail, #btnCancelBackupEmail").toggleClass("d-none", !show);
        if (show) {
            $("#inputBackupEmail").val($("#displayBackupEmail").text().trim());
            $("#inputEmail").trigger("focus");
        }
    }

    //驗證email格式:使用 helper.js 的 Validator（有則使用）
    function isValidEmail(email) {
        if (window.Validator && typeof window.Validator.validateEmail === 'function') {
            return window.Validator.validateEmail(email).valid;
        }
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    $(document).on('click', '#btnEditEmail', function (e) {
        e.preventDefault();
        toggleEmailEdit(true);
    });
    $(document).on('click', '#btnCancelEmail', function (e) {
        e.preventDefault();
        toggleEmailEdit(false);
    });

    $(document).on('click', '#btnEditBackupEmail', function (e) {
        e.preventDefault();
        toggleBackupEmailEdit(true);
    });
    $(document).on('click', '#btnCancelBackupEmail', function (e) {
        e.preventDefault();
        toggleBackupEmailEdit(false);
    });

    // 主信箱儲存事件（type = 'primary'）
    $(document).on('click', '#btnSaveEmail', async function (e) {
        e.preventDefault();
        const newEmail = $("#inputEmail").val().trim();
        if (!isValidEmail(newEmail)) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '格式錯誤', message: '請輸入有效的電子郵件地址', type: 'error' });
            } else {
                alert("請輸入有效的電子郵件地址");
            }
            return;
        }

        const $btn = $(this).prop("disabled", true).text("處理中...");
        try {
            // 修正後的 POST 呼叫：確保路徑正確、帶上 cookie 並在成功後導回會員中心
            const res = await fetch('/api/MemberCenterApi/RequestChangeEmail', {
                method: 'POST',
                credentials: 'include', // 若使用 cookie-based auth，需帶上
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newEmail, type: "primary" })
            });

            // 如果回應非 2xx，嘗試解析 JSON 錯誤訊息，否則拋出
            if (!res.ok) {
                let errText = await res.text();
                try {
                    const errJson = JSON.parse(errText);
                    throw new Error(errJson.message ?? JSON.stringify(errJson));
                } catch {
                    throw new Error(errText || `HTTP ${res.status}`);
                }
            }

            // 成功：顯示訊息並導回會員中心（類似註冊驗證信 UI）
            const data = await res.json();
            alert(data.message ?? '驗證信已寄出，請前往信箱確認。');
            window.location.href = '/Auth/MemberCenter?msg=email_sent';
        } catch (ex) {
            console.error('變更主信箱失敗', ex);
            alert('變更主信箱失敗：' + (ex.message ?? ex));
        } finally {
            $btn.prop("disabled", false).text("寄驗證信");
        }
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

    // 密碼變更事件（修正為使用 AuthApi 的 ChangePassword）
    $("#btnChangePwd").off('click').on("click", function () {
        const oldPwd = $("#cp_old").val();
        const newPwd = $("#cp_new").val();
        const confirmPwd = $("#cp_confirm").val();

        if (!oldPwd || !newPwd || !confirmPwd) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '提示', message: '請完整填寫欄位', type: 'error' });
            } else {
                alert("請完整填寫欄位");
            }
            return;
        }
        if (newPwd !== confirmPwd) {
            if (typeof window.showPopup === 'function') {
                window.showPopup({ title: '提示', message: '新密碼與確認不符', type: 'error' });
            } else {
                alert("新密碼與確認不符");
            }
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
                if (typeof window.showPopup === 'function') {
                    window.showPopup({ title: '成功', message: res.message || "密碼已變更", type: 'success' });
                } else {
                    alert(res.message || "密碼已變更");
                }
                $("#cp_old, #cp_new, #cp_confirm").val("");
            },
            error: function (err) {
                const msg = err.responseJSON?.message || "變更失敗";
                if (typeof window.showPopup === 'function') {
                    window.showPopup({ title: '錯誤', message: msg, type: 'error' });
                } else {
                    alert(msg);
                }
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