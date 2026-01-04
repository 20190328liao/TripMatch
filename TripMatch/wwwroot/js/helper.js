$(function () {
    // --- 定義全域 API 路徑變數 ---
    window.AppUrls = window.AppUrls || {
        Auth: {
            Login: '/AuthApi/Login',
            Register: '/AuthApi/Register',
            SendConfirmation: '/AuthApi/SendConfirmation',
            CheckDbStatus: '/AuthApi/CheckDbStatus',
            Logout: '/AuthApi/Logout',
            CheckEmail: '/AuthApi/CheckEmail'
        },
        Home: {
            Index: '/Home/Index'
        }
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
    
    // ★ 修正：根據 Signup.cshtml 中的實際 ID 對應
    function getHintSelector(fieldId) {
        switch (fieldId) {
            case "email": return "#emailHint";  // ★ 修正：改為 emailHint（符合 Signup.cshtml）
            case "password": return "#pwdHint";
            case "confirmPassword": return "#confirmHint";  // ★ 修正：改為 confirmHint（符合 Signup.cshtml）
            case "new_password": return "#new_password_hint";
            case "confirm_new_password": return "#confirm_new_password_hint";
            default: return "#" + fieldId + "_hint";
        }
    }
    
    function ensureHintElement(selector, fieldId) {
        if ($(selector).length === 0) {
            var input = $("#" + fieldId);
            if (input.length) {
                // ★ 修正：找到輸入框的父容器（input_row 或 input_group_custom），在其後插入 hint
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

    // ★ 通用：密碼顯示/隱藏切換（眼睛）
    function bindPasswordToggle(selector = ".btn-toggle-pwd") {
        // 先移除舊的，再綁定，避免重複
        $(document).off("click", selector).on("click", selector, function (e) {
            e.preventDefault();
            const target = $(this).data("target");
            const $input = $(target);
            const $img = $(this).find("img"); // 改找 img 標籤
            
            if (!$input.length) return;

            const isPwd = $input.attr("type") === "password";
            $input.attr("type", isPwd ? "text" : "password");
            
            // 切換圖片路徑
            // 原本是密碼(isPwd=true) -> 變成明文 -> 顯示睜眼 (eye.svg)
            // 原本是明文(isPwd=false) -> 變成密碼 -> 顯示閉眼 (eye-closed.svg)
            const newSrc = isPwd ? "/img/eye.svg" : "/img/eye-closed.svg";
            $img.attr("src", newSrc);
        });
    }

    // 將函式暴露到全域
    window.setFieldHint = setFieldHint;
    window.showPopup = showPopup;
    window.bindPasswordToggle = bindPasswordToggle;

    // 預設啟用
    bindPasswordToggle();
});