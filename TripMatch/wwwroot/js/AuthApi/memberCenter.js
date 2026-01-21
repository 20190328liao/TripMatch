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

        // 使用 namespaced events 並使用 4-args .on(event, selector, data, handler)

        $(document)
            .off('click.member', '#btnEditAvatar')
            .on('click.member', '#btnEditAvatar', null, function (e) {
                e.preventDefault();
                console.log("觸發編輯按鈕");

                // 優先找 HTML 裡的 input，找不到才動態建立
                let $input = $('#avatarInput');
                if ($input.length === 0) {
                    $input = self.getAvatarInput();
                }
                $input.trigger('click');
            });

        $(document)
            .off('change.member', '#avatarInput')
            .on('change.member', '#avatarInput', null, function (e) {
                console.log("偵測到檔案變更");
                self.handleFileSelect(e);
                $(this).val(''); // 重要：清空值，讓同一張圖可以連續觸發 change
            });

        $(document)
            .off('click.member', '#btnResetEmail')
            .on('click.member', '#btnResetEmail', null, async function (e) {
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

        // 新增：SeedDummyWishlistForTrip 的 helper 與按鈕綁定
        async function seedDummyWishlistForTrip(userId, tripId) {
            try {
                const res = await fetch('/api/MemberCenterApi/SeedDummyWishlistForTrip', {
                    method: 'POST',
                    credentials: 'include', // 必須帶 HttpOnly cookie（AuthToken）
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId, tripId: tripId })
                });

                if (res.status === 401) {
                    alert('請先登入');
                    return;
                }
                if (res.status === 403) {
                    alert('您沒有此行程的權限 (非成員)');
                    return;
                }

                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    showPopup({ title: '完成', message: '已建立假資料', type: 'success' });
                } else {
                    showPopup({ title: '錯誤', message: data.message || '操作失敗', type: 'error' });
                }
            } catch (ex) {
                console.error('SeedDummyWishlistForTrip 失敗', ex);
                alert('請稍後再試');
            }
        }

        // 範例：把按鈕綁到頁面上（請在 MemberCenter 頁面對應按鈕加入 data-userid / data-tripid）
        document.addEventListener('DOMContentLoaded', () => {
            const btn = document.querySelector('#btn_seed_dummy');
            if (!btn) return;
            btn.addEventListener('click', (e) => {
                const userId = parseInt(btn.dataset.userid || '0', 10);
                const tripId = parseInt(btn.dataset.tripid || '0', 10);
                if (!userId || !tripId) {
                    alert('缺少 userId 或 tripId');
                    return;
                }
                seedDummyWishlistForTrip(userId, tripId);
            });
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
        // 自訂名稱：若無 FullName，預設為 Email @ 前字符
        const defaultName = data.fullName || (data.email ? data.email.split('@')[0] : '未設定');
        $('#displayName').text(defaultName);
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

    // 備援信箱編輯與驗證
    const $display = $('#displayBackupEmail');
    const $input = $('#inputBackupEmail');
    const $btnEdit = $('#btnEditBackupEmail');
    const $btnSave = $('#btnSaveBackupEmail');
    const $btnCancel = $('#btnCancelBackupEmail');

    function enterEditMode() {
        const cur = $display.text().trim();
        $input.val(cur === '未設定' ? '' : cur);
        $display.addClass('d-none');
        $input.removeClass('d-none');
        // 安全且不會觸發 @types/jquery deprecated 的做法：
        const el = $input[0];
        if (el) {
            el.focus();
            el.select();
        }
        $btnEdit.addClass('d-none');
        $btnSave.removeClass('d-none').prop('disabled', true);
        $btnCancel.removeClass('d-none');
        setFieldHint('email'); // 清除提示
        validateBackupEmail(); // 立即驗證一次
    }

    function exitEditMode(apply) {
        if (!apply) {
            // 還原顯示值，不修改 server
            $input.val('');
        }
        $input.addClass('d-none');
        $display.removeClass('d-none');
        $btnEdit.removeClass('d-none');
        $btnSave.addClass('d-none').prop('disabled', false).text('寄驗證信');
        $btnCancel.addClass('d-none');
        setFieldHint('email'); // 清除提示
    }

    function validateBackupEmail() {
        const v = String($input.val() || '').trim();
        const result = window.Validator ? window.Validator.validateEmail(v) : { valid: false, message: '檢查工具不存在' };
        // 使用 helper.js 的 setFieldHint（會把 email 對應到 #emailHint）
        setFieldHint('email', result.message, result.valid ? 'success' : 'error');
        $btnSave.prop('disabled', !result.valid);
        return result.valid;
    }

    // 綁定事件（修正為 namespaced 並使用 data 參數以避免 TS/@types jquery 的 deprecated overload 警告）
    $btnEdit.off('click.member').on('click.member', null, function (e) {
        e.preventDefault();
        enterEditMode();
    });

    $btnCancel.off('click.member').on('click.member', null, function (e) {
        e.preventDefault();
        exitEditMode(false);
    });

    $input.off('input.member').on('input.member', null, function () {
        validateBackupEmail();
    });

    $btnSave.off('click.member').on('click.member', null, function (e) {
        e.preventDefault();
        const email = String($input.val() || '').trim();
        if (!validateBackupEmail()) {
            return;
        }

        $btnSave.prop('disabled', true).text('寄送中...');
        $.ajax({
            url: '/api/auth/SendBackupLookup',
            method: 'POST',
            contentType: 'application/json; charset=utf-8',
            data: JSON.stringify(email),
            xhrFields: { withCredentials: true },
            headers: { 'RequestVerificationToken': window.csrfToken || '' },
            success(res) {
                showPopup({
                    title: '驗證信已寄出',
                    message: res?.message || '已寄送驗證信至備援信箱，請至該信箱點擊連結完成驗證。',
                    type: 'success',
                    autoClose: true,
                    seconds: 3
                }).then(() => {
                    $display.text(email || '未設定');
                    exitEditMode(true);
                });
            },
            error(xhr) {
                const msg = xhr.responseJSON?.message || xhr.responseText || '寄送失敗，請稍後再試';
                showPopup({ title: '寄送失敗', message: msg, type: 'error' });
            },
            complete() {
                $btnSave.prop('disabled', false).text('寄驗證信');
            }
        });
    });

    // 自訂名稱編輯與驗證
    const $displayName = $('#displayName');
    const $inputName = $('#inputName');
    const $btnEditName = $('#btnEditName');
    const $btnSaveName = $('#btnSaveName');
    const $btnCancelName = $('#btnCancelName');

    function enterEditModeName() {
        const cur = $displayName.text().trim();
        $inputName.val(cur === '未設定' ? '' : cur);
        $displayName.addClass('d-none');
        $inputName.removeClass('d-none');
        const el = $inputName[0];
        if (el) {
            el.focus();
            el.select();
        }
        $btnEditName.addClass('d-none');
        $btnSaveName.removeClass('d-none').prop('disabled', true);
        $btnCancelName.removeClass('d-none');
        setFieldHint('name'); // 清除提示
        validateName(); // 立即驗證一次
    }

    function exitEditModeName(apply) {
        if (!apply) {
            $inputName.val('');
        }
        $inputName.addClass('d-none');
        $displayName.removeClass('d-none');
        $btnEditName.removeClass('d-none');
        $btnSaveName.addClass('d-none').prop('disabled', false).text('確認');
        $btnCancelName.addClass('d-none');
        setFieldHint('name'); // 清除提示
    }

    function validateName() {
        const v = String($inputName.val() || '').trim();
        let valid = true;
        let message = '';

        if (!v) {
            valid = false;
            message = '☐ 請輸入名稱';
        } else if (v.length > 25) {
            valid = false;
            message = '☐ 名稱長度不能超過25字';
        } else if (!/^[\u4e00-\u9fa5a-zA-Z\s]+$/.test(v)) {
            valid = false;
            message = '☐ 只能輸入中文或英文';
        } else {
            message = '☑ 名稱格式正確';
        }

        setFieldHint('name', message, valid ? 'success' : 'error');
        $btnSaveName.prop('disabled', !valid);
        return valid;
    }

    // 綁定事件
    $btnEditName.off('click.member').on('click.member', null, function (e) {
        e.preventDefault();
        enterEditModeName();
    });

    $btnCancelName.off('click.member').on('click.member', null, function (e) {
        e.preventDefault();
        exitEditModeName(false);
    });

    $inputName.off('input.member').on('input.member', null, function () {
        validateName();
    });

    $btnSaveName.off('click.member').on('click.member', null, function (e) {
        e.preventDefault();
        const name = String($inputName.val() || '').trim();
        if (!validateName()) {
            return;
        }

        $btnSaveName.prop('disabled', true).text('儲存中...');
        $.ajax({
            url: '/api/auth/UpdateFullName',
            method: 'POST',
            contentType: 'application/json; charset=utf-8',
            data: JSON.stringify({ FullName: name }),
            xhrFields: { withCredentials: true },
            headers: { 'RequestVerificationToken': window.csrfToken || '' },
            success(res) {
                showPopup({
                    title: '更新成功',
                    message: res?.message || '自訂名稱已更新',
                    type: 'success',
                    autoClose: true,
                    seconds: 2
                }).then(() => {
                    $displayName.text(name);
                    exitEditModeName(true);
                });
            },
            error(xhr) {
                const msg = xhr.responseJSON?.message || '更新失敗';
                showPopup({ title: '更新失敗', message: msg, type: 'error' });
            },
            complete() {
                $btnSaveName.prop('disabled', false).text('確認');
            }
        });
    });

    // 匯入 JSON 日曆上傳處理 - 顯示結果在頁面取代 alert
    (function () {
        const btn = document.getElementById('btnImportCalendar');
        const input = document.getElementById('importCalendarInput');
        const message = document.getElementById('importCalendarMessage');

        if (!btn || !input || !message) return;

        function showMessage(text, type = 'info') {
            message.classList.remove('d-none','alert-success','alert-danger','alert-info');
            if (type === 'success') message.classList.add('alert-success');
            else if (type === 'error') message.classList.add('alert-danger');
            else message.classList.add('alert-info');
            message.textContent = text;
        }

        btn.addEventListener('click', () => input.click());

        input.addEventListener('change', async (ev) => {
            const file = ev.target.files && ev.target.files[0];
            if (!file) return showMessage('未選擇檔案', 'error');

            if (!file.name.toLowerCase().endsWith('.json')) {
                return showMessage('請選擇 .json 檔案', 'error');
            }

            const fd = new FormData();
            fd.append('file', file);

            btn.disabled = true;
            showMessage('上傳中，請稍候...', 'info');

            try {
                const resp = await fetch('/api/auth/ImportCalendarJson', {
                    method: 'POST',
                    body: fd,
                    credentials: 'include' // 確保 cookie/jwt 一併送出
                });

                let json;
                try { json = await resp.json(); } catch { json = null; }

                if (!resp.ok) {
                    const msg = json?.message ?? `上傳失敗 (狀態 ${resp.status})`;
                    showMessage(msg, 'error');
                } else {
                    const msg = json?.message ?? '已匯入日曆';
                    showMessage(msg, 'success');
                }

                // 在上傳回應處理位置加入：將 acceptedDates 標示為新提交（submitted-new），並顯示被拒日期
                async function handleImportResponse(json) {
                    const accepted = json?.acceptedDates || [];
                    const rejected = json?.rejectedDates || [];

                    // 標示日曆上新提交（若 Calendar 有對應 API，優先使用）
                    if (window.Calendar && typeof window.Calendar.markSubmittedNew === 'function') {
                        try { window.Calendar.markSubmittedNew(accepted); } catch (e) { console.warn(e); }
                    } else {
                        // 以 DOM 加 class 的 fallback（假設日曆每個格都有 data-date="yyyy-MM-dd"）
                        accepted.forEach(date => {
                            const el = document.querySelector(`.day-cell[data-date="${date}"]`);
                            if (el) el.classList.add('submitted-new');
                        });
                        // 把 accepted 加到右側清單
                        const list = document.getElementById('calendarList');
                        if (list) {
                            accepted.forEach(d => {
                                const item = document.createElement('div');
                                item.className = 'calendar-range-item submitted-new';
                                item.textContent = d;
                                list.prepend(item); // 置頂
                            });
                        }

                        // 顯示被拒絕的日期（可選）
                        if (rejected && rejected.length) {
                            const rejList = document.getElementById('importCalendarRejected');
                            if (rejList) {
                                rejList.innerHTML = '';
                                rejected.forEach(d => {
                                    const it = document.createElement('div');
                                    it.className = 'calendar-range-item rejected';
                                    it.textContent = d;
                                    rejList.appendChild(it);
                                });
                            }
                        }
                    }
                } // end handleImportResponse

                try {
                    await handleImportResponse(json);
                } catch (e) {
                    console.warn('handleImportResponse failed', e);
                }
            } catch (ex) {
                console.error('上傳處理發生例外', ex);
                showMessage('上傳失敗，請稍後再試', 'error');
            } finally {
                btn.disabled = false;
                try { input.value = ''; } catch { /* ignore */ }
            }
        }); // end input.change

        // End 匯入 JSON 日曆上傳處理 IIFE
    })();

    // 如果頁面含 MemberCenter DOM，初始化 MemberProfile
    if (hasMemberCenterDom) {
        MemberProfile.init();
    }

    // === 新增：處理 URL query 的 backupVerified 參數，顯示 popup 提示 ===
    async function handleBackupVerifiedQuery() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (!params.has('backupVerified')) return;

            const raw = params.get('backupVerified') || '';
            // 判斷：'1' 或數字 userId (>0) 視為成功；'0' 或 空字串 視為失敗
            let success = false;
            if (raw === '1') success = true;
            else {
                const n = parseInt(raw, 10);
                if (!isNaN(n) && n > 0) success = true;
            }

            let message = success ? '備援信箱驗證成功' : '備援信箱驗證失敗或連結無效';

            // 嘗試呼叫後端以取得更詳細資訊（例如 accountEmail / lookupEmail）
            try {
                const api = window.Routes?.AuthApi?.GetBackupLookupResult ?? '/api/auth/GetBackupLookupResult';
                const res = await fetch(api, { credentials: 'include' });
                if (res.ok) {
                    const j = await res.json().catch(() => null);
                    if (j && j.found) {
                        if (j.accountEmail) {
                            message = success ? `備援信箱已驗證，主帳號：${j.accountEmail}` : (j.message || message);
                        } else if (j.lookupEmail) {
                            message = success ? `備援信箱 ${j.lookupEmail} 已驗證` : message;
                        }
                    }
                }
            } catch (e) {
                // 不阻塞主流程，保留預設訊息
                console.warn('GetBackupLookupResult failed', e);
            }

            if (typeof window.showPopup === 'function') {
                await window.showPopup({
                    title: success ? '驗證成功' : '驗證失敗',
                    message,
                    type: success ? 'success' : 'error',
                    autoClose: true,
                    seconds: 4
                });
            } else {
                alert(message);
            }

            // 移除 URL 中的參數以避免刷新後重複提示
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('backupVerified');
                window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
            } catch (e) {
                // ignore
            }
        } catch (ex) {
            console.warn('handleBackupVerifiedQuery error', ex);
        }
    }

    // 立即執行一次（只在 MemberCenter 頁面有意義）
    handleBackupVerifiedQuery();
}); // end DOMReady