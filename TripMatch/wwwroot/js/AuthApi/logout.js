$(function () {
    $("#btnLogout").on("click", function () {
        $.ajax({
            type: "post",
            url: window.Routes.AuthApi.Logout,
            xhrFields: { withCredentials: true },
            success: function (res) {
                let dest = (res && res.redirectUrl) ? res.redirectUrl : window.Routes.Home.Index;
                window.location.href = dest;
            },
            error: function (xhr) {
                console.error("登出失敗", xhr);
                alert("登出失敗，請稍後再試");
            }
        });
    });
});