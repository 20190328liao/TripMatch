let map;
let autocomplete;

// 統一在內容載入後執行
document.addEventListener("DOMContentLoaded", function () {

    // --- 第一部分：修正 Layout 容器寬度 (ASP.NET MVC 適用) ---
    const mainElement = document.querySelector("main");
    if (mainElement) {
        mainElement.style.padding = "0";
        mainElement.style.margin = "0";
        mainElement.style.maxWidth = "100%";

        const parentContainer = mainElement.closest(".container");
        if (parentContainer) {
            parentContainer.classList.remove("container");
            Object.assign(parentContainer.style, {
                maxWidth: "100%",
                padding: "0",
                margin: "0",
                width: "100%"
            });
        }
    }

    // --- 第二部分：初始化地圖 (Google Maps API) ---
    // 確保 initMap 在這之後執行，或直接在此調用
    if (typeof google !== 'undefined' && google.maps) {
        initMap();
    } else {
        console.error("Google Maps API 未正確載入，請檢查 API Key 與網路連線。");
    }
});

function initMap() {
    // 1. 初始化地圖
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 25.033976, lng: 121.564421 },
        zoom: 13,
        mapTypeControl: false,
    });

    // 2. 綁定搜尋輸入框
    const input = document.getElementById("place-search-input");
    if (!input) return; // 避免找不到元件報錯

    autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo("bounds", map);

    // 3. 監聽地點更換事件
    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            window.alert("找不到地點資訊：" + place.name);
            return;
        }

        // 移動地圖視角
        if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
        } else {
            map.setCenter(place.geometry.location);
            map.setZoom(17);
        }

        // 放置圖標
        new google.maps.Marker({
            map,
            title: place.name,
            position: place.geometry.location,
        });

        console.log("已選擇地點：", place.name);
    });
}