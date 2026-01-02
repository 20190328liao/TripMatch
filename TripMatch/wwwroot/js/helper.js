$(function () {
    //放通用的
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
    function getHintSelector(fieldId) {
        switch (fieldId) {
            case "email": return "#emailHint";
            case "password": return "#pwdHint";
            case "confirmPassword": return "#confirmPwdHint";
            default: return "#systemMessage";
        }
    }
    function ensureHintElement(selector, fieldId) {
        if ($(selector).length === 0) {
            // 嘗試在對應 input 元素後建立
            var input = $("#" + fieldId);
            if (input.length) {
                var $hint = $('<div>')
                    .attr('id', selector.replace('#', ''))
                    .addClass('inputHint');
                input.after($hint);
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

            // 確保元素存在
            if (!$el || $el.length === 0) return;

            // 清除舊樣式
            $el.removeClass('input_success input_error d-none');

            if (!message) {
                // 若無訊息則隱藏
                $el.text('').addClass('d-none');
                return;
            }

            // 顯示文字
            $el.text(message);

            // 根據狀態套用樣式
            var colors = getThemeColors();

            if (status === 'success') {
                $el.addClass('input_success');
                $el.css('color', colors.success || '#0a0');
            } else if (status === 'error') {
                $el.addClass('input_error');
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
                    popupOpen = false;   // ★ 解鎖
                    resolve();
                });
            }
        });
    }

    // 將函式暴露到全域，login.js / signup.js 可直接呼叫
    window.setFieldHint = setFieldHint;

    window.showPopup = showPopup;
});