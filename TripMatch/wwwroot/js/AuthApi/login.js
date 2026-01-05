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
            url: window.AppUrls.Auth.Login,
            contentType: 'application/json; charset=utf-8',
            data: JSON.stringify(loginData),
            headers: {
                "RequestVerificationToken": window.csrfToken
            },
            xhrFields: { withCredentials: true },
            success: function (response) {
                showPopup({
                    title: "登入成功",
                    message: response.message || "歡迎回來！",
                    type: "success",
                    autoClose: true,
                    seconds: 2
                }).then(() => {
                    const params = new URLSearchParams(window.location.search);
                    const returnUrl = params.get('returnUrl');
                    window.location.href = response.redirectUrl || returnUrl || window.AppUrls.Home.Index;
                });
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