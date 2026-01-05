$(function () {
    window.AppUrls = window.AppUrls || {
        Auth: {
            Login: '/AuthApi/Login',
            Register: '/AuthApi/Register',
            SendConfirmation: '/AuthApi/SendConfirmation',
            CheckDbStatus: '/AuthApi/CheckDbStatus',
            Logout: '/AuthApi/Logout',
            CheckEmail: '/AuthApi/CheckEmail',
            // 忘記密碼相關路由
            ForgotPassword: '/AuthApi/ForgotPassword',
            SendPasswordReset: '/AuthApi/SendPasswordReset',
            ValidatePasswordResetLink: '/AuthApi/ValidatePasswordResetLink',
            PerformPasswordReset: '/AuthApi/PerformPasswordReset',
            CheckPasswordResetSession: '/AuthApi/CheckPasswordResetSession',
            SetPasswordResetSession: '/AuthApi/SetPasswordResetSession',
            ClearPasswordResetSession: '/AuthApi/ClearPasswordResetSession',
            //會員中心相關路由
            MemberCenter: '/AuthApi/MemberCenter',
            GetMemberProfile: '/AuthApi/GetMemberProfile',
            UploadAvatar: '/AuthApi/UploadAvatar'
        },
        Home: {
            Index: '/Home/Index'
        }
    };

    //共用格式驗證
    const Validator = {
        validateEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const gmailMistakeRegex = /^g[amill]{3,6}\.com$/i;
            const domain = email.includes("@") ? email.split("@")[1].toLowerCase() : "";

            // --- Email 驗證 ---
            if (!email) {
                setFieldHint("email", "☐ 請輸入 Email", "error");
            }
            else if (!email.includes("@")) {
                setFieldHint("email", "☐ 缺少 @ 符號", "error");
            }
            else if (!email.includes(".") || email.lastIndexOf(".") < email.indexOf("@")) {
                setFieldHint("email", "☐ 缺少網域點 (.com 等)", "error");
            }
            else if (!emailRegex.test(email)) {
                setFieldHint("email", "☐ Email 格式不正確", "error");
            }
            else if (domain !== "gmail.com" && gmailMistakeRegex.test(domain)) {
                setFieldHint("email", "⚠ 您是指 gmail.com 嗎？", "error");
            }
            else {
                isEmailValid = true;
                setFieldHint("email", "☑ Email 格式正確", "success");
            }
        },

        // --- Password 驗證 ---
        validatePassword(password) {
            let pwdRules = [];
            if (pwd.length < 6 || pwd.length > 18) pwdRules.push("6~18位");
            if (!/[A-Z]/.test(pwd)) pwdRules.push("大寫英文");
            if (!/[a-z]/.test(pwd)) pwdRules.push("小寫英文");
            if (!/\d/.test(pwd)) pwdRules.push("數字");

        },
    };

    $.ajaxSetup({
        headers: { "RequestVerificationToken": window.csrfToken }
    });

    let popupOpen = false;
    function getThemeColors() {
        const rootStyles = getComputedStyle(document.documentElement);
        return {
            error: rootStyles.getPropertyValue('--color_Contrast').trim(),
            success: rootStyles.getPropertyValue('--color_Green').trim()
        };
    }
    
    // 根據 Signup.cshtml 中的實際 ID 對應
    function getHintSelector(fieldId) {
        switch (fieldId) {
            case "email": return "#emailHint"; 
            case "password": return "#pwdHint";
            case "confirmPassword": return "#confirmHint";  
            case "new_password": return "#new_password_hint";
            case "confirm_new_password": return "#confirm_new_password_hint";
            default: return "#" + fieldId + "_hint";
        }
    }
    
    function ensureHintElement(selector, fieldId) {
        if ($(selector).length === 0) {
            var input = $("#" + fieldId);
            if (input.length) {
                var $parent = input.closest('.input_row, .input_group_custom');
                var $hint = $('<div>')
                    .attr('id', selector.replace('#', ''))
                    .addClass('inputHint');
                if ($parent.length) {
                    $parent.after($hint);
                } else {
                    input.after($hint);
                }
                return $hint;
            }
            var $fallback = $('<div>')
                .attr('id', selector.replace('#', ''))
                .addClass('inputHint');
            $('body').append($fallback);
            return null;
        }
        return $(selector);
    }
    
    function setFieldHint(fieldId, message, status) {
        try {
            var sel = getHintSelector(fieldId);
            var $el = ensureHintElement(sel, fieldId);
            if (!$el || $el.length === 0) return;

            $el.removeClass('input_success input_error success error d-none');

            if (!message) {
                $el.html('').addClass('d-none');
                return;
            }

            var htmlMessage = message.replace(/\n/g, '<br>');
            $el.html(htmlMessage);

            var colors = getThemeColors();

            if (status === 'success') {
                $el.addClass('success');
                $el.css('color', colors.success || '#0a0');
            } else if (status === 'error') {
                $el.addClass('error');
                $el.css('color', colors.error || '#c00');
            } else {
                $el.css('color', '');
            }
        } catch (ex) {
            console.error("setFieldHint error:", ex);
        }
    }

    function showPopup(options) {
        if (popupOpen) {
            return Promise.resolve();
        }
        popupOpen = true;

        return new Promise((resolve) => {
            const {
                title = "",
                message = "",
                type = "success",
                autoClose = false,
                seconds = 3
            } = options;

            const statusClass = type === "success" ? "popup_success" : "popup_error";

            const popupHtml = `
                <div class="popup_overlay"></div>
                <div class="reg_popup">
                    <span class="popup_title ${statusClass}">${title}</span>
                    <p class="titleH5 popH5">${message}</p>
                    ${autoClose ? `
                    <div class="popTime">
                        此視窗將於 <span id="popupSec">${seconds}</span> 秒後自動關閉
                    </div>` : ""}
                    <button class="btn_popup_close">確定</button>
                </div>
            `;

            $("body").append(popupHtml);

            let timer = null;

            if (autoClose) {
                let remaining = seconds;
                timer = setInterval(() => {
                    remaining--;
                    $("#popupSec").text(remaining);
                    if (remaining <= 0) closePopup();
                }, 1000);
            }

            $(".btn_popup_close, .popup_overlay").on("click", closePopup);

            function closePopup() {
                if (timer) clearInterval(timer);

                $(".popup_overlay, .reg_popup").fadeOut(300, function () {
                    $(this).remove();
                    popupOpen = false;
                    resolve();
                });
            }
        });
    }

    //密碼顯示/隱藏切換（眼睛）
    function bindPasswordToggle(selector = ".btn-toggle-pwd") {
        $(document).off("click", selector).on("click", selector, function (e) {
            e.preventDefault();
            const target = $(this).data("target");
            const $input = $(target);
            const $img = $(this).find("img"); 
            
            if (!$input.length) return;

            const isPwd = $input.attr("type") === "password";
            $input.attr("type", isPwd ? "text" : "password");
            
            // 切換圖片路徑
            const newSrc = isPwd ? "/img/eye.svg" : "/img/eye-closed.svg";
            $img.attr("src", newSrc);
        });
    }

    // 全域
    window.setFieldHint = setFieldHint;
    window.showPopup = showPopup;
    window.bindPasswordToggle = bindPasswordToggle;

    // 預設啟用
    bindPasswordToggle();
});