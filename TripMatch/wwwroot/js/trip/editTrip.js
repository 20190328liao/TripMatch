// 1. 匯入edit module各項功能
import { expandContainerToFullWidth } from './editModule/edit-layout-helper.js';
import { initGoogleMap } from './editModule/edit-map-manager.js';
import { initEditPage } from './editModule/edit-trip-manager.js';

// 2. 統一在內容載入後執行
document.addEventListener("DOMContentLoaded", function () {

    // 步驟 A: 調整版面
    expandContainerToFullWidth();

    // 步驟 B: 初始化地圖 (傳入你的 HTML ID)
    // 假設你的 View 裡的 ID 分別是 "map" 和 "place-search-input"
    initGoogleMap('map', 'place-search-input');

    initEditPage('map'); // 初始化編輯頁面功能

});