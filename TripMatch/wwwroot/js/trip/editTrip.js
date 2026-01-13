// 1. 匯入edit module各項功能
import { expandContainerToFullWidth } from './editModule/edit-layout-helper.js';
import { initGoogleMap } from './editModule/edit-map-manager.js';
import { initEditPage } from './editModule/edit-trip-manager.js';

const tripId = document.getElementById('current-trip-id').value; // 取得行程編號

// 2. 統一在內容載入後執行
document.addEventListener("DOMContentLoaded", async function () {

    // 步驟 A: 調整版面
    expandContainerToFullWidth();

    try {
        // 使用 await 等待 jQuery 的 $.get 完成
        // 注意：這裡不需要寫 .then() 或 function(data)，直接賦值給變數即可
        const tripData = await $.get(`/api/TripApi/simple/${tripId}`);

        // 取得日期陣列
        const dates = tripData.dateStrings || [];

        // 初始化地圖與編輯功能
        initGoogleMap('map', 'place-search-input', dates);
        initEditPage('map');

    } catch (error) {
        console.error("AJAX 載入行程詳情失敗:", error);
        // 墊底處理：即使 API 失敗也讓地圖出來
        initGoogleMap('map', 'place-search-input', []);
        initEditPage('map');
    }

});