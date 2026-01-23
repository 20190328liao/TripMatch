$(function () {
    const regSuccess = localStorage.getItem('showRegSuccess');
    if (regSuccess === 'true') {
        showPopup({
            title: "註冊成功",
            message: "歡迎加入！現在可以開始登入了。",
            type: "success",
            autoClose: true,
            seconds: 30
        });
        localStorage.removeItem('showRegSuccess');
    }

    function isLocalPath(url) {
        if (!url) return false;
        if (!url.startsWith('/')) return false;
        if (url.startsWith('//')) return false;
        if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url)) return false;
        return true;
    }

    // 2. 驗證邏輯函式
    function validateLoginForm() {
        const email = $('#email').val().trim();
        const pwd = $('#password').val();
        const emailResult = Validator.validateEmail(email);
        const pwdResult = Validator.validatePassword(pwd);

        setFieldHint("email", emailResult.message, emailResult.valid ? "success" : "error");
        if (pwd) {
            setFieldHint("password", pwdResult.message, pwdResult.valid ? "success" : "error");
        } else {
            setFieldHint("password");
        }

        const canLogin = emailResult.valid && pwdResult.valid;

        $("#btnLogin")
            .prop("disabled", !canLogin)
            .toggleClass("btn_Gray", !canLogin)
            .toggleClass("btn_light", canLogin);

        $("#incompleteMessage").toggleClass("d-none", canLogin || !email || !pwd);
        if (!canLogin && email && pwd) {
            $("#incompleteMessage").text("請修正紅字標示的格式錯誤");
        }
    }

    // 3. 事件綁定
    $("#email, #password").on("keyup input", validateLoginForm);

    // 4. 登入 API 呼叫
    $('#btnLogin').on("click", function () {
        // NOTE: 使用與後端模型一致的屬性名稱 (Email / Password)
        const loginData = {
            Email: $('#email').val().trim(),
            Password: $('#password').val()
        };

        console.debug('Login request payload:', loginData);

        $.ajax({
            type: 'post',
            url: window.Routes.AuthApi.Signin,
            contentType: 'application/json; charset=utf-8',
            data: JSON.stringify(loginData),
            headers: {
                "RequestVerificationToken": window.csrfToken
            },
            xhrFields: { withCredentials: true },
            success: async function (response) {
                if (response?.success) {
                    try {
                        showPopup({
                            title: "登入中",
                            message: "登入成功，正在準備首頁，請稍候…",
                            type: "info",
                            autoClose: false
                        });
                    } catch (e) { /* ignore */ }

                    const url = response.redirectUrl || '/';
                    // small warm-up & cleanup
                    try { localStorage.removeItem('tm_avatar'); } catch {}

                    // 若本頁帶有 returnUrl（hidden input 或 query），寫入 invite_return cookie 讓首頁 modal 可以顯示
                    try {
                        const returnInput = document.querySelector('input[name="returnUrl"]');
                        let returnUrl = returnInput ? (returnInput.value || null) : null;

                        // fallback: 從 query string 取
                        if (!returnUrl) {
                            const qs = new URLSearchParams(window.location.search);
                            returnUrl = qs.get('ReturnUrl') || qs.get('returnUrl') || null;
                        }

                        if (returnUrl && isLocalPath(returnUrl)) {
                            // encode 存 cookie（首頁的 getCookie 會 decodeURIComponent）
                            const encoded = encodeURIComponent(returnUrl);
                            // max-age 600s = 10min, path=/, SameSite=Lax (與 server 之前的 cookie 行為一致)
                            document.cookie = `invite_return=${encoded}; Max-Age=600; path=/; samesite=Lax`;
                        }
                    } catch (e) {
                        // 不阻斷導向
                        console.debug('set invite_return cookie failed', e);
                    }

                    await new Promise(r => setTimeout(r, 200));
                    window.location.replace(url);
                    return;
                }

                // 如果 server 回 200 但 success=false，顯示 message
                const msg = response?.message || '登入失敗';
                showPopup({ title: "登入失敗", message: msg, type: "error" });
            },
            error: function (jqXHR) {
                // 更明確顯示伺服器回傳的錯誤 JSON（如果有）
                let title = "登入失敗";
                let message = "帳號或密碼錯誤，請重新輸入。";
                try {
                    const json = jqXHR.responseJSON || (jqXHR.responseText ? JSON.parse(jqXHR.responseText) : null);
                    if (json) {
                        // 常見情況：ModelState 驗證錯誤會放在 errors 或 ModelState
                        if (json.message) message = json.message;
                        else if (json.errors) message = JSON.stringify(json.errors);
                        else message = JSON.stringify(json);
                    } else if (jqXHR.status) {
                        message = `伺服器回應: ${jqXHR.status} ${jqXHR.statusText}`;
                    }
                } catch (ex) {
                    message = jqXHR.responseText || jqXHR.statusText || message;
                }

                console.error('Signin error response:', jqXHR);
                showPopup({ title: title, message: message, type: "error" });
            }
        });
    });

    // 初始執行一次
    validateLoginForm();
});