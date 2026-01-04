$(function () {
    const urlParams = new URLSearchParams(window.location.search);
    const userIdParam = urlParams.get('userId');
    const codeParam = urlParams.get('code');
    const error = urlParams.get('error');

    let verified = false;
    let currentUserId = userIdParam || "";
    let currentCode = codeParam || "";

    // 初始化：灰底數字 1/2/3
    function initializeStepIndicators() {
        $("#step1_indicator").removeClass().addClass("step_item step_incomplete");
        $("#step2_indicator").removeClass().addClass("step_item step_incomplete");
        $("#step3_indicator").removeClass().addClass("step_item step_incomplete");

        $("#step1_indicator .step_badge").html('<span class="step_number">1</span>');
        $("#step2_indicator .step_badge").html('<span class="step_number">2</span>');
        $("#step3_indicator .step_badge").html('<span class="step_number">3</span>');
    }
    initializeStepIndicators();

    // 錯誤處理
    if (error) {
        let errorMsg = "驗證失敗，請重新嘗試";
        let shouldReset = false;

        if (error === "invalid_link") { errorMsg = "無效的驗證連結"; shouldReset = true; }
        if (error === "user_not_found_reset") { errorMsg = "找不到此使用者，請回到忘記密碼頁面按重寄驗證信"; shouldReset = true; }
        if (error === "invalid_code") { errorMsg = "驗證碼已過期，請回到忘記密碼頁面按重寄驗證信"; shouldReset = true; }
        if (error === "code_already_used") { errorMsg = "此驗證連結已被使用過，請回到忘記密碼頁面按重寄驗證信"; shouldReset = true; }

        showPopup({ title: "驗證失敗", message: errorMsg, type: "error" });
        if (shouldReset) window.history.replaceState({}, document.title, window.AppUrls.Auth.ForgotPassword);
    }

    // ★ 檢查 Session 中是否有存儲的有效連結
    async function checkStoredPasswordResetLink() {
        try {
            const res = await fetch(window.AppUrls.Auth.CheckPasswordResetSession, { 
                method: 'POST',
                credentials: 'include'
            });
            const data = await res.json();
            
            if (data.hasValidLink) {
                verified = true;
                currentUserId = data.userId;
                currentCode = data.code;
                enableNext(true);
                goToStep2();
            }
        } catch (err) {
            console.error("檢查會話失敗:", err);
        }
    }

    // 有連結參數先驗證
    if (currentUserId && currentCode) {
        validateAndGoToStep2(currentUserId, currentCode, { cache: true, storeSession: true });
    } else {
        checkStoredPasswordResetLink();
    }

    // 驗證重設密碼連結有效性
    function validateAndGoToStep2(userId, code, opt = { cache: false, storeSession: false }) {
        $.ajax({
            type: 'POST',
            url: window.AppUrls.Auth.ValidatePasswordResetLink,
            contentType: 'application/json',
            data: JSON.stringify({ userId, code }),
            success: function (res) {
                if (res.valid) {
                    verified = true;
                    currentUserId = userId;
                    currentCode = code;
                    enableNext(true);

                    if (opt.storeSession) {
                        $.ajax({
                            type: 'POST',
                            url: window.AppUrls.Auth.SetPasswordResetSession,
                            contentType: 'application/json',
                            data: JSON.stringify({ userId, code })
                        });
                    }

                    goToStep2();
                } else {
                    showPopup({
                        title: "連結無效",
                        message: res.message || "驗證碼已過期或已被使用，請回到忘記密碼頁面按重寄驗證信",
                        type: "error"
                    });
                    window.history.replaceState({}, document.title, window.AppUrls.Auth.ForgotPassword);
                }
            },
            error: function (err) {
                const errorMsg = err.responseJSON?.message || "驗證碼已過期或已被使用，請回到忘記密碼頁面按重寄驗證信";
                showPopup({ title: "驗證失敗", message: errorMsg, type: "error" });
                window.history.replaceState({}, document.title, window.AppUrls.Auth.ForgotPassword);
            }
        });
    }

    // 檢查 Pending Cookie
    async function checkPendingThenToggleNext() {
        try {
            const res = await fetch(window.AppUrls.Auth.CheckDbStatus, { credentials: 'include' });
            const data = await res.json();
            if (data.verified) {
                verified = true;
                $("#email").val(data.email).prop("readonly", true);
                setFieldHint("email", `☑ 已驗證：${data.email}`, "success");
                enableNext(true);
            } else {
                enableNext(false);
            }
        } catch {
            enableNext(false);
        }
    }

    function enableNext(enable) {
        $("#btn_next_step")
            .prop("disabled", !enable)
            .toggleClass("btn_Gray", !enable)
            .toggleClass("btn_light", enable);
    }

    // Email 輸入驗證
    $("#email").on("keyup input", function () {
        const email = $(this).val().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const domain = email.includes("@") ? email.split("@")[1].toLowerCase() : "";
        let isEmailValid = false;

        if (!email) setFieldHint("email", "☐ 請輸入 Email", "error");
        else if (!email.includes("@")) setFieldHint("email", "☐ 缺少 @ 符號", "error");
        else if (!email.includes(".") || email.lastIndexOf(".") < email.indexOf("@")) setFieldHint("email", "☐ 缺少網域點 (.com 等)", "error");
        else if (!emailRegex.test(email)) setFieldHint("email", "☐ Email 格式不正確", "error");
        else if (domain !== "gmail.com" && /^g[amill]{3,6}\.com$/i.test(domain)) setFieldHint("email", "⚠ 您是指 gmail.com 嗎？", "error");
        else { isEmailValid = true; setFieldHint("email", "☑ Email 格式正確", "success"); }

        $("#btn_send_reset").prop("disabled", !isEmailValid).toggleClass("btn_Gray", !isEmailValid).toggleClass("btn_light", isEmailValid);
    });

    // Step 1: 寄送重設信件
    $("#btn_send_reset").on("click", function () {
        const email = $("#email").val().trim();
        const btn = $(this);

        btn.prop("disabled", true).text("發送中...");

        $.ajax({
            type: 'POST',
            url: window.AppUrls.Auth.SendPasswordReset,
            contentType: 'application/json',
            data: JSON.stringify(email),
            success: function () {
                btn.text("已發送").addClass("btn_Gray").removeClass("btn_light").prop("disabled", true);
                $("#email").prop("readonly", true);
                $("#custom_alert").removeClass("d-none");
                showPopup({
                    title: "已發送",
                    message: "請至信箱點擊重設連結。驗證連結有效期 24 小時，且只能驗證一次。",
                    type: "success"
                });
                enableNext(false);
            },
            error: function (err) {
                btn.prop("disabled", false).text("寄驗證信").removeClass("btn_Gray").addClass("btn_light");
                const errorMsg = err.responseJSON?.message || "發送失敗，請稍後再試";
                showPopup({ title: "錯誤", message: errorMsg, type: "error" });
            }
        });
    });

    // 下一步
    $("#btn_next_step").on("click", async function () {
        if (currentUserId && currentCode) {
            validateAndGoToStep2(currentUserId, currentCode);
            return;
        }
        await checkPendingThenToggleNext();
        if (verified) {
            goToStep2();
        } else {
            showPopup({
                title: "尚未驗證",
                message: "請先前往信箱完成驗證，再按下一步。",
                type: "error"
            });
        }
    });

    function goToStep2() {
        $("#step1_content").addClass("d-none");
        $("#step2_content").removeClass("d-none");

        $("#step1_indicator").removeClass("step_incomplete step_active").addClass("step_completed");
        $("#step1_indicator .step_badge").html('<span class="step_number">1</span>');

        $("#step2_indicator").removeClass("step_incomplete step_completed").addClass("step_active");
        $("#step2_indicator .step_badge").html('<img src="/img/check2.svg" alt="進行中" style="width: 24px; height: 24px;">');

        $("#step3_indicator").removeClass("step_completed step_active").addClass("step_incomplete");
        $("#step3_indicator .step_badge").html('<span class="step_number">3</span>');

        $("#new_password").val("");
        $("#confirm_new_password").val("");
        setFieldHint("new_password");
        setFieldHint("confirm_new_password");
        $("#btn_reset_password").prop("disabled", true).addClass("btn_Gray").removeClass("btn_light");
    }

    // Step 2: 密碼驗證
    $("#new_password, #confirm_new_password").on("keyup input", validatePasswordForm);

    function validatePasswordForm() {
        const pwd = $("#new_password").val();
        const confirmPwd = $("#confirm_new_password").val();
        let pwdRules = [];
        if (pwd.length < 6 || pwd.length > 18) pwdRules.push("6~18位");
        if (!/[A-Z]/.test(pwd)) pwdRules.push("大寫英文");
        if (!/[a-z]/.test(pwd)) pwdRules.push("小寫英文");
        if (!/\d/.test(pwd)) pwdRules.push("數字");

        const isPwdValid = pwdRules.length === 0;

        if (!pwd) setFieldHint("new_password");
        else if (isPwdValid) setFieldHint("new_password", "☑ 格式正確", "success");
        else setFieldHint("new_password", "☐ 需包含：" + pwdRules.join("、"), "error");

        if (!confirmPwd) setFieldHint("confirm_new_password");
        else if (pwd === confirmPwd && isPwdValid) setFieldHint("confirm_new_password", "☑ 密碼一致", "success");
        else if (pwd !== confirmPwd) setFieldHint("confirm_new_password", "☐ 密碼不一致", "error");

        const canSubmit = isPwdValid && pwd === confirmPwd;
        $("#btn_reset_password").prop("disabled", !canSubmit)
            .toggleClass("btn_Gray", !canSubmit).toggleClass("btn_light", canSubmit);
    }

    // Step 2: 執行密碼重設
    $("#btn_reset_password").on("click", function () {
        const password = $("#new_password").val();
        const btn = $(this);

        btn.prop("disabled", true).text("處理中...");

        const payload = { password, userId: currentUserId, code: currentCode };

        $.ajax({
            type: 'POST',
            url: window.AppUrls.Auth.PerformPasswordReset,
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function () {
                showPopup({
                    title: "成功",
                    message: "密碼已重設，將直接前往登入頁。",
                    type: "success"
                });
                
                $.ajax({
                    type: 'POST',
                    url: window.AppUrls.Auth.ClearPasswordResetSession,
                    success: function () {
                        goToStep3();
                    }
                });
            },
            error: function (err) {
                btn.prop("disabled", false).text("重設密碼");
                let msg = err.responseJSON?.message || "重設失敗";
                if (msg.includes("已使用") || msg.includes("已過期")) {
                    msg = "驗證連結已失效，請回到忘記密碼頁面按重寄驗證信";
                }
                if (err.responseJSON?.errors) {
                    msg = Object.values(err.responseJSON.errors).flat().map(e => typeof e === 'string' ? e : e.description).join("、");
                }
                showPopup({ title: "錯誤", message: msg, type: "error" });
            }
        });
    });

    function goToStep3() {
        $("#step1_indicator").removeClass("step_incomplete step_active").addClass("step_completed");
        $("#step1_indicator .step_badge").html('<span class="step_number">1</span>');

        $("#step2_indicator").removeClass("step_incomplete step_active").addClass("step_completed");
        $("#step2_indicator .step_badge").html('<span class="step_number">2</span>');

        $("#step3_indicator").removeClass("step_incomplete step_completed").addClass("step_active");
        $("#step3_indicator .step_badge").html('<i class="bi bi-check-lg"></i>');

        window.location.href = window.AppUrls.Auth.Login;
    }
});