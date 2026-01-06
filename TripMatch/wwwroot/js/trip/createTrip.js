//確保 DOM 元素都載入後再執行 JavaScript
document.addEventListener('DOMContentLoaded', () => {

    //1. 選取元件
    const btnSave = document.querySelector("#btnSave");

    //檢查是否存在，並綁定事件
    if (btnSave) {
        btnSave.addEventListener('click', SaveDataToFile);
    }
});

function SaveDataToFile() {
   
    // 1. 打包資料
    const tripData = {
        title: document.querySelector('#title').value,
        regions: [7,8],
        startDate: document.querySelector('#startDate').value,
        endDate: document.querySelector('#endDate').value
    };

    // 2. 透過 POST 傳送到 Create API
    $.ajax({
        url: '/api/TripApi/Create',
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify(tripData),
        success: function (res) {
            alert('行程建立成功，前往編輯頁面');
            window.location.href = `/Trip/Edit/${res.id}`;
        },
        error: function (xhr) {
            const msg = xhr.responseJSON ? xhr.responseJSON.message : "建立失敗";
            alert(msg);
        }
    });

    
}


