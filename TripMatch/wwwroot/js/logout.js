$(function () {
$(#btnLogout).on("click", function () {
    $.ajax({
        type: "post",
        url: "/api/auth/logout",
        xhrFields: { withCredentials: true },
        success: function () {
            window.location.href = loginUrl;
        }
    });
});
});