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

    // --- [核心功能] 管理寄送按鈕狀態與顏色 ---
    function updateSendButtonState() {
        const $btn = $("#btn_send_reset");
        const email = $("#email").val().trim();

        if (cooldownTime > 0) return;

        if (!email) {
            setFieldHint("email", "");
            $btn.prop("disabled", true).addClass("btn_Gray").removeClass("btn_light btn_Forgot");
            return;
        }

        const emailResult = Validator.validateEmail(email);
        setFieldHint("email", emailResult.message, emailResult.valid ? "success" : "error");

        if (emailResult.valid) {
            $btn.prop("disabled", false).removeClass("btn_Gray").addClass("btn_light");
        } else {
            $btn.prop("disabled", true).addClass("btn_Gray").removeClass("btn_light btn_Forgot");
        }
    }

    // --- 冷卻倒數功能 ---
    function startCooldown(seconds, $btn, hintSelector) {
        cooldownTime = seconds;
        $btn.prop("disabled", true).addClass("btn_Gray").removeClass("btn_light btn_Forgot");

        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(() => {
            cooldownTime--;
            if (cooldownTime <= 0) {
                clearInterval(cooldownTimer);
                cooldownTimer = null;
                $btn.text("重新寄驗證信");
                if (hintSelector) $(hintSelector).text("");
                updateSendButtonState();
            } else {
                $btn.text(`重送(${cooldownTime}s)`);
                if (hintSelector) $(hintSelector).text(`請稍候 ${cooldownTime} 秒後可重寄`);
            }
        }, 1000);
    }

    // --- 初始化指示器 ---
    function initializeStepIndicators() {
        $("#step1_indicator").removeClass().addClass("step_item step_incomplete");
        $("#step2_indicator").removeClass().addClass("step_item step_incomplete");
        $("#step3_indicator").removeClass().addClass("step_item step_incomplete");
        $("#step1_indicator .step_badge").html('<span class="step_number">1</span>');
        $("#step2_indicator .step_badge").html('<span class="step_number">2</span>');
        $("#step3_indicator .step_badge").html('<span class="step_number">3</span>');
    }
    initializeStepIndicators();

    // --- 處理失效連結導向 ---
    if (error) {
        const invalidStatuses = ["invalid_link", "invalid_code", "code_already_used", "expired"];
        if (invalidStatuses.includes(error)) {
            $.post(window.Routes.AuthApi.ClearPasswordResetSession).always(() => {
                window.location.href = "/Auth/CheckEmail?status=invalid&reason=" + error;
            });
            return;
        }
    }

    // --- 檢查後端 Session ---
    async function checkStoredPasswordResetLink() {
        try {
            const res = await fetch(window.Routes.AuthApi.CheckPasswordResetSession, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (data.hasValidLink) {
                verified = true; currentUserId = data.userId; currentCode = data.code;
                goToStep2();
            }
        } catch (err) { console.error("Session Check Error:", err); }
    }

    if (currentUserId && currentCode) {
        validateAndGoToStep2(currentUserId, currentCode, { storeSession: true });
    } else {
        checkStoredPasswordResetLink();
    }

    function validateAndGoToStep2(userId, code, opt = { storeSession: false }) {
        $.ajax({
            type: 'POST',
            url: window.Routes.AuthApi.ValidatePasswordResetLink,
            contentType: 'application/json',
            data: JSON.stringify({ userId, code }),
            success: function (res) {
                if (res.valid) {
                    verified = true; currentUserId = userId; currentCode = code;
                    if (opt.storeSession) {
                        $.ajax({ type: 'POST', url: window.Routes.AuthApi.SetPasswordResetSession, contentType: 'application/json', data: JSON.stringify({ userId, code }) });
                    }
                    goToStep2();
                } else {
                    window.location.href = "/Auth/CheckEmail?status=invalid";
                }
            },
            error: function () {
                window.location.href = "/Auth/CheckEmail?status=invalid";
            }
        });
    }

    $("#email").on("keyup input change", function () {
        updateSendButtonState();
    });

    $("#btn_send_reset").on("click", function () {
        const email = $("#email").val().trim();
        const $btn = $(this);
        if (!Validator.validateEmail(email).valid) return;

        $btn.prop("disabled", true).text("發送中...").addClass("btn_Gray").removeClass("btn_light");

        $.ajax({
            type: 'POST',
            url: window.Routes.AuthApi.SendPasswordReset,
            contentType: 'application/json',
            data: JSON.stringify(email),
            success: function () {
                $btn.text("已發送").addClass("btn_Forgot btn_Gray").removeClass("btn_light").prop("disabled", true);
                $("#email").prop("readonly", true);
                $("#custom_alert").removeClass("d-none");
                showPopup({ title: "已發送", message: "請至信箱點擊連結", type: "success" });
                startCooldown(30, $btn, "#resend_hint");
            },
            error: function (err) {
                updateSendButtonState();
                showPopup({ title: "錯誤", message: err.responseJSON?.message || "發送失敗", type: "error" });
            }
        });
    });

    $("#btn_next_step").on("click", function () {
        if (currentUserId && currentCode) { validateAndGoToStep2(currentUserId, currentCode); return; }
        $.get(window.Routes.AuthApi.CheckDbStatus).done(function (data) {
            if (data.verified) goToStep2();
            else showPopup({ title: "尚未驗證", message: "請先點擊信中連結", type: "error" });
        });
    });

    function goToStep2() {
        $("#step1_content").addClass("d-none");
        $("#step2_content").removeClass("d-none");
        $("#step1_indicator").removeClass("step_active").addClass("step_completed");
        $("#step2_indicator").removeClass("step_incomplete").addClass("step_active").find(".step_badge").html('<img src="/img/check2.svg" style="width:24px;">');
    }

    // --- ★ [重點補全] Step 2 密碼與確認密碼驗證邏輯 ---
    $("#new_password, #confirm_new_password").on("keyup input", function () {
        const pwd = $("#new_password").val();
        const confirm = $("#confirm_new_password").val();
        const $btnReset = $("#btn_reset_password");

        // 1. 驗證新密碼格式
        const pwdResult = Validator.validatePassword(pwd);
        if (!pwd) {
            setFieldHint("new_password", "");
        } else {
            setFieldHint("new_password", pwdResult.valid ? "☑ 格式正確" : "☐ 需包含：" + pwdResult.missingRules.join("、"), pwdResult.valid ? "success" : "error");
        }

        // 2. 驗證兩次密碼是否一致
        let confirmValid = false;
        if (!confirm) {
            setFieldHint("confirm_new_password", "");
        } else if (pwd === confirm) {
            setFieldHint("confirm_new_password", "☑ 密碼輸入一致", "success");
            confirmValid = true;
        } else {
            setFieldHint("confirm_new_password", "☐ 兩次密碼輸入不一致", "error");
        }

        // 3. 判斷最終提交按鈕狀態 (格式正確 且 一致)
        const isAllOk = pwdResult.valid && confirmValid;
        $btnReset.prop("disabled", !isAllOk)
            .toggleClass("btn_light", isAllOk)
            .toggleClass("btn_Gray", !isAllOk);
    });

    // --- 重設密碼執行 ---
    $("#btn_reset_password").on("click", function () {
        const payload = { password: $("#new_password").val(), userId: currentUserId, code: currentCode };
        const $btn = $(this);
        $btn.prop("disabled", true).text("處理中...");

        $.ajax({
            type: 'POST',
            url: window.Routes.AuthApi.PerformPasswordReset,
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function () {
                showPopup({
                    title: "重設成功",
                    message: "您的密碼已成功更新，請使用新密碼重新登入。",
                    type: "success",
                    autoClose: true,
                    seconds: 2
                });

                setTimeout(() => {
                    $.post(window.Routes.AuthApi.ClearPasswordResetSession).always(() => {
                        $("#step2_indicator").removeClass("step_active").addClass("step_completed");
                        $("#step3_indicator").removeClass("step_incomplete").addClass("step_active");
                        window.location.href = window.Routes.Auth.Login;
                    });
                }, 2000);
            },
            error: function (err) {
                $btn.prop("disabled", false).text("重設密碼");
                showPopup({ title: "錯誤", message: err.responseJSON?.message || "重設失敗", type: "error" });
            }
        });
    });

    // --- 初始化處理 ---
    (function handleInitialization() {
        if (goStepEmail) {
            $("#email").val(decodeURIComponent(goStepEmail));
        }
        updateSendButtonState();
        if (goStepEmail && (urlParams.get('backupToReset') === '1' || goStepParam === '2')) {
            setTimeout(() => {
                const $btn = $("#btn_send_reset");
                if (!$btn.prop("disabled")) $btn.trigger("click");
            }, 500);
        }
    })();
});