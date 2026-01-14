$(function () {
    // 使用事件委派並先解除相同委派，避免因重複載入或順序問題造成 handler 無法觸發
    $(document).off('click', '#btnLogout').on('click', '#btnLogout', function (e) {
        e.preventDefault();
        console.log("btnLogout 被點擊");
        $.ajax({
            type: "POST",
            url: window.Routes.AuthApi.Logout,
            xhrFields: { withCredentials: true },
            success: function (res) {
                console.log("登出成功，伺服器回應：", res);

                // 清除前端 avatar 快取，確保下一次登入或頁面載入會從 server 重新抓取
                try {
                    localStorage.removeItem('tm_avatar');
                } catch (ex) {
                    console.warn('清除 avatar 快取失敗', ex);
                }

                let dest = (res && res.redirectUrl) ? res.redirectUrl : (window.Routes?.Home?.Index || '/');
                window.location.href = dest;
            },
            error: function (xhr) {
                console.error("登出失敗", xhr);
                alert("登出失敗，請稍後再試");
            }
        });
    });
});