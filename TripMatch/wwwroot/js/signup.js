$(function () {
        // ★ 檢查 URL 是否包含驗證參數
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    let isSending = false; // 防止觸發多次
    let isEmailVerified = false; // 追蹤 Email 是否已驗證
    let lastSentEmail = ""; // 記錄上次發送的 Email
    let cooldownTime = 0;
    let cooldownTimer = null;

    // 頁面載入時檢查驗證狀態
    checkStatusFromBackend();

    // 倒數計時器函式
    function startCooldown(seconds) {
        cooldownTime = seconds;
        const $btn = $("#checkEmail");
        
        $btn.prop("disabled", true).addClass("btn_Gray");

        if (cooldownTimer) clearInterval(cooldownTimer);

        cooldownTimer = setInterval(() => {
            cooldownTime--;
            if (cooldownTime <= 0) {
                clearInterval(cooldownTimer);
                $btn.prop("disabled", false).removeClass("btn_Gray").text("寄驗證信");
                setFieldHint("email", "☑ Email 格式正確，可重新發送驗證信", "success");
            } else {
                $btn.text(`重送(${cooldownTime}s)`);
            }
        }, 1000);
    }

    async function checkStatusFromBackend() {
        try {
            const res = await fetch(window.AppUrls.Auth.CheckDbStatus, { credentials: 'include' });
            const data = await res.json();
            if (data.verified && data.email) {
                isEmailVerified = true;
                $("#email").val(data.email).prop("readonly", true);
                setFieldHint("email", `☑ 偵測到信箱 ${data.email} 已驗證成功！`, "success");
                $("#checkEmail").prop("disabled", true).text("已完成驗證").addClass("btn_Gray");
                validateForm();
            }
        }
        catch (e) {
            console.error("檢查 Pending 狀態失敗", e);
        }
    }

    function validateForm() {
        const pwd = $("#password").val();
        const confirmPwd = $("#confirmPassword").val();
        const email = $("#email").val().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const gmailMistakeRegex = /^g[amill]{3,6}\.com$/i;
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
        else if (domain !== "gmail.com" && gmailMistakeRegex.test(domain)) {
            setFieldHint("email", "⚠ 您是指 gmail.com 嗎？", "error");
            isEmailValid = false;
        }
        else {
            isEmailValid = true;

            if (isEmailVerified) {
                setFieldHint("email", "☑ Email 驗證成功！", "success");
            }
            else if (cooldownTime > 0) {
                setFieldHint("email", `☑ 驗證信已寄出（${cooldownTime} 秒後可重送）`, "success");
            }
            else {
                setFieldHint("email", "☑ Email 格式正確，請寄送驗證信", "success");
            }
        }




        // 密碼驗證：6~18碼、大寫、小寫、數字
        // (?=.*[a-z]) : 至少包含一個小寫
        // (?=.*[A-Z]) : 至少包含一個大寫
        // (?=.*\d)    : 至少包含一個數字
        // .{6,18}     : 長度在 6 到 18 之間
        let pwdRules = [];
        if (pwd.length < 6 || pwd.length > 18) pwdRules.push("6~18位");
        if (!/[A-Z]/.test(pwd)) pwdRules.push("大寫英文");
        if (!/[a-z]/.test(pwd)) pwdRules.push("小寫英文");
        if (!/\d/.test(pwd)) pwdRules.push("數字");

        const isPwdValid = pwdRules.length === 0;

        if (!pwd) {
            setFieldHint("password");
        } else if (isPwdValid) {
            setFieldHint("password", "☑ 密碼格式符合規則", "success");
        } else {
            setFieldHint("password", "☐ 請修改：" + pwdRules.join("、"), "error");
        }
        if (!confirmPwd) {
            setFieldHint("confirmPassword");
        }
        else if (!isPwdValid) {
            // 狀況 A：兩次輸入可能一致，但「原始格式」根本不對
            setFieldHint("confirmPassword", "☐ 密碼格式不符，請參考上方提示", "error");
        }
        else if (pwd !== confirmPwd) {
            // 狀況 B：格式對了，但兩次打的不一樣
            setFieldHint("confirmPassword", "☐ 密碼不一致", "error");
        }
        else {
            // 狀況 C：格式正確 且 兩次一致
            setFieldHint("confirmPassword", "☑ 密碼一致且符合規範", "success");
        }

        const canRegister = isEmailValid && isPwdValid && (pwd === confirmPwd) && isEmailVerified;

        if (canRegister) {
            // 全部完成：隱藏提示文字，按鈕變亮色
            $("#incompleteMessage").addClass("d-none");
            $("#btnRegister")
                .prop("disabled", false)
                .removeClass("btn_Gray")
                .addClass("btn_light");
        } else {
            // 任一未完成：顯示提示文字，按鈕維持灰色
            $("#incompleteMessage").removeClass("d-none");
            if (!isEmailVerified && isEmailValid) {
                $("#incompleteMessage").text("您好，請完成 Email 驗證");
            }

        }
    }
    function autoSendEmail(email) {
        isSending = true;
        lastSentEmail = email;
        $.ajax({
            type: 'POST',
            url: window.AppUrls.Auth.SendConfirmation,
            contentType: 'application/json',
            data: JSON.stringify(email),
            success: function (res) {
                isSending = false;
                startCooldown(30);
                showPopup({ title: "驗證信已發送", message: "請點擊信中連結，驗證後回到此頁重新整理即可。" });
            },
            error: function (err) {
                isSending = false;
                lastSentEmail = "";//重置
                const data = err.responseJSON;
                if (data && data.action === "redirect_login") {
                    window.location.href = window.AppUrls.Auth.Login;
                }
            }
        });
    }

    // 點擊「寄驗證信」按鈕
    $("#checkEmail").on('click', function () {
        const email = $('#email').val().trim();

        if (!email) {
            showPopup({ title: "提示", message: "請先輸入 Email", type: "error" });
            return;
        }

        // 1. 檢查是否已驗證
        if (isEmailVerified) {
            showPopup({ title: "提示", message: "此信箱已完成驗證，請直接設定密碼。", type: "success" });
            return;
        }

        // 2. 檢查是否在冷卻中
        if (cooldownTime > 0) {
            showPopup({ title: "提示", message: `請稍候 ${cooldownTime} 秒再試`, type: "warning" });
            return;
        }

        // 3. 檢查是否正在發送中
        if (isSending) return;

        isSending = true;
        const $btn = $(this);
        $btn.prop('disabled', true).text('發送中...');

        $.ajax({
            type: 'POST',
            url: window.AppUrls.Auth.SendConfirmation,
            contentType: 'application/json',
            data: JSON.stringify(email),
            success: function (res) {
                isSending = false;
                
                if (res.verified) {
                    // 已經驗證過了 (後端回傳 verified: true)
                    isEmailVerified = true;
                    $("#email").val(email).prop("readonly", true);
                    $btn.prop("disabled", true).text("已完成驗證").addClass("btn_Gray");
                    setFieldHint("email", "☑ 此信箱已驗證成功！請直接設定密碼。", "success");
                    validateForm();
                    showPopup({ title: "提示", message: "您先前已完成驗證，請直接設定密碼即可。", type: "success" });
                } else {
                    // 成功寄出
                    startCooldown(30); // 開始 30 秒倒數
                    showPopup({ title: "發送成功", message: res.message || "驗證信已發送，請檢查信箱。", type: "success" });
                }
            },
            error: function (err) {
                isSending = false;
                $btn.prop('disabled', false).text('寄驗證信'); // 失敗則恢復按鈕
                
                const data = err.responseJSON;
                if (data && data.action === "redirect_login") {
                    showPopup({ title: "提示", message: data.message, type: "warning" }).then(() => {
                        window.location.href = window.AppUrls.Auth.Login;
                    });
                } else {
                    showPopup({ title: "發送失敗", message: data?.message || "請稍後再試", type: "error" });
                }
            }
        });
    });

    window.addEventListener("focus", function () {
        if (!isEmailVerified) {
            checkStatusFromBackend();
        }
    });

    $("#btnRegister").prop("disabled", true)
        .addClass("btn_Gray")
        .removeClass("btn_light");
    $("#email, #password, #confirmPassword").on("keyup input", validateForm);

    $('#btnRegister').on("click", function () {
        const userData = {
            email: $('#email').val().trim(),
            password: $('#password').val(),
            confirmPassword: $("#confirmPassword").val()
        };
        $("#btnRegister").prop("disabled", true).text("處理中...");
        $.ajax({
            type: 'post',
            url: window.AppUrls.Auth.Register,
            contentType: 'application/json',
            data: JSON.stringify(userData),
            success: function (res) {
                window.location.href = res.redirectUrl || window.AppUrls.Auth.Login;
            },
            error: async function (err) {
                $("#btnRegister").prop("disabled", false).text("建立帳戶");
                let msg = err.responseJSON?.message || "註冊失敗，請稍後再試";
                if (err.responseJSON?.errors) {
                    msg = Object.values(err.responseJSON.errors).flat().map(e => e.description).join("、");
                }
                showPopup({ title: "錯誤", message: msg, type: "error" });
            }
        });
    });
});
