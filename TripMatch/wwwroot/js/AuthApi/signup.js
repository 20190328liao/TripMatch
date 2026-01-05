$(function () {
        // 檢查 URL 是否包含驗證參數
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
        const email = $("#email").val().trim();
        const pwd = $("#password").val();
        const confirmPwd = $("#confirmPassword").val();

        // 使用共用 Validator
        const emailResult = Validator.validateEmail(email);
        const passwordResult = Validator.validatePassword(pwd);
        const confirmPwdResult = Validator.validateConfirmPassword(pwd, confirmPwd);

        // --- Email 驗證流程 ---
        let isEmailValid = emailResult.valid;
        if (isEmailValid) {
            if (isEmailVerified) {
                setFieldHint("email", "☑ Email 驗證成功！", "success");
            } else if (cooldownTime > 0) {
                setFieldHint("email", `☑ 驗證信已寄出（${cooldownTime} 秒後可重送）`, "success");
            } else {
                setFieldHint("email", "☑ Email 格式正確，請寄送驗證信", "success");
            }
        } else {
            setFieldHint("email", emailResult.message, "error");
        }

        // --- 密碼驗證 ---
        if (!pwd) {
            setFieldHint("password");
        } else {
            setFieldHint("password", passwordResult.message, passwordResult.valid ? "success" : "error");
        }

        // --- 確認密碼驗證 ---
        if (!confirmPwd) {
            setFieldHint("confirmPassword");
        } else {
            setFieldHint("confirmPassword", confirmPwdResult.message, confirmPwdResult.valid ? "success" : "error");
        }

        // --- 按鈕狀態 ---
        const canRegister = isEmailValid && passwordResult.valid && confirmPwdResult.valid && isEmailVerified;

        if (canRegister) {
            $("#incompleteMessage").addClass("d-none");
            $("#btnRegister")
                .prop("disabled", false)
                .removeClass("btn_Gray")
                .addClass("btn_light");
        } else {
            $("#incompleteMessage").removeClass("d-none");
            if (!isEmailVerified && isEmailValid) {
                $("#incompleteMessage").text("您好，請完成 Email 驗證");
            }
            $("#btnRegister")
                .prop("disabled", true)
                .removeClass("btn_light")
                .addClass("btn_Gray");
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

    // 點擊「清除並重新開始」
    $("#btnClearAndNew").on("click", function () {
        $.ajax({
            type: 'POST',
            url: window.AppUrls.Auth.ClearPendingSession,
            success: function () {
                // 清除表單
                $("#email").val("").prop("readonly", false);
                $("#password").val("");
                $("#confirmPassword").val("");

                // 清除提示
                setFieldHint("email");
                setFieldHint("password");
                setFieldHint("confirmPassword");

                // 重置按鈕狀態
                $("#checkEmail").prop("disabled", false).text("寄驗證信").removeClass("btn_Gray");
                $("#btnRegister").prop("disabled", true).addClass("btn_Gray").removeClass("btn_light");
                $("#incompleteMessage").addClass("d-none");

                showPopup({
                    title: "已清除",
                    message: "現在可以輸入新的 Email 註冊了！",
                    type: "success",
                    autoClose: true,
                    seconds: 2
                });
            },
            error: function () {
                // 即使 API 失敗，也清除前端
                location.reload();
            }
        });
    });
});
