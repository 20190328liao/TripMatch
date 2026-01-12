// 1. AJAX 初始化設定 - 確保在頁面載入時優先掛載 CSRF Token
jQuery(function () {
    if (window.jQuery && typeof jQuery.ajaxSetup === 'function') {
        jQuery.ajaxSetup({
            xhrFields: {
                withCredentials: true
            },
            headers: {
                "RequestVerificationToken": window.csrfToken
            }
        });
        console.log("AJAX Setup 成功，CSRF Token 已掛載");
    } else if (window.jQuery && typeof jQuery.ajaxPrefilter === 'function') {
        // fallback: 使用 ajaxPrefilter 以相容不同 jQuery build
        jQuery.ajaxPrefilter(function (options) {
            options.xhrFields = Object.assign(options.xhrFields || {}, { withCredentials: true });
            options.headers = Object.assign(options.headers || {}, { "RequestVerificationToken": window.csrfToken });
        });
        console.log("AJAX Prefilter 設定，CSRF Token 已掛載");
    } else {
        console.error("錯誤：無法找到 jQuery ajax 設定函式，請檢查 jQuery 是否正確載入且無衝突。");
    }
});

// 2. 全域路由定義
window.Routes = window.Routes || {
    AuthApi: {
        Signin: '/api/auth/Signin',
        Logout: '/api/auth/Logout',
        Register: '/api/auth/Register',
        SendConfirmation: '/api/auth/SendConfirmation',
        CheckDbStatus: '/api/auth/CheckDbStatus',
        SendPasswordReset: '/api/auth/SendPasswordReset',
        ValidatePasswordResetLink: '/api/auth/ValidatePasswordResetLink',
        PerformPasswordReset: '/api/auth/PerformPasswordReset',
        CheckPasswordResetSession: '/api/auth/CheckPasswordResetSession',
        SetPasswordResetSession: '/api/auth/SetPasswordResetSession',
        ClearPasswordResetSession: '/api/auth/ClearPasswordResetSession',
        GetMemberProfile: '/api/auth/GetMemberProfile',
        UploadAvatar: '/api/auth/UploadAvatar',
        ClearPendingSession: '/api/auth/ClearPendingSession',
        SaveLeaves: '/api/auth/SaveLeaves',
        DeleteLeaves: '/api/auth/DeleteLeaves',
        GetLeaves: '/api/auth/GetLeaves',
        GetLockedRanges: '/api/auth/GetLockedRanges'
    },
    Auth: {
        Login: '/Auth/Login',
        Signup: '/Auth/Signup',
        CheckEmail: '/Auth/CheckEmail',
        ForgotPassword: '/Auth/ForgotPassword',
        MemberCenter: '/Auth/MemberCenter',
        ChangePassword: '/Auth/ChangePassword'
    },
    Home: {
        Index: '/Home/Index'
    }
};

// 3. 共用格式驗證工具
const Validator = {
    validateEmail(email) {
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
    validatePassword(password) {
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
        password = (password === null || password === undefined) ? '' : String(password);
        confirmPassword = (confirmPassword === null || confirmPassword === undefined) ? '' : String(confirmPassword);

        const pwdResult = this.validatePassword(password);
        if (!confirmPassword) return { valid: false, message: "" };
        if (!pwdResult.valid) return { valid: false, message: "☐ 密碼格式不符，請參考上方提示" };
        if (password !== confirmPassword) return { valid: false, message: "☐ 密碼不一致" };
        return { valid: true, message: "☑ 密碼一致且符合規範" };
    }
};

// 4. UI 輔助功能
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
            var $hint = $('<div>').attr('id', selector.replace('#', '')).addClass('inputHint');
            if ($parent.length) {
                $parent.after($hint);
            } else {
                input.after($hint);
            }
            return $hint;
        }
        var $fallback = $('<div>').attr('id', selector.replace('#', '')).addClass('inputHint');
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
            $el.addClass('success').css('color', colors.success || '#0a0');
        } else if (status === 'error') {
            $el.addClass('error').css('color', colors.error || '#c00');
        } else {
            $el.css('color', '');
        }
    } catch (ex) {
        console.error("setFieldHint error:", ex);
    }
}

function showPopup(options) {
    if (popupOpen) return Promise.resolve();
    popupOpen = true;

    return new Promise((resolve) => {
        const { title = "", message = "", type = "success", autoClose = false, seconds = 3 } = options;
        const statusClass = type === "success" ? "popup_success" : "popup_error";
        const popupHtml = `
            <div class="popup_overlay"></div>
            <div class="reg_popup">
                <span class="popup_title ${statusClass}">${title}</span>
                <p class="titleH5 popH5">${message}</p>
                ${autoClose ? `<div class="popTime">此視窗將於 <span id="popupSec">${seconds}</span> 秒後自動關閉</div>` : ""}
                <button class="btn_popup_close">確定</button>
            </div>`;

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
    // 以 jQuery 安全檢查，避免呼叫不存在的 .off 導致錯誤
    if (window.jQuery && typeof jQuery === 'function') {
        const $doc = jQuery(document);
        if (typeof $doc.off === 'function') {
            $doc.off("click", selector);
        } else {
            // 若 off 不存在，嘗試移除先前命名空間綁定（若曾使用），或僅不移除以避免例外
            // 無法安全移除時記錄警告
            console.warn("jQuery.off 不可用，跳過移除舊事件以避免例外。");
        }
        $doc.on("click", selector, function (e) {
            e.preventDefault();
            const target = jQuery(this).data("target");
            const $input = jQuery(target);
            const $img = jQuery(this).find("img");
            if (!$input.length) return;
            const isPwd = $input.attr("type") === "password";
            $input.attr("type", isPwd ? "text" : "password");
            $img.attr("src", isPwd ? "/img/eye.svg" : "/img/eye-closed.svg");
        });
        return;
    }

    // fallback to vanilla event delegation when jQuery absent
    // 使用一次性的命名空間以避免重複綁定
    if (!window.__btnToggleDelegateAdded) {
        document.addEventListener('click', function (e) {
            const clicked = e.target;
            const btn = clicked.closest(selector);
            if (!btn) return;
            e.preventDefault();
            const targetSel = btn.getAttribute('data-target');
            const input = document.querySelector(targetSel);
            const img = btn.querySelector('img');
            if (!input) return;
            const isPwd = input.getAttribute('type') === 'password';
            input.setAttribute('type', isPwd ? 'text' : 'password');
            if (img) img.setAttribute('src', isPwd ? '/img/eye.svg' : '/img/eye-closed.svg');
        }, true);
        window.__btnToggleDelegateAdded = true;
    }
}

// 5. 全域掛載與初始化
window.Validator = Validator;
window.setFieldHint = setFieldHint;
window.showPopup = showPopup;
window.bindPasswordToggle = bindPasswordToggle;

// 最後初始化
jQuery(function () {
    bindPasswordToggle();
});