$(function () {
    $("#btnLogout").on("click", function () {
        $.ajax({
            type: "post",
            url: window.AppUrls.Auth.Logout,
            xhrFields: { withCredentials: true },
            success: function () {
                window.location.href = window.AppUrls.Auth.Login;
            },
            error: function (xhr) {
                console.error("登出失敗", xhr);
                alert("登出失敗，請稍後再試");
            }
        });
    });
});