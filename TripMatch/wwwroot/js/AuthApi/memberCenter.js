/* Member center front-end
   已整合匯出日曆功能至此檔（之前在 memberCalendar-export.js），
   並修正匯入按鈕重複上傳的問題（加入全域鎖），以及修復檔案視窗開啟兩次的問題。
*/

(function () {
    'use strict';

    // 防重複匯入鎖 (避免同一檔案 change 事件被多個 handler 觸發時上傳兩次)
    window._calendar_import_inflight = window._calendar_import_inflight || false;

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

            // ★★★ 重設帳號按鈕邏輯 ★★★
            $(document)
                .off('click.member', '#btnResetEmail')
                .on('click.member', '#btnResetEmail', null, async function (e) {
                    e.preventDefault();

                    // Step1：基本確認
                    if (!confirm("你即將刪除目前帳號並導向註冊頁面。刪除後所有個人資料將被移除。是否繼續？")) return;

                    // 匯出 helper (改為純前端生成 Blob 下載，與 btnExportCalendar 邏輯一致)
                    function triggerExportDownload(callback) {
                        try {
                            const payload = {
                                exportedAt: new Date().toISOString(),
                                source: 'member_center'
                            };

                            // 嘗試從 Calendar 物件取得最新狀態
                            if (window.Calendar && typeof window.Calendar.getSelected === 'function') {
                                try {
                                    const sel = window.Calendar.getSelected();
                                    payload.singles = sel.singles || [];
                                    payload.ranges = sel.ranges || [];
                                    payload.submitted = sel.submitted || [];
                                } catch (e) { }
                            } else {
                                // fallback: 嘗試從 sessionStorage 讀取
                                try {
                                    const rawDraft = sessionStorage.getItem('calendar_draft_ranges') || sessionStorage.getItem('calendar_imported_ranges') || sessionStorage.getItem('calendar_draft');
                                    if (rawDraft) {
                                        const parsed = JSON.parse(rawDraft);
                                        payload.ranges = parsed.ranges || parsed.draft || [];
                                        payload.dates = parsed.dates || parsed.singles || [];
                                    } else {
                                        payload.ranges = [];
                                        payload.dates = [];
                                    }
                                } catch (e) {
                                    payload.ranges = [];
                                    payload.dates = [];
                                }
                            }

                            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            const fname = `calendar_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
                            a.download = fname;
                            document.body.appendChild(a);
                            a.click();

                            // 清理並執行 callback
                            setTimeout(() => {
                                try { URL.revokeObjectURL(url); } catch { }
                                try { a.remove(); } catch { }
                                if (typeof callback === 'function') callback();
                            }, 500); // 給予一點緩衝時間讓瀏覽器開始下載

                        } catch (ex) {
                            console.error('triggerExportDownload failed', ex);
                            alert('匯出失敗，將直接進行刪除程序。');
                            if (typeof callback === 'function') callback();
                        }
                    }

                    // 刪除 helper
                    async function submitDeleteForm() {
                        try {
                            const res = await fetch('/api/MemberCenterApi/DeleteAccount', {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                    'X-Requested-With': 'XMLHttpRequest',
                                    'Accept': 'application/json'
                                }
                            });

                            let data = null;
                            try { data = await res.json(); } catch { data = null; }

                            if (res.ok) {
                                const message = (data && (data.message || data.success && data.message)) || '刪除成功';
                                const redirect = (data && data.redirect) || (window.Routes && window.Routes.Auth && window.Routes.Auth.Signup) || '/Auth/Signup';

                                if (typeof window.showPopup === 'function') {
                                    try {
                                        await window.showPopup({ title: '刪除成功', message: message, type: 'success', autoClose: true, seconds: 3 });
                                    } catch { /* ignore */ }
                                } else {
                                    alert(message);
                                }
                                window.location.href = redirect;
                                return;
                            }

                            const errMsg = (data && data.message) || `刪除失敗 (狀態 ${res.status})`;
                            if (typeof window.showPopup === 'function') {
                                window.showPopup({ title: '刪除失敗', message: errMsg, type: 'error' });
                            } else {
                                alert(errMsg);
                            }
                        } catch (ex) {
                            console.error('submitDeleteForm failed', ex);
                            if (typeof window.showPopup === 'function') {
                                window.showPopup({ title: '刪除失敗', message: '刪除請求發生錯誤，請稍後再試。', type: 'error' });
                            } else {
                                alert('刪除請求發生錯誤，請稍後再試。');
                            }
                        }
                    }

                    // Step2：是否先匯出日曆
                    if (confirm("是否要先匯出日曆資料（JSON）？按「確定」會先下載日曆資料，再執行刪除；按「取消」直接刪除。")) {
                        triggerExportDownload(() => {
                            // 下載觸發後，再次確認以防使用者反悔，或等待下載完成
                            // 使用 setTimeout 確保 confirm 在下載動作後跳出
                            setTimeout(() => {
                                if (!confirm("匯出已啟動（若未開始請檢查瀏覽器攔截）。\n\n是否繼續執行刪除帳號？（刪除後無法復原）")) return;
                                submitDeleteForm();
                            }, 100);
                        });
                    } else {
                        submitDeleteForm();
                    }
                });

            // SeedDummyWishlistForTrip
            async function seedDummyWishlistForTrip(userId, tripId) {
                try {
                    const res = await fetch('/api/MemberCenterApi/SeedDummyWishlistForTrip', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: userId, tripId: tripId })
                    });

                    if (res.status === 401) { alert('請先登入'); return; }
                    if (res.status === 403) { alert('您沒有此行程的權限 (非成員)'); return; }

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

            // 安全呼叫 Calendar
            try {
                if (typeof Calendar !== 'undefined' && Calendar && typeof Calendar.init === 'function') {
                    Calendar.init({
                        lockedRanges: [
                            { start: '2026-01-10', end: '2026-01-12' }
                        ],
                        editMode: true
                    });
                } else {
                    console.warn('Calendar 未載入，跳過日曆初始化。');
                }
            } catch (ex) {
                console.error('初始化 Calendar 發生例外，已忽略：', ex);
            }
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
            this.$avatarImg.attr('src', imgUrl);
            this.$emailText.text(data.email || '未設定');
            this.$backupEmailText.text(data.backupEmail || '未設定');
            this.primaryEmail = data.email || '';
            const defaultName = data.fullName || (data.email ? data.email.split('@')[0] : '未設定');
            $('#displayName').text(defaultName);
            $('#btnEditEmail, #btnSaveEmail, #btnCancelEmail, #inputEmail').addClass('d-none');
        },

        async handleFileSelect(e) {
            const file = e.target.files[0];
            if (!file) return;

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
                    $('#memberAvatar').attr('src', newUrl);
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
                alert('登出失敗');
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

        // 備援信箱
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
            const el = $input[0];
            if (el) { el.focus(); el.select(); }
            $btnEdit.addClass('d-none');
            $btnSave.removeClass('d-none').prop('disabled', true);
            $btnCancel.removeClass('d-none');
            setFieldHint('email');
            validateBackupEmail();
        }

        function exitEditMode(apply) {
            if (!apply) { $input.val(''); }
            $input.addClass('d-none');
            $display.removeClass('d-none');
            $btnEdit.removeClass('d-none');
            $btnSave.addClass('d-none').prop('disabled', false).text('寄驗證信');
            $btnCancel.addClass('d-none');
            setFieldHint('email');
        }

        function validateBackupEmail() {
            const v = String($input.val() || '').trim();
            const result = window.Validator ? window.Validator.validateEmail(v) : { valid: false, message: '檢查工具不存在' };
            setFieldHint('email', result.message, result.valid ? 'success' : 'error');
            $btnSave.prop('disabled', !result.valid);
            return result.valid;
        }

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
            if (!validateBackupEmail()) return;

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

        // 自訂名稱
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
            if (el) { el.focus(); el.select(); }
            $btnEditName.addClass('d-none');
            $btnSaveName.removeClass('d-none').prop('disabled', true);
            $btnCancelName.removeClass('d-none');
            setFieldHint('name');
            validateName();
        }

        function exitEditModeName(apply) {
            if (!apply) { $inputName.val(''); }
            $inputName.addClass('d-none');
            $displayName.removeClass('d-none');
            $btnEditName.removeClass('d-none');
            $btnSaveName.addClass('d-none').prop('disabled', false).text('確認');
            $btnCancelName.addClass('d-none');
            setFieldHint('name');
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
            if (!validateName()) return;

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

        // --- 匯入 / 匯出 JSON 日曆功能 (修正版：路徑修正 + 確認提示 + 強制重置) ---
        (function () {
            let btn = document.getElementById('btnImportCalendar');
            const input = document.getElementById('importCalendarInput');
            const message = document.getElementById('importCalendarMessage');
            const btnExport = document.getElementById('btnExportCalendar');

            // 1. 強力修復：Clone Node 以清除所有重複綁定的事件
            if (btn && input) {
                const newBtn = btn.cloneNode(true);
                if (btn.parentNode) {
                    btn.parentNode.replaceChild(newBtn, btn);
                }
                btn = newBtn; // 更新參考

                // 重新綁定唯一的 click 事件
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (window._calendar_import_inflight) {
                        console.warn('正在上傳中，請稍候...');
                        return;
                    }

                    // 2. 匯入前的確認提示
                    if (!confirm("⚠️ 警告：匯入操作將會「覆蓋」目前的日曆設定（LeaveDate 資料表）。\n\n確定要匯入嗎？")) {
                        return;
                    }

                    // 3. 清空 value，確保選同一個檔案也能觸發 change
                    input.value = '';
                    input.click();    // 開啟選擇檔案視窗
                });
            }

            function showMessage(text, type = 'info', duration = 4500) {
                if (message) {
                    message.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-info', 'success', 'error', 'info');
                    message.classList.add(type === 'success' ? 'success' : type === 'error' ? 'error' : 'info');
                    message.textContent = text;
                    message.classList.add('show');

                    if (message._hideTimer) { clearTimeout(message._hideTimer); message._hideTimer = null; }
                    message._hideTimer = setTimeout(() => {
                        message.classList.remove('show');
                        message._hideTimer = null;
                    }, duration);

                    const onClick = () => {
                        message.classList.remove('show');
                        if (message._hideTimer) { clearTimeout(message._hideTimer); message._hideTimer = null; }
                        message.removeEventListener('click', onClick);
                    };
                    message.addEventListener('click', onClick);
                } else {
                    const n = document.createElement('div');
                    n.textContent = text;
                    n.style.cssText = 'position:fixed;right:18px;bottom:18px;padding:10px 14px;border-radius:8px;color:#fff;z-index:2100;font-weight:600;';
                    n.style.background = type === 'error' ? '#ef4444' : '#155DFC';
                    document.body.appendChild(n);
                    setTimeout(() => { n.style.opacity = '0'; }, duration - 600);
                    setTimeout(() => n.remove(), duration);
                }
            }

            if (btnExport) {
                btnExport.addEventListener('click', () => {
                    try {
                        const payload = {
                            exportedAt: new Date().toISOString(),
                            source: 'member_center'
                        };

                        if (window.Calendar && typeof window.Calendar.getSelected === 'function') {
                            try {
                                const sel = window.Calendar.getSelected();
                                payload.singles = sel.singles || [];
                                payload.ranges = sel.ranges || [];
                                payload.submitted = sel.submitted || [];
                            } catch (e) { }
                        }

                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        const fname = `calendar_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
                        a.download = fname;
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                            try { URL.revokeObjectURL(url); } catch { }
                            try { a.remove(); } catch { }
                        }, 200);
                        showMessage('匯出完成，檔案將自動下載', 'success', 2600);
                    } catch (ex) {
                        console.error('Export failed', ex);
                        showMessage('匯出失敗，請稍後再試', 'error', 3500);
                    }
                });
            }

            if (input) {
                input.addEventListener('change', async (ev) => {
                    const file = ev.target.files && ev.target.files[0];
                    if (!file) return;

                    if (window._calendar_import_inflight) return;
                    window._calendar_import_inflight = true;

                    if (!file.name.toLowerCase().endsWith('.json')) {
                        showMessage('請選擇 .json 檔案', 'error');
                        window._calendar_import_inflight = false;
                        try { input.value = ''; } catch { }
                        return;
                    }

                    const fd = new FormData();
                    fd.append('file', file);

                    const uploadBtn = document.getElementById('btnImportCalendar');
                    if (uploadBtn) { uploadBtn.disabled = true; }

                    showMessage('上傳中，請稍候...', 'info');

                    try {
                        // 4. 路徑維持正確的 MVC Action
                        const resp = await fetch('/Auth/ImportCalendarJson', {
                            method: 'POST',
                            body: fd,
                            credentials: 'include'
                        });

                        let json;
                        try { json = await resp.json(); } catch { json = null; }

                        if (!resp.ok) {
                            const msg = json?.message ?? `上傳失敗 (狀態 ${resp.status})`;
                            showMessage(msg, 'error');
                        } else {
                            const msg = json?.message ?? '匯入成功！正在重新整理...';
                            showMessage(msg, 'success');

                            // 5. 匯入成功後，直接重新整理頁面
                            setTimeout(() => {
                                window.location.reload();
                            }, 1000);
                        }

                    } catch (ex) {
                        console.error('上傳處理發生例外', ex);
                        showMessage('上傳失敗，請檢查網路連線', 'error');
                    } finally {
                        window._calendar_import_inflight = false;
                        if (uploadBtn) { uploadBtn.disabled = false; }
                        try { input.value = ''; } catch { }
                    }
                });
            }
        })();

        if (hasMemberCenterDom) {
            MemberProfile.init();
        }

        async function handleBackupVerifiedQuery() {
            try {
                const params = new URLSearchParams(window.location.search);
                if (!params.has('backupVerified')) return;

                const raw = params.get('backupVerified') || '';
                let success = false;
                if (raw === '1') success = true;
                else {
                    const n = parseInt(raw, 10);
                    if (!isNaN(n) && n > 0) success = true;
                }

                let message = success ? '備援信箱驗證成功' : '備援信箱驗證失敗或連結無效';

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

                try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('backupVerified');
                    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
                } catch (e) { }
            } catch (ex) {
                console.warn('handleBackupVerifiedQuery error', ex);
            }
        }
        handleBackupVerifiedQuery();
    });
})();

const btnToggle = document.getElementById('btnToggleStyle');
const avatarFrame = document.getElementById('avatarFrame');
const iconCamera = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-camera" viewBox="0 0 16 16"><path d="M15 12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.172a3 3 0 0 0 2.12-.879l.83-.828A1 1 0 0 1 6.827 3h2.344a1 1 0 0 1 .707.293l.828.828A3 3 0 0 0 12.828 5H14a1 1 0 0 1 1 1zM2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a1 1 0 0 1-.707-.293l-.828-.828A5 5 0 0 0 7.828 3H6.172a5 5 0 0 0-3.536 1.464L1.808 5.293A1 1 0 0 1 1 5.5V6h1v-.5a.5.5 0 0 1 1 0V6"/><path d="M8 11a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5m0 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M3 6.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0"/></svg>`;
const iconCircle = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-circle" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/></svg>`;

if (btnToggle && avatarFrame) {
    const savedStyle = localStorage.getItem('avatarStyle');
    if (savedStyle === 'polaroid') {
        setPolaroidStyle();
    }
    btnToggle.addEventListener('click', function () {
        if (avatarFrame.classList.contains('circle-style')) {
            setPolaroidStyle();
        } else {
            setCircleStyle();
        }
    });
    function setPolaroidStyle() {
        avatarFrame.classList.remove('circle-style');
        avatarFrame.classList.add('polaroid-style');
        btnToggle.innerHTML = iconCircle;
        btnToggle.title = "切換回圓形風格";
        localStorage.setItem('avatarStyle', 'polaroid');
    }
    function setCircleStyle() {
        avatarFrame.classList.remove('polaroid-style');
        avatarFrame.classList.add('circle-style');
        btnToggle.innerHTML = iconCamera;
        btnToggle.title = "切換成拍立得風格";
        localStorage.setItem('avatarStyle', 'circle');
    }
}