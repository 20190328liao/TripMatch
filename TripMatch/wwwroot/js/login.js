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
        const pwd = $("#password").val();
        const email = $("#email").val().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const domain = email.includes("@") ? email.split("@")[1].toLowerCase() : "";

        let isEmailValid = false;
        let isPwdValid = false;

        // --- Email 驗證流程 ---
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
        else if (domain !== "gmail.com" && /^g[amill]{3,6}\.com$/i.test(domain)) {
            setFieldHint("email", "⚠ 您是指 gmail.com 嗎？", "error");
        }
        else {
            isEmailValid = true;
            setFieldHint("email", "☑ Email 格式正確", "success");
        }

        // 密碼驗證：6~18碼、大寫、小寫、數字
        let pwdRules = [];
        if (pwd.length < 6 || pwd.length > 18) pwdRules.push("6~18位");
        if (!/[A-Z]/.test(pwd)) pwdRules.push("大寫英文");
        if (!/[a-z]/.test(pwd)) pwdRules.push("小寫英文");
        if (!/\d/.test(pwd)) pwdRules.push("數字");

        isPwdValid = (pwdRules.length === 0);

        if (!pwd) {
            setFieldHint("password");
        } else if (isPwdValid) {
            setFieldHint("password", "☑ 密碼格式符合規則", "success");
        } else {
            setFieldHint("password", "☐ 請修改：" + pwdRules.join("、"), "error");
        }

        if (isEmailValid && isPwdValid) {
            $("#btnLogin").prop("disabled", false).removeClass("btn_Gray").addClass("btn_light");
            $("#incompleteMessage").addClass("d-none");
        } else {
            $("#btnLogin").prop("disabled", true).removeClass("btn_light").addClass("btn_Gray");
            if (email && pwd) {
                $("#incompleteMessage").removeClass("d-none").text("請修正紅字標示的格式錯誤");
            } else {
                $("#incompleteMessage").addClass("d-none");
            }
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
                let errorMsg = "帳號或密碼錯誤，請重新輸入。";
                if (err.responseJSON && err.responseJSON.message) {
                    errorMsg = err.responseJSON.message;
                }
                showPopup({
                    title: "登入失敗",
                    message: errorMsg,
                    type: "error"
                });
            }
        });
    });

    // 初始執行一次，確保提示/按鈕狀態正確
    validateLoginForm();

});