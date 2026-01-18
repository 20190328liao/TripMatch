$(function () {
    const urlParams = new URLSearchParams(window.location.search);
    const userIdParam = urlParams.get('userId');
    const codeParam = urlParams.get('code');
    const error = urlParams.get('error');

    const goStepParam = urlParams.get('goStep') || urlParams.get('backupToReset');
    const goStepEmail = urlParams.get('email');

    let verified = false;
    let currentUserId = userIdParam || "";
    let currentCode = codeParam || "";

    let cooldownTime = 0;
    let cooldownTimer = null;

    function startCooldown(seconds, $btn, hintSelector) {
        cooldownTime = seconds;
        $btn.prop("disabled", true).addClass("btn_Gray").removeClass("btn_light");
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(() => {
            cooldownTime--;
            if (cooldownTime <= 0) {
                clearInterval(cooldownTimer);
                cooldownTimer = null;
                $btn.prop("disabled", false).removeClass("btn_Gray").addClass("btn_light").text("重新寄驗證信");
                if (hintSelector) $(hintSelector).text("");
            } else {
                $btn.text(`重送(${cooldownTime}s)`);
                if (hintSelector) $(hintSelector).text(`請稍候 ${cooldownTime} 秒後可重寄`);
            }
        }, 1000);
    }

    // 顯示或隱藏重寄提示（但實際寄/重寄用同一按鈕 #btn_send_reset）
    function showResendSection(show, message) {
        if (show) {
            $("#resend_wrap").removeClass("d-none");
            if (message) $("#resend_hint").text(message);
            // 啟用主按鈕為「重新寄驗證信」
            $("#btn_send_reset").prop("disabled", false).removeClass("btn_Gray").addClass("btn_light").text("重新寄驗證信");
        } else {
            $("#resend_wrap").addClass("d-none");
            $("#resend_hint").text("");
        }
    }

    // 初始化步驟指示器
    function initializeStepIndicators() {
        $("#step1_indicator").removeClass().addClass("step_item step_incomplete");
        $("#step2_indicator").removeClass().addClass("step_item step_incomplete");
        $("#step3_indicator").removeClass().addClass("step_item step_incomplete");

        $("#step1_indicator .step_badge").html('<span class="step_number">1</span>');
        $("#step2_indicator .step_badge").html('<span class="step_number">2</span>');
        $("#step3_indicator .step_badge").html('<span class="step_number">3</span>');
    }
    initializeStepIndicators();

    // 處理 URL 錯誤訊息
    if (error) {
        let errorMsg = "驗證失敗，請重新嘗試";
        let shouldReset = false;

        if (error === "invalid_link") { errorMsg = "無效的驗證連結"; shouldReset = true; }
        if (error === "user_not_found_reset") { errorMsg = "找不到此使用者，請回到忘記密碼頁面按重寄驗證信"; shouldReset = true; }
        if (error === "invalid_code") { errorMsg = "驗證碼已過期，請回到忘記密碼頁面按重寄驗證信"; shouldReset = true; }
        if (error === "code_already_used") { errorMsg = "此驗證連結已被使用過，請回到忘記密碼頁面按重寄驗證信"; shouldReset = true; }

        showPopup({ title: "驗證失敗", message: errorMsg, type: "error" });
        if (shouldReset) {
            // 顯示重寄提示並清掉舊的 session/cookie
            showResendSection(true, errorMsg);
            $.post(window.Routes.AuthApi.ClearPasswordResetSession).always(() => {
                // 保險呼叫一次（若第一個失敗）
                $.post(window.Routes.AuthApi.ClearPasswordResetSession);
            });
            window.history.replaceState({}, document.title, window.Routes.Auth.ForgotPassword);
        }
    }

    // 檢查是否有已儲存的重設連結（session）
    async function checkStoredPasswordResetLink() {
        try {
            const res = await fetch(window.Routes.AuthApi.CheckPasswordResetSession, {
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

    // 若網址帶參數，先驗證並進入 Step2
    if (currentUserId && currentCode) {
        validateAndGoToStep2(currentUserId, currentCode, { storeSession: true });
    } else {
        checkStoredPasswordResetLink();
    }

    // 驗證重設密碼連結有效性 (呼叫後端驗證)
    function validateAndGoToStep2(userId, code, opt = { storeSession: false }) {
        $.ajax({
            type: 'POST',
            url: window.Routes.AuthApi.ValidatePasswordResetLink,
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
                            url: window.Routes.AuthApi.SetPasswordResetSession,
                            contentType: 'application/json',
                            data: JSON.stringify({ userId, code })
                        });
                    }

                    showResendSection(false);
                    goToStep2();
                } else {
                    // token 無效或過期：顯示重寄並清除舊 session
                    const msg = res.message || "驗證碼已過期或已被使用，請回到忘記密碼頁面按重寄驗證信";
                    showPopup({ title: "連結無效", message: msg, type: "error" });
                    showResendSection(true, msg);
                    $.post(window.Routes.AuthApi.ClearPasswordResetSession);
                    window.history.replaceState({}, document.title, window.Routes.Auth.ForgotPassword);
                }
            },
            error: function (err) {
                const errorMsg = err.responseJSON?.message || "驗證碼已過期或已被使用，請回到忘記密碼頁面按重寄驗證信";
                showPopup({ title: "驗證失敗", message: errorMsg, type: "error" });
                showResendSection(true, errorMsg);
                $.post(window.Routes.AuthApi.ClearPasswordResetSession);
                window.history.replaceState({}, document.title, window.Routes.Auth.ForgotPassword);
            }
        });
    }

    // 檢查 Pending Cookie，並控制下一步按鈕
    async function checkPendingThenToggleNext() {
        try {
            const res = await fetch(window.Routes.AuthApi.CheckDbStatus, { credentials: 'include' });
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

    // Email input 驗證
    $("#email").on("keyup input", function () {
        const email = $(this).val().trim();
        const emailResult = Validator.validateEmail(email);

        setFieldHint("email", emailResult.message, emailResult.valid ? "success" : "error");

        const canSend = emailResult.valid && cooldownTime <= 0;
        $("#btn_send_reset")
            .prop("disabled", !canSend)
            .toggleClass("btn_Gray", !canSend)
            .toggleClass("btn_light", canSend);
    });

    // Step 1: 寄送或重寄驗證信（同一顆按鈕）
    $("#btn_send_reset").on("click", function () {
        const email = $("#email").val().trim();
        const btn = $(this);

        if (!Validator.validateEmail(email).valid) {
            showPopup({ title: "提示", message: "請輸入有效 Email", type: "error" });
            return;
        }

        btn.prop("disabled", true).text("發送中...");

        $.ajax({
            type: 'POST',
            url: window.Routes.AuthApi.SendPasswordReset,
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
                startCooldown(30, $("#btn_send_reset"), "#resend_hint");
                enableNext(false);
                showResendSection(false);
            },
            error: function (err) {
                btn.prop("disabled", false).text("寄驗證信").removeClass("btn_Gray").addClass("btn_light");
                const data = err.responseJSON || {};
                const message = data.message || "發送失敗，請稍後再試";
                showPopup({ title: "錯誤", message: message, type: "error" });
                if (data.action === "redirect_signup") {
                    setTimeout(() => { window.location.href = window.Routes.AuthApi.Register; }, 1500);
                }
            }
        });
    });

    // 下一步按鈕：檢查是否有 pending 並進入 Step2
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

    // Step 2 驗證與重設（維持原有邏輯）
    $("#new_password, #confirm_new_password").on("keyup input", validatePasswordForm);

    function validatePasswordForm() {
        const pwd = $("#new_password").val();
        const confirmPwd = $("#confirm_new_password").val();
        const pwdResult = Validator.validatePassword(pwd);

        if (!pwd) setFieldHint("new_password");
        else setFieldHint("new_password", pwdResult.valid ? "☑ 格式正確" : "☐ 需包含：" + pwdResult.missingRules.join("、"), pwdResult.valid ? "success" : "error");

        if (!confirmPwd) setFieldHint("confirm_new_password");
        else if (pwd === confirmPwd && pwdResult.valid) setFieldHint("confirm_new_password", "☑ 密碼一致", "success");
        else if (pwd !== confirmPwd) setFieldHint("confirm_new_password", "☐ 密碼不一致", "error");

        const canSubmit = pwdResult.valid && pwd === confirmPwd;
        $("#btn_reset_password").prop("disabled", !canSubmit).toggleClass("btn_Gray", !canSubmit).toggleClass("btn_light", canSubmit);
    }

    $("#btn_reset_password").on("click", function () {
        const password = $("#new_password").val();
        const btn = $(this);

        btn.prop("disabled", true).text("處理中...");

        const payload = { password, userId: currentUserId, code: currentCode };

        $.ajax({
            type: 'POST',
            url: window.Routes.AuthApi.PerformPasswordReset,
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function () {
                // ★★★ 密碼重設成功後，呼叫清除 Session（加上錯誤處理） ★★★
                $.ajax({
                    type: 'POST',
                    url: window.Routes.AuthApi.ClearPasswordResetSession,
                    success: function () {
                        // Session 清除成功，前往 Step3
                        goToStep3();
                    },
                    error: function () {
                        // Session 清除失敗，但仍前往 Step3（避免卡住）
                        console.warn("清除 Session 失敗，但繼續前往登入頁");
                        goToStep3();
                    }
                });
            },
            error: function (err) {
                btn.prop("disabled", false).text("重設密碼");
                let msg = err.responseJSON?.message || "重設失敗";
                if (msg.includes("已使用") || msg.includes("已過期")) {
                    msg = "驗證連結已失效，請回到忘記密碼頁面按重寄驗證信";
                    showResendSection(true, msg);
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

        window.location.href = window.Routes.Auth.Login;
    }

    // 在檔案開頭的初始化區塊（在解析 urlParams、userIdParam、codeParam、error 之後）加入下列處理
    (function () {
        const backupToReset = urlParams.get('backupToReset');
        const backupEmailParam = urlParams.get('email');

        // 若從備援信箱頁面導入，則預填 email 並自動觸發寄發重設信（安全：仍需 Email 接收者點擊信中連結以完成重設）
        if (backupToReset === '1' && backupEmailParam) {
            try {
                const decodedEmail = decodeURIComponent(backupEmailParam);
                $("#email").val(decodedEmail);
                // 先顯示提示並啟用按鈕，稍後觸發點擊（避免 race condition）
                const $btnSend = $("#btn_send_reset");
                const emailResult = Validator.validateEmail(decodedEmail);
                if (emailResult.valid) {
                    setFieldHint("email", `☑ 已填入：${decodedEmail}`, "success");
                    $btnSend.prop("disabled", false).removeClass("btn_Gray").addClass("btn_light");
                    // 延遲觸發確保事件處理器已經綁定
                    setTimeout(() => { $btnSend.trigger("click"); }, 250);
                } else {
                    setFieldHint("email", "Email 格式不正確，請確認", "error");
                }
            } catch { /* 忽略 */ }
            // 清除 QueryString 以免重複觸發
            if (window.history && window.history.replaceState) {
                const cleanUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        }
    })();

    // 自動處理區段：從備援信箱或參數導入時，自動填入 email 並寄送驗證信
    (function handleGoStep2FromBackup() {
        if (goStepParam !== '2' || !goStepEmail) return;
        try {
            const decodedEmail = decodeURIComponent(goStepEmail);
            // 預填並觸發寄送重設信（SendPasswordReset），之後會顯示提示，使用者仍需點郵件內連結取得 token
            $("#email").val(decodedEmail);
            // 若按鈕尚未綁定 handler，延遲觸發
            setTimeout(() => {
                const $btn = $("#btn_send_reset");
                if ($btn.length) {
                    // 先啟用按鈕外觀以便 click handler可運作
                    $btn.prop("disabled", false).removeClass("btn_Gray").addClass("btn_light");
                    $btn.trigger("click");
                }
            }, 250);
        } catch (e) {
            console.warn("處理 goStep=2 參數失敗", e);
        } finally {
            // 清除 query string 避免重複觸發
            if (window.history && window.history.replaceState) {
                const cleanUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        }
    })();
});