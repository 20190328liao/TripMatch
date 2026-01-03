$(function () {
    // --- Step 1: Email 驗證 ---
    $("#email").on("keyup input", function () {
        const email = $(this).val().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const domain = email.includes("@") ? email.split("@")[1].toLowerCase() : "";

        let isEmailValid = false;

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

        // 更新按鈕狀態
        if (isEmailValid) {
            $("#btnSendReset").prop("disabled", false).removeClass("btn_Gray").addClass("btn_light");
        } else {
            $("#btnSendReset").prop("disabled", true).addClass("btn_Gray").removeClass("btn_light");
        }
    });

    $("#btnSendReset").on("click", function () {
        const email = $("#email").val().trim();
        const btn = $(this);
        
        btn.prop("disabled", true).text("發送中...");

        $.ajax({
            type: 'POST',
            url: '/AuthApi/SendPasswordReset',
            contentType: 'application/json',
            data: JSON.stringify(email),
            success: function (res) {
                btn.text("已發送").addClass("btn_Gray").removeClass("btn_light");
                $("#email").prop("readonly", true);
                $("#customAlert").removeClass("d-none");
                
                showPopup({ 
                    title: "已發送", 
                    message: "請至您的信箱點擊重設連結，該連結將帶您前往重設密碼頁面。", 
                    type: "success" 
                });
            },
            error: function () {
                btn.prop("disabled", false).text("寄驗證信").removeClass("btn_Gray").addClass("btn_light");
                showPopup({ title: "錯誤", message: "發送失敗，請稍後再試", type: "error" });
            }
        });
    });

    
    // 檢查 URL 是否包含重設密碼所需的參數
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const code = urlParams.get('code');

    if (userId && code) {
        goToStep2();
    }

    function goToStep2() {
        $("#step1-content").addClass("d-none");
        $("#step2-content").removeClass("d-none");
        
        // 更新指示器
        $("#step1-indicator").addClass("completed");
        $("#step2-indicator").addClass("completed").find(".step-badge").removeClass("bg-secondary").addClass("bg-warning");
        $("#step2-indicator").find(".step-number").replaceWith('<i class="bi bi-check-lg"></i>');
        $("#step3-indicator").find(".step-badge").addClass("bg-secondary");
    }

    // --- Step 2: 密碼重設 ---
    $("#newPassword, #confirmNewPassword").on("keyup input", validatePasswordForm);

    function validatePasswordForm() {
        const pwd = $("#newPassword").val();
        const confirmPwd = $("#confirmNewPassword").val();
        
        let pwdRules = [];
        if (pwd.length < 6 || pwd.length > 18) pwdRules.push("6~18位");
        if (!/[A-Z]/.test(pwd)) pwdRules.push("大寫英文");
        if (!/[a-z]/.test(pwd)) pwdRules.push("小寫英文");
        if (!/\d/.test(pwd)) pwdRules.push("數字");

        const isPwdValid = pwdRules.length === 0;

        if (!pwd) setFieldHint("newPassword");
        else if (isPwdValid) setFieldHint("newPassword", "☑ 格式正確", "success");
        else setFieldHint("newPassword", "☐ 需包含：" + pwdRules.join("、"), "error");

        if (!confirmPwd) setFieldHint("confirmNewPassword");
        else if (pwd === confirmPwd && isPwdValid) setFieldHint("confirmNewPassword", "☑ 密碼一致", "success");
        else if (pwd !== confirmPwd) setFieldHint("confirmNewPassword", "☐ 密碼不一致", "error");

        if (isPwdValid && pwd === confirmPwd) {
            $("#btnResetPassword").prop("disabled", false).removeClass("btn_Gray").addClass("btn_light");
        } else {
            $("#btnResetPassword").prop("disabled", true).addClass("btn_Gray").removeClass("btn_light");
        }
    }

    $("#btnResetPassword").on("click", function () {
        const password = $("#newPassword").val();
        const btn = $(this);
        
        btn.prop("disabled", true).text("處理中...");

        const payload = { 
            password: password,
            userId: userId,
            code: code
        };

        $.ajax({
            type: 'POST',
            url: '/AuthApi/PerformPasswordReset',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function (res) {
                goToStep3();
            },
            error: function (err) {
                btn.prop("disabled", false).text("返回登入");
                let msg = err.responseJSON?.message || "重設失敗";
                if (err.responseJSON?.errors) {
                    msg = Object.values(err.responseJSON.errors).flat().map(e => e.description).join("、");
                }
                showPopup({ title: "錯誤", message: msg, type: "error" });
            }
        });
    });

    function goToStep3() {
        $("#step2-content").addClass("d-none");
        $("#step3-content").removeClass("d-none");

        $("#step2-indicator").find(".step-badge").removeClass("bg-warning").addClass("bg-success");
        $("#step3-indicator").addClass("completed").find(".step-badge").removeClass("bg-secondary").addClass("bg-warning");
        $("#step3-indicator").find(".step-number").replaceWith('<i class="bi bi-check-lg"></i>');
    }
});