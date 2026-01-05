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
   



}


