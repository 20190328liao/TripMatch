(function () {
    'use strict';
    try {
        if (typeof navigator !== 'undefined' && navigator.permissions && typeof navigator.permissions.query === 'function') {
            const _orig = navigator.permissions.query;
            // 若尚未被包裝，重新包裝成永遠以 navigator.permissions 為 receiver 的函式
            if (_orig && !_orig.__tm_bound) {
                const wrapped = function () {
                    return _orig.apply(navigator.permissions, arguments);
                };
                try { wrapped.toString = function () { return _orig.toString(); }; } catch { }
                wrapped.__tm_bound = true;
                navigator.permissions.query = wrapped;
                // 若需要也可保留原始在其他位置參考
                navigator.permissions.__original_query = _orig;
            }
        }
    } catch (e) {
        try { console.warn('permissions-fix init failed', e); } catch { }
    }
})();
(function (window, jQuery) {
    'use strict';

    // 防止此檔案被重複載入導致全域變數重覆宣告錯誤
    if (window.__TripMatch_HelperLoaded) {
        console.warn('helper.js 已載入，跳過重複執行。');
        return;
    }
    window.__TripMatch_HelperLoaded = true;

    // 確保 jQuery 存在
    const $ = jQuery || window.jQuery;
    if (typeof $ === 'undefined') {
        console.error('helper.js 需要 jQuery，請確認 jQuery 已先載入。');
        return;
    }

    // 1. AJAX 初始化設定 - 確保在頁面載入時優先掛載 CSRF Token
    $(function () {
        if (typeof $.ajaxSetup === 'function') {
            $.ajaxSetup({
                xhrFields: {
                    withCredentials: true
                },
                headers: {
                    "RequestVerificationToken": window.csrfToken
                }
            });
            console.log("AJAX Setup 成功，CSRF Token 已掛載");
        } else if (typeof $.ajaxPrefilter === 'function') {
            // fallback: 使用 ajaxPrefilter 以相容不同 jQuery build
            $.ajaxPrefilter(function (options) {
                options.xhrFields = Object.assign(options.xhrFields || {}, { withCredentials: true });
                options.headers = Object.assign(options.headers || {}, { "RequestVerificationToken": window.csrfToken });
            });
            console.log("AJAX Prefilter 設定，CSRF Token 已掛載");
        } else {
            console.error("錯誤：無法找到 jQuery ajax 設定函式，請檢查 jQuery 是否正確載入且無衝突。");
        }
    });

    // 2. 全域路由定義（預設值）
    window.Routes = $.extend(true, window.Routes || {}, {
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
            MemberCenter: '/api/auth/GetMemberProfile', // 方便相容
            UploadAvatar: '/api/auth/UploadAvatar',
            ClearPendingSession: '/api/auth/ClearPendingSession',
            SaveLeaves: '/api/auth/SaveLeaves',
            DeleteLeaves: '/api/auth/DeleteLeaves',
            GetLeaves: '/api/auth/GetLeaves',
            GetLockedRanges: '/api/auth/GetLockedRanges',

            // wishlist
            GetWishlist: '/api/auth/Wishlist',
            ToggleWishlist: '/api/auth/Wishlist/Toggle'
        },
        MemberCenterApi: {
            Toggle: '/api/MemberCenterApi/Toggle',
            GetWish: '/api/MemberCenterApi/GetWish',
            TestFillImages: '/api/MemberCenterApi/TestFillImages',
            SeedDummyWishlistForTrip: '/api/MemberCenterApi/SeedDummyWishlistForTrip',
            GetWishlistCardsByUser: '/api/MemberCenterApi/GetWishlistCardsByUser'
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
    });

    // 在 helper.js 中：從 layout 的 #route-data dataset 讀取（不要把 server JSON 寫死在 helper.js）
    $(function () {
        const routeEl = document.getElementById('route-data');
        if (routeEl) {
            try {
                const pages = JSON.parse(routeEl.dataset.pages || '{}');
                const apis = JSON.parse(routeEl.dataset.apis || '{}');
                const memberCenterApis = JSON.parse(routeEl.dataset.memberCenterApis || '{}');

                // 深度合併：把 server 提供的 keys 合併進現有的 window.Routes（不要整個覆寫）
                window.Routes = window.Routes || {};
                window.Routes.Auth = window.Routes.Auth || {};
                window.Routes.AuthApi = window.Routes.AuthApi || {};
                window.Routes.MemberCenterApi = window.Routes.MemberCenterApi || {};

                // 將 server apis 深度合併到現有 AuthApi
                $.extend(true, window.Routes.AuthApi, apis || {});

                // 若 server 另行提供 memberCenterApi 群組，合併進 MemberCenterApi
                if (memberCenterApis && Object.keys(memberCenterApis).length > 0) {
                    $.extend(true, window.Routes.MemberCenterApi, memberCenterApis);
                }

                // 合併 pages（頁面路由）到 Auth
                $.extend(true, window.Routes.Auth, pages || {});

                // 兼容性處理：確保 MemberCenter/GetMemberProfile 兩種 key至少其中一個存在
                if (window.Routes.AuthApi.MemberCenter && !window.Routes.AuthApi.GetMemberProfile) {
                    window.Routes.AuthApi.GetMemberProfile = window.Routes.AuthApi.MemberCenter;
                }
                if (window.Routes.AuthApi.GetMemberProfile && !window.Routes.AuthApi.MemberCenter) {
                    window.Routes.AuthApi.MemberCenter = window.Routes.AuthApi.GetMemberProfile;
                }

                // 若 server 未提供 wishlist 與 MemberCenterApi 群組，使用 fallback（避免 missing）
                const fallbacks = {
                    GetWishlist: '/api/auth/Wishlist',
                    ToggleWishlist: '/api/auth/Wishlist/Toggle',
                    MemberCenter: '/api/auth/GetMemberProfile',
                    GetMemberProfile: '/api/auth/GetMemberProfile'
                };
                Object.entries(fallbacks).forEach(([k, v]) => {
                    if (!window.Routes.AuthApi[k]) {
                        window.Routes.AuthApi[k] = v;
                        console.debug(`Routes fallback applied: AuthApi.${k} = ${v}`);
                    }
                });

                if (!window.Routes.MemberCenterApi || Object.keys(window.Routes.MemberCenterApi).length === 0) {
                    // 保留預設群組（已在上方宣告），但若 server 覆寫為空則恢復預設
                    window.Routes.MemberCenterApi = window.Routes.MemberCenterApi || {
                        Toggle: '/api/MemberCenterApi/Toggle',
                        GetWish: '/api/MemberCenterApi/GetWish',
                        TestFillImages: '/api/MemberCenterApi/TestFillImages',
                        SeedDummyWishlistForTrip: '/api/MemberCenterApi/SeedDummyWishlistForTrip',
                        GetWishlistCardsByUser: '/api/MemberCenterApi/GetWishlistCardsByUser'
                    };
                    console.debug('Routes fallback applied: MemberCenterApi defaults restored');
                }

                // 最後列印合併結果供 debug（可移除）
                console.info('Routes merged:', {
                    AuthApi: Object.keys(window.Routes.AuthApi).sort(),
                    MemberCenterApi: Object.keys(window.Routes.MemberCenterApi).sort(),
                    Auth: Object.keys(window.Routes.Auth).sort()
                });
            } catch (ex) {
                console.error('解析 route-data 失敗', ex);
            }
        }
    });

    // 3. 共用格式驗證工具（如果已存在則保留先前定義）
    if (typeof window.Validator === 'undefined') {
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

                const pwdResult = Validator.validatePassword(password);
                if (!confirmPassword) return { valid: false, message: "" };
                if (!pwdResult.valid) return { valid: false, message: "☐ 密碼格式不符，請參考上方提示" };
                if (password !== confirmPassword) return { valid: false, message: "☐ 密碼不一致" };
                return { valid: true, message: "☑ 密碼一致且符合規範" };
            }
        };
        window.Validator = Validator;
    }

    // 4. UI 輔助功能 (其餘程式碼維持原樣)
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
                // 直接設定 margin-top，保證生成時有適當間距
                $hint.css('margin-top', '1rem');
                if ($parent.length) {
                    $parent.after($hint);
                } else {
                    input.after($hint);
                }
                return $hint;
            }
            var $fallback = $('<div>').attr('id', selector.replace('#', '')).addClass('inputHint');
            $fallback.css('margin-top', '1rem');
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
        $(document).off("click", selector).on("click", selector, function (e) {
            e.preventDefault();
            const target = $(this).data("target");
            const $input = $(target);
            const $img = $(this).find("img");
            if (!$input.length) return;
            const isPwd = $input.attr("type") === "password";
            $input.attr("type", isPwd ? "text" : "password");
            $img.attr("src", isPwd ? "/img/eye.svg" : "/img/eye-closed.svg");
        });
    }

    // 5. 全域掛載與初始化
    window.setFieldHint = setFieldHint;
    window.showPopup = showPopup;
    window.bindPasswordToggle = bindPasswordToggle;

    $(function () {
        bindPasswordToggle();
    });

})(window, window.jQuery);

// 開發專用：過濾來自 aspnetcore-browser-refresh 的 "Unknown payload: { \"type\" : \"Ping\" }" 訊息
(function () {
    'use strict';
    // 只在本機開發環境啟用（避免誤過濾其他環境的警告）
    try {
        const host = (window && window.location && window.location.hostname) || '';
        if (!/localhost|127\.0\.0\.1/.test(host)) return;

        const _origWarn = console.warn.bind(console);
        console.warn = function (...args) {
            try {
                if (args.length >= 1 && typeof args[0] === 'string') {
                    const msg = args[0].toLowerCase();
                    if (msg.includes('unknown payload') && /ping/.test(msg)) return;
                }
                if (args.length >= 2 && typeof args[1] === 'object' && args[1] && args[1].type === 'Ping') {
                    return;
                }
            } catch (ex) {
                try { _origWarn('console.warn filter error', ex); } catch {}
            }
            _origWarn(...args);
        };
    } catch (e) {
        /* noop */
    }


})();

/* Policy modal: append this block to helper.js (ensure jQuery is available) */
(function (window, $) {
    'use strict';

    if (typeof $ === 'undefined') return;

    // 內容字串（使用你提供的條款文本）
    const privacyHtml = `
    <div class="privacyWrap">
        <h1 class="titleWrap titleH1">想想 TripMatch ｜Privacy & Terms</h1>
       <h2 class="titleWrap titleH2">隱私權政策 Privacy Policy</h2>
       <p class="textbody">歡迎您使用「想想 TripMatch 旅程規劃平台」（以下簡稱「本服務」）。為了保障您的個人權益及隱私，本服務特此說明隱私權保護政策，請您詳閱：</p>
        <h4 class="titleWrap titleH4">一、 隱私權政策的適用範圍</h4>
        <p class="textbody2">本政策適用於您在使用本服務時，所涉及的個人資料蒐集、處理及利用。本服務可能包含第三方網站的連結（如航空公司、訂房平台），該類網站之隱私權保護由其自行負責，不適用本政策。</p>
        <h4 class="titleWrap titleH4">二、 個人資料的蒐集方式與內容</h4>
        <p class="textbody2">為了提供核心的「多人協作」與「旅程規劃」功能，我們會蒐集以下資料：</p>
        <ol>
            <li>帳號資訊： 姓名、電子郵件、頭像、登入密碼（經加密處理）。</li>
            <li>行程協作資料： 您於平台內輸入的空檔時間、旅遊偏好、景點清單、行程安排。</li>
            <li>財務與預算： 若使用分帳與記帳功能，系統會記錄您的開支金額與分帳對象。</li>
            <li>設備資訊： IP 位址、瀏覽器類型、使用時間，用於優化系統效能與防範詐騙。</li>
        </ol>
        <h4 class="titleWrap titleH4">三、 個人資料的利用目的</h4>
        <p class="textbody2">我們將蒐集到的資料用於以下特定用途：</p>
        <ol>
            <li>多人決策支援： 比對成員間的空檔，產生最優旅遊方案建議。</li>
            <li>機加酒媒合： 根據您的偏好，推薦合適的第三方旅遊方案（如機票、住宿）。</li>
            <li>群組協作： 允許同組旅伴查看共享的行程與分帳明細。</li>
            <li>服務優化： 透過統計分析（不含個人識別），改善自動化推薦系統演算法。</li>
        </ol>
        <h4 class="titleWrap titleH4">四、 資料的保護與安全</h4>
        <p class="textbody2">本服務採用加密傳輸（SSL/TLS）與防火牆技術保護資料安全。密碼皆經過雜湊加密，即使是內部管理員亦無法直接讀取您的密碼。非經授權人員不得接觸您的個人資料，所有資料處理流程皆符合資安規範。</p>
        <h4 class="titleWrap titleH4">五、 第三方分享與跨境傳輸</h4>
        <p class="textbody2">本服務不會出售您的資料。但在下列情況下，我們會與第三方分享必要資訊：服務媒合、法律要求等。</p>
        <h4 class="titleWrap titleH4">六、 使用者權利（個人資料保護法行使）</h4>
        <p class="textbody2">您可以隨時登入「會員中心」行使查詢、閱覽、下載、修改個人資料、要求停止蒐集或刪除帳號等權利。註：刪除帳號後，部分去識別化的協作記錄可能保留以維持其他使用者之行程完整性。</p>
        <h4 class="titleWrap titleH4">七、 Cookie 之使用</h4>
        <p class="textbody2">本服務使用 Cookie 以維持您的登入狀態及記錄個人偏好。您可調整瀏覽器設定拒絕 Cookie，但可能影響部分功能。</p>
        <h4 class="titleWrap titleH4">八、 聯絡方式</h4>
        <p class="textbody2">若您對本政策有任何疑問，或欲行使個資權利，請聯繫：客服信箱：tripMatch@gmail.com。</p>
        <p class="textbody2">服務團隊：想想 TripMatch 開發團隊</p>
        </div>
    `;

    const termsHtml = `
    <div class="privacyWrap">
    <h1 class="titleWrap titleH1">想想 TripMatch ｜Privacy & Terms</h1>
         <h2 class="titleWrap titleH2">服務條款 Terms of Service</h2>
        <p class="textbody">歡迎您使用「想想 TripMatch 旅程規劃平台」（以下簡稱「本平台」）。當您註冊帳號或開始使用本平台提供的服務（以下簡稱「本服務」）時，即表示您已閱讀、瞭解並同意接受本服務條款之所有內容。</p>
        <h4 class="titleWrap titleH4">一、 服務說明與定位</h4>
        <p class="textbody2">本平台提供多人旅遊協作工具，包含空檔比對、行程規劃、旅遊方案（機加酒）媒合建議及費用分帳計算。本平台定位為「資訊整合與決策支援工具」，非旅行社或票務代理商，不直接參與使用者與第三方服務商之間的交易。</p>
        <h4 class="titleWrap titleH4">二、 使用者帳號安全與行為規範</h4>
        <p class="textbody2">使用者應妥善保管帳號密碼，並遵守行為守則；違反者平台得刪除內容或終止帳號。</p>
        <h4 class="titleWrap titleH4">三、 第三方服務與媒合免責聲明</h4>
        <p class="textbody2">本平台提供之推薦與媒合僅為資訊整合，實際交易發生於使用者與第三方供應商之間。本平台不承擔第三方交易之法律責任。</p>
        <h4 class="titleWrap titleH4">四、 費用管理與分帳工具說明</h4>
        <p class="textbody2">分帳工具僅提供計算與紀錄功能，本平台不處理實際金流，亦不對線下支付糾紛負責。</p>
        <h4 class="titleWrap titleH4">五、 系統維護與服務中斷</h4>
        <p class="textbody2">平台保留在必要維護或不可抗力等情況暫停服務的權利。</p>
        <h4 class="titleWrap titleH4">六、 條款修訂</h4>
        <p class="textbody2">本平台保留隨時修改本服務條款之權利，修正後條款將於網站公告；繼續使用服務即視為同意。</p>
         </div>
        `;

    function showPolicyModal(title, html) {
        return new Promise((resolve) => {
            // overlay & modal
            const $overlay = $('<div class="policy-overlay" role="dialog" aria-modal="true"></div>');
            const $modal = $(`
                <div class="policy-modal" tabindex="-1">
                    <div class="policy-modal__header">
                        <h4 class="policy-modal__title"></h4>
                        <button class="policy-modal__close" aria-label="關閉">&times;</button>
                    </div>
                    <div class="policy-modal__body"></div>
                    <div class="policy-modal__footer">
                        <button class="policy-modal__btn">關閉</button>
                    </div>
                </div>
            `);

            $modal.find('.policy-modal__title').text(title);
            $modal.find('.policy-modal__body').html(html);

            $overlay.append($modal);
            $('body').append($overlay);

            // trap focus simple
            const $focusable = $overlay.find('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])').filter(':visible');
            const firstFocusable = $focusable.first();
            const lastFocusable = $focusable.last();

            function cleanup(result) {
                $overlay.remove();
                $(document).off('keydown.policyModal');
                resolve(result);
            }

            // close handlers
            $overlay.on('click', function (e) {
                if (e.target === $overlay[0]) cleanup(false);
            });
            $modal.find('.policy-modal__close, .policy-modal__btn').on('click', function () {
                cleanup(true);
            });

            $(document).on('keydown.policyModal', function (e) {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Tab') {
                    // basic focus trap
                    const focused = $(document.activeElement);
                    if (e.shiftKey && focused.is(firstFocusable)) {
                        e.preventDefault();
                        lastFocusable.focus();
                    } else if (!e.shiftKey && focused.is(lastFocusable)) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            });

            // set initial focus
            setTimeout(function () {
                $modal.focus();
                firstFocusable && firstFocusable.focus();
            }, 20);
        });
    }

    // Expose globally (可在其他腳本手動呼叫)
    window.showPolicyModal = showPolicyModal;

    // 綁定頁面上對應連結（預防重複綁定）
    $(function () {
        $(document).off('click.policyLinks').on('click.policyLinks', '.privacyLink, .serviceLink', function (e) {
            e.preventDefault();
            const isPrivacy = $(this).hasClass('privacyLink');
            const title = isPrivacy ? '隱私權政策' : '服務條款';
            const html = isPrivacy ? privacyHtml : termsHtml;
            showPolicyModal(title, html);
        });
    });

})(window, window.jQuery);