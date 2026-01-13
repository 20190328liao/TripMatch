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

        // 綁定送出：呼叫後端正確的 POST API（/api/auth/ChangePassword）
        $btn.on('click', function () {
            if ($btn.prop('disabled')) return;

            const oldPwd = ($old.val() || '').toString();
            const newPwd = ($new.val() || '').toString();
            const confPwd = ($confirm.val() || '').toString();

            // 簡單前端檢查
            if (!oldPwd || !newPwd || !confPwd) {
                alert('請完整填寫欄位');
                return;
            }

            // 建立隱藏表單並 submit（會走傳統 form POST，不觸發 preflight）
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/Auth/ChangePassword';
            form.style.display = 'none';

            function addHidden(name, value) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = name;
                input.value = value;
                form.appendChild(input);
            }

            addHidden('OldPassword', oldPwd);
            addHidden('NewPassword', newPwd);
            addHidden('ConfirmPassword', confPwd);

            // 加入 Antiforgery token（Layout 已輸出 window.csrfToken）
            if (window.csrfToken) {
                addHidden('__RequestVerificationToken', window.csrfToken);
            }

            document.body.appendChild(form);
            form.submit();
        });

        // 初始狀態：執行一次
        updateHints();
    });
})();