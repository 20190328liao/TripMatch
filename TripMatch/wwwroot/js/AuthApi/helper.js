$(function () {

    $.ajaxSetup({
        xhrFields: {
            withCredentials: true
        },
        headers: { "RequestVerificationToken": window.csrfToken }
    });
    
    window.AppUrls = window.AppUrls || {
        Auth: {
            Login: '/AuthApi/Login',
            Register: '/AuthApi/Register',
            SendConfirmation: '/AuthApi/SendConfirmation',
            CheckDbStatus: '/AuthApi/CheckDbStatus',
            Logout: '/AuthApi/Logout',
            CheckEmail: '/AuthApi/CheckEmail',
            ForgotPassword: '/AuthApi/ForgotPassword',
            SendPasswordReset: '/AuthApi/SendPasswordReset',
            ValidatePasswordResetLink: '/AuthApi/ValidatePasswordResetLink',
            PerformPasswordReset: '/AuthApi/PerformPasswordReset',
            CheckPasswordResetSession: '/AuthApi/CheckPasswordResetSession',
            SetPasswordResetSession: '/AuthApi/SetPasswordResetSession',
            ClearPasswordResetSession: '/AuthApi/ClearPasswordResetSession',
            MemberCenter: '/AuthApi/MemberCenter',
            GetMemberProfile: '/AuthApi/GetMemberProfile',
            UploadAvatar: '/AuthApi/UploadAvatar',
            ClearPendingSession: '/AuthApi/ClearPendingSession'
        },
        Home: {
            Index: '/Home/Index'
        }
    };

    // 共用格式驗證
    const Validator = {
        validateEmail(email) {
            // 防禦性處理：確保 email 為字串
            email = (email === null || email === undefined) ? '' : String(email);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const gmailMistakeRegex = /^g[amill]{3,6}\.com$/i;
            const domain = email.includes("@") ? email.split("@")[1].toLowerCase() : "";

            if (!email) return { valid: false, message: "☐ 請輸入 Email" };
            if (!email.includes("@")) return { valid: false, message: "☐ 缺少 @ 符號" };
            if (!email.includes(".") || email.lastIndexOf(".") < email.indexOf("@"))
                return { valid: false, message: "☐ 缺少網域點 (.com 等)" };
            if (!emailRegex.test(email)) return { valid: false, message: "☐ Email 格式不正確" };
            if (domain !== "gmail.com" && gmailMistakeRegex.test(domain))
                return { valid: false, message: "⚠ 您是指 gmail.com 嗎？" };

            return { valid: true, message: "☑ Email 格式正確" };
        },
        // 密碼驗證：6~18碼、大寫、小寫、數字
        // (?=.*[a-z]) : 至少包含一個小寫
        // (?=.*[A-Z]) : 至少包含一個大寫
        // (?=.*\d)    : 至少包含一個數字
        // .{6,18}     : 長度在 6 到 18 之間
        validatePassword(password) {
            // 防護：確保 password 為字串，避免外部傳入 undefined/event 物件導致 .length 拋錯
            password = (password === null || password === undefined) ? '' : String(password);
            let pwdRules = [];
            if (password.length < 6 || password.length > 18) pwdRules.push("6~18位");
            if (!/[A-Z]/.test(password)) pwdRules.push("大寫英文");
            if (!/[a-z]/.test(password)) pwdRules.push("小寫英文");
            if (!/\d/.test(password)) pwdRules.push("數字");

            return {
                valid: pwdRules.length === 0,
                message: pwdRules.length === 0 ? "☑ 密碼格式符合規則" : "☐ 請修改：" + pwdRules.join("、"),
                missingRules: pwdRules
            };
        },

        validateConfirmPassword(password, confirmPassword) {
            // 也要防護參數
            password = (password === null || password === undefined) ? '' : String(password);
            confirmPassword = (confirmPassword === null || confirmPassword === undefined) ? '' : String(confirmPassword);

            const pwdResult = this.validatePassword(password);
            if (!confirmPassword) return { valid: false, message: "" };
            if (!pwdResult.valid) return { valid: false, message: "☐ 密碼格式不符，請參考上方提示" };
            if (password !== confirmPassword) return { valid: false, message: "☐ 密碼不一致" };
            return { valid: true, message: "☑ 密碼一致且符合規範" };
        }
    };

    let popupOpen = false;

    function getThemeColors() {
        const rootStyles = getComputedStyle(document.documentElement);
        return {
            error: rootStyles.getPropertyValue('--color_Contrast').trim(),
            success: rootStyles.getPropertyValue('--color_Green').trim()
        };
    }

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

    function bindPasswordToggle(selector = ".btn-toggle-pwd") {
        $(document).off("click", selector).on("click", selector, function (e) {
            e.preventDefault();
            const target = $(this).data("target");
            const $input = $(target);
            const $img = $(this).find("img");

            if (!$input.length) return;

            const isPwd = $input.attr("type") === "password";
            $input.attr("type", isPwd ? "text" : "password");

            const newSrc = isPwd ? "/img/eye.svg" : "/img/eye-closed.svg";
            $img.attr("src", newSrc);
        });
    }

    // ===== 全域匯出（放在最後）=====
    window.Validator = Validator;
    window.setFieldHint = setFieldHint;
    window.showPopup = showPopup;
    window.bindPasswordToggle = bindPasswordToggle;

    // 預設啟用
    bindPasswordToggle();
});