// 1. 匯入edit module各項功能
import { expandContainerToFullWidth } from './editModule/edit-layout-helper.js';
import { initGoogleMap } from './editModule/edit-map-manager.js';
import { initEditPage, refreshItineraryList } from './editModule/edit-trip-manager.js';

// 將 refreshItineraryList 掛載到 window 物件，讓 initGoogleMap 裡面的 AJAX 成功後可以呼叫
window.refreshItineraryList = refreshItineraryList;

const tripId = document.getElementById('current-trip-id').value; // 取得行程編號

// 2. 統一在內容載入後執行
document.addEventListener("DOMContentLoaded", async function () {

    // 步驟 A: 調整版面
    expandContainerToFullWidth();

    // 定義變數來接收地圖實體
    let mapInstance = null;

    try {
        const tripSimpleInfo = await $.get(`/api/TripApi/simple/${tripId}`);
        
        // 接收 initGoogleMap 回傳的 map 物件
        mapInstance = initGoogleMap('map', 'place-search-input', tripSimpleInfo);

        // 將 map 物件傳入編輯頁面，讓列表點擊可以控制地圖       
        initEditPage(mapInstance, tripSimpleInfo);

    } catch (error) {
        console.error("AJAX 載入行程詳情失敗:", error);

        // 墊底處理：即使 API 失敗也讓地圖出來
        mapInstance = initGoogleMap('map', 'place-search-input', []);

        // 錯誤時也要傳入 map
        initEditPage(mapInstance, tripSimpleInfo);
    }
});