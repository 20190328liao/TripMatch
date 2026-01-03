$(function () {
$(#btnLogout).on("click", function () {
    $.ajax({
        type: "post",
        url: window.AppUrls.Auth.Logout,
        xhrFields: { withCredentials: true },
        success: function () {
            window.location.href = window.AppUrls.Auth.Login;
        }
    });
});
});