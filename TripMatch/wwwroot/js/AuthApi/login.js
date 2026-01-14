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
        const loginData = {
            email: $('#email').val().trim(),
            password: $('#password').val()
        };

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
                // 前端登入回應處理：收到 success 後立即導向（或 reload）
                if (response?.success) {
                    // 顯示登入進度通知視窗（原本的登入通知窗）
                    try {
                        showPopup({
                            title: "登入中",
                            message: "登入成功，正在準備首頁，請稍候…",
                            type: "info",
                            autoClose: false // 由重導決定何時離開
                        });
                    } catch (e) {
                        // 若 showPopup 不可用，忽略並繼續導向
                    }

                    const url = response.redirectUrl || '/';

                    // 預載關鍵資源以縮短首次繪製時間（視專案實際檔案調整）
                    const preloads = [
                        '/css/site.css',
                        '/css/AuthApi/Calendar.css',
                        '/js/site.js',
                        '/js/AuthApi/Calendar.js'
                    ];
                    preloads.forEach(href => {
                        try {
                            const link = document.createElement('link');
                            link.rel = 'preload';
                            link.href = href;
                            link.as = href.endsWith('.css') ? 'style' : 'script';
                            document.head.appendChild(link);
                        } catch { /* ignore */ }
                    });

                    // 用一次 fetch 來 warm-up server（會帶 HttpOnly cookie，能讓伺服器提早建立狀態）
                    try {
                        await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-cache' });
                    } catch { /* 忽略 fetch 錯誤，仍然重導 */ }

                    // 小幅等待讓通知窗先呈現（避免瞬間閃動）
                    await new Promise(r => setTimeout(r, 200));

                    // 清除前端 avatar 快取（避免舊帳號 avatar 殘留）
                    try {
                        localStorage.removeItem('tm_avatar');
                    } catch (ex) {
                        console.warn('清除 avatar 快取失敗', ex);
                    }

                    // 以 replace 方式導向，避免產生 history entry 並快速切換頁面
                    window.location.replace(url);
                    return;
                }

                // 顯示錯誤
                alert(response?.message || '登入失敗');
            },
            error: function (err) {
                showPopup({
                    title: "登入失敗",
                    message: err.responseJSON?.message || "帳號或密碼錯誤，請重新輸入。",
                    type: "error"
                });
            }
        });
    });

    // 初始執行一次
    validateLoginForm();
});