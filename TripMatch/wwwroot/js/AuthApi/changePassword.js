(function () {
    $(function () {
        const $old = $('#cp_old'), $new = $('#cp_new'), $confirm = $('#cp_confirm'), $btn = $('#btnChangePwd');
        const $rules = $('#pwdRules');

        function renderRules(missingRules) {
            if ($rules.length === 0) return;
            $rules.find('.rule-item').each(function () {
                const r = $(this).data('rule');
                if (missingRules && missingRules.indexOf(r) >= 0) {
                    $(this).removeClass('text-success').addClass('text-danger').css('text-decoration', 'none');
                } else {
                    $(this).removeClass('text-danger').addClass('text-success').css('text-decoration', 'line-through');
                }
            });
        }

        function setOldPwdHint(message, status) {
            const $el = $('#oldPwdHint');
            if ($el.length === 0) return;
            $el.removeClass('success error d-none').css('color', '');
            if (!message) {
                $el.html('').addClass("d-none");
                return;
            }
            $el.html(message.replace(/\n/g, '<br>')).removeClass('d-none');
            if (status === 'success') {
                $el.addClass('success').css('color', getComputedStyle(document.documentElement).getPropertyValue('--color_Green') || '#0a0');
            } else if (status === 'error') {
                $el.addClass('error').css('color', getComputedStyle(document.documentElement).getPropertyValue('--color_Contrast') || '#c00');
            }
        }

        function updateHints() {
            const oldVal = ($old.val() || '').toString();
            const pwd = ($new.val() || '').toString();
            const conf = ($confirm.val() || '').toString();

            // 新密碼格式檢查（使用 helper.js 的 Validator）
            const pwdRes = window.Validator ? window.Validator.validatePassword(pwd) : { valid: pwd.length >= 6, message: '' };
            if (typeof window.setFieldHint === 'function') {
                window.setFieldHint('new_password', pwdRes.message, pwdRes.valid ? 'success' : 'error');
            } else {
                $('#new_password_hint').text(pwdRes.message || '').toggleClass('d-none', !pwdRes.message);
            }

            // 呈現逐條規則
            renderRules(pwdRes.missingRules || []);

            // 確認密碼檢查
            const confRes = window.Validator ? window.Validator.validateConfirmPassword(pwd, conf) : { valid: pwd === conf && pwd.length > 0, message: '' };
            if (typeof window.setFieldHint === 'function') {
                window.setFieldHint('confirm_new_password', confRes.message, confRes.valid ? 'success' : 'error');
            } else {
                $('#confirm_new_password_hint').text(confRes.message || '').toggleClass('d-none', !confRes.message);
            }

            // 舊密碼提示：若為空顯示錯誤，輸入時可顯示簡單成功提示或隱藏
            if (!oldVal) {
                setOldPwdHint('☐ 請輸入舊密碼', 'error');
            } else {
                const oldRes = window.Validator ? window.Validator.validatePassword(oldVal) : { valid: oldVal.length >= 6, message: '☑ 已輸入舊密碼' };

                setOldPwdHint(oldRes.message || '☑ 已輸入舊密碼', oldRes.valid ? 'success' : 'error');
            }

            // 啟用按鈕：舊密碼有值且新密碼與確認皆有效
            $btn.prop('disabled', !(oldVal && pwdRes.valid && confRes.valid));
        }


        function bindPasswordToggle(selector = '.btn-toggle-pwd') {
            $(document).off('click', selector).on('click', selector, function (e) {
                e.preventDefault();
                const target = $(this).data('target');
                const $input = $(target);
                const $img = $(this).find('img');
                if (!$input.length) return;
                const isPwd = $input.attr('type') === 'password';
                $input.attr('type', isPwd ? 'text' : 'password');
                if ($img.length) {
                    $img.attr('src', isPwd ? '/img/eye.svg' : '/img/eye-closed.svg');
                }
            });
        }

        // 綁定切換按鈕
        bindPasswordToggle();

        $old.on('input', updateHints);
        $new.on('input', updateHints);
        $confirm.on('input', updateHints);

        // 初始化提示訊息
        setOldPwdHint('請輸入舊密碼', 'error');
        $('#new_password_hint').text('密碼長度至少 6 碼，並包含字母、數字和特殊字符').removeClass('d-none');
        $('#confirm_new_password_hint').text('請再次輸入新密碼以確認').removeClass('d-none');

        // 顯示倒數整數秒的臨時 toast（每秒更新，回傳 Promise）
        function tempCountdownToast(title, message, seconds = 3) {
            return new Promise((resolve) => {
                try {
                    const id = 'cp_temp_toast';
                    let el = document.getElementById(id);
                    if (!el) {
                        el = document.createElement('div');
                        el.id = id;
                        el.style.position = 'fixed';
                        el.style.right = '18px';
                        el.style.top = '18px';
                        el.style.padding = '10px 14px';
                        el.style.borderRadius = '8px';
                        el.style.background = '#10b981';
                        el.style.color = '#fff';
                        el.style.zIndex = '5000';
                        el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
                        el.style.fontWeight = '600';
                        document.body.appendChild(el);
                    }

                    // 以整數秒計時
                    let remaining = Math.max(1, Math.floor(Number(seconds) || 1));
                    function renderText() {
                        el.textContent = `${title} ${remaining} 秒後關閉`;
                        if (message) {
                            // 若有額外訊息，放在同一行後面
                            el.textContent += ` — ${message}`;
                        }
                    }

                    renderText();
                    el.style.opacity = '1';

                    const iv = setInterval(() => {
                        remaining -= 1;
                        if (remaining <= 0) {
                            clearInterval(iv);
                            try { el.style.opacity = '0'; } catch { }
                            setTimeout(() => {
                                try { el.remove(); } catch { /* ignore */ }
                                resolve();
                            }, 300);
                            return;
                        }
                        renderText();
                    }, 1000);
                } catch (e) {
                    try { alert(title + (message ? '\n' + message : '')); } catch { /* ignore */ }
                    resolve();
                }
            });
        }

        // 顯示一次性的成功彈窗（在按下變更密碼後顯示一次，顯示整數秒）
        async function showImmediateOneTimePopup() {
            const seconds = 3; // 顯示秒數（整數）
            const title = '密碼更新中';
            const message = '變更密碼請稍候…';

            // 優先使用自製整數倒數 toast（確保顯示整數秒）
            await tempCountdownToast(title, message, seconds);
        }

        // 顯示成功 popup（使用全域 showPopup，若不存在則 fallback）
        async function showSuccessPopup() {
            const opts = {
                title: '密碼更新成功',
                message: '您的密碼已更新，請使用新密碼登入。',
                type: 'success',
                autoClose: true,
                seconds: 3,
                okText: '知道了'
            };

            if (typeof window.showPopup === 'function') {
                try {
                    await window.showPopup(opts);
                } catch (e) {
                    // fallback to alert
                    try { alert(opts.title + '\n\n' + opts.message); } catch { /* ignore */ }
                }
            } else {
                // fallback to alert
                try { alert(opts.title + '\n\n' + opts.message); } catch { /* ignore */ }
            }
        }

        // helper：將 redirectUrl 加入 pwdUpdated=1 query（保留 hash）
        function appendPwdFlagToUrl(url) {
            try {
                const u = new URL(url, window.location.origin);
                if (!u.searchParams.has('pwdUpdated')) u.searchParams.set('pwdUpdated', '1');
                return u.href;
            } catch (e) {
                // fallback：簡單拼接（避免破壞已有 hash）
                try {
                    const parts = url.split('#');
                    const base = parts[0];
                    const hash = parts[1] ? '#' + parts[1] : '';
                    const sep = base.indexOf('?') === -1 ? '?' : '&';
                    return base + sep + 'pwdUpdated=1' + hash;
                } catch { return url; }
            }
        }

        // 使用 AJAX 提交，收到任何回應後顯示成功 popup 然後導回 MemberCenter 並確保帶 flag 以顯示一次性成功提示
        $btn.on('click', async function () {
            if ($btn.prop('disabled')) return;

            const oldPwd = ($old.val() || '').toString();
            const newPwd = ($new.val() || '').toString();
            const confPwd = ($confirm.val() || '').toString();

            if (!oldPwd || !newPwd || !confPwd) {
                alert('請完整填寫欄位');
                return;
            }

            // 防止重複點擊
            $btn.prop('disabled', true);
            $btn.data('orig-text', $btn.text());
            $btn.text('變更中...');

            // 顯示一次性彈窗（按下後立即顯示）
            try {
                await showImmediateOneTimePopup();
            } catch (e) { /* ignore */ }

            // 建立 FormData
            const fd = new FormData();
            fd.append('OldPassword', oldPwd);
            fd.append('NewPassword', newPwd);
            fd.append('ConfirmPassword', confPwd);

            if (window.csrfToken) {
                fd.append('__RequestVerificationToken', window.csrfToken);
            }

            const redirectUrl = window.Routes?.Auth?.MemberCenter ?? window.Routes?.Member?.Center ?? '/Member/MemberCenter';
            let finalRedirect = redirectUrl;

            try {
                const fetchOpts = {
                    method: 'POST',
                    body: fd,
                    credentials: 'include',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                };
                if (window.csrfToken) {
                    fetchOpts.headers['RequestVerificationToken'] = window.csrfToken;
                }

                const resp = await fetch('/Auth/ChangePassword', fetchOpts);
                // 嘗試解析回應（但不以此決定導回）
                try { await resp.json(); } catch { /* ignore */ }

                // 顯示成功 popup
                try {
                    await showSuccessPopup();
                } catch (e) { /* ignore */ }

                // 設 flag 並把 query 加上去，讓 MemberCenter 的 helper 能顯示一次成功提示（備援）
                try { sessionStorage.setItem('pwdUpdated', '1'); } catch { /* ignore */ }
                finalRedirect = appendPwdFlagToUrl(redirectUrl);

                window.location.href = finalRedirect;
                return;
            } catch (ex) {
                // network 錯誤也顯示成功 popup 然後導回並帶 flag（依使用者要求）
                try {
                    await showSuccessPopup();
                } catch (e) { /* ignore */ }
                try { sessionStorage.setItem('pwdUpdated', '1'); } catch { /* ignore */ }
                finalRedirect = appendPwdFlagToUrl(redirectUrl);
                window.location.href = finalRedirect;
                return;
            } finally {
                // 若未導頁（極少情況），恢復按鈕狀態
                setTimeout(() => {
                    try {
                        if (document.hasFocus()) {
                            $btn.prop('disabled', false);
                            const txt = $btn.data('orig-text') || '確認';
                            $btn.text(txt);
                        }
                    } catch { /* ignore */ }
                }, 2000);
            }
        });

        // 初始狀態：執行一次
        updateHints();
    });
})();