// 模組內的變數，外部無法直接存取，保持全域乾淨
let map;
let autocomplete;
let currentSearchMarker = null;

// 匯出初始化函式
// 參數化：傳入 HTML ID，這樣以後 ID 變了不用改這裡的邏輯
export function initGoogleMap(mapElementId, searchInputId) {
    // 檢查 Google API 是否載入
    if (typeof google === 'undefined' || !google.maps) {
        console.error("Google Maps API 未正確載入，請檢查 API Key 與網路連線。");
        return;
    }

    const mapElement = document.getElementById(mapElementId);
    const inputElement = document.getElementById(searchInputId);

    if (!mapElement) {
        console.warn(`找不到地圖容器: #${mapElementId}`);
        return;
    }

    // 1. 初始化地圖
    map = new google.maps.Map(mapElement, {
        center: { lat: 25.033976, lng: 121.564421 }, // 預設台北101
        zoom: 13,
        mapTypeControl: false,
    });

    // 2. 如果有搜尋框才綁定 Autocomplete
    if (inputElement) {
        setupAutocomplete(inputElement);
    }
}

// 內部私有函式：設定自動完成 (不需匯出)
function setupAutocomplete(inputElement) {
    autocomplete = new google.maps.places.Autocomplete(inputElement);
    autocomplete.bindTo("bounds", map);

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            window.alert("找不到地點資訊：" + place.name);
            return;
        }

        // 2. 移除上一個標記
        if (currentSearchMarker) {
            currentSearchMarker.setMap(null);
        }

        // 移動地圖視角
        if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
        } else {
            map.setCenter(place.geometry.location);
            map.setZoom(17);
        }
        // 3. 建立新標記並存入變數
        currentSearchMarker = new google.maps.Marker({
            map: map, // 或是簡寫 map,
            title: place.name,
            position: place.geometry.location,
            // 建議搜尋標記可以用不同的顏色（例如藍色），與正式行程區分
            icon: {
                url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                scaledSize: new google.maps.Size(40, 40)
            }

        });


        console.log("已選擇地點：", place.name);
    });
}