//function goToTrip(tripId) {
//    console.log("前往旅程:", tripId);
//    // 修改為 MVC 的路由路徑
//    window.location.href = '/Home/Detail';
//}
function goToTrip(tripId) {
    // 除錯用：印出來看看 ID 是多少
    console.log("準備跳轉，ID 為:", tripId);

    if (!tripId) {
        alert("錯誤：ID 是空的！");
        return;
    }

    window.location.href = '/Billing/Detail?id=' + tripId;
}

function createNewTrip() {
    // 跳轉到建立頁面
    window.location.href = '/Trip/Create';
}