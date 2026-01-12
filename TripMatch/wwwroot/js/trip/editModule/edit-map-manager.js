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

    const options = {
        // 限制搜尋類型
        types: ['establishment', 'geocode'],
        // 限制回傳欄位 (這對省錢非常重要！)
        fields: ['place_id', 'geometry', 'name', 'formatted_address', 'photos']
    };

    autocomplete = new google.maps.places.Autocomplete(inputElement, options);
    autocomplete.bindTo("bounds", map);

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            window.alert("找不到地點資訊：" + place.name);
            return;
        }

        // 強制改為只顯示名稱
        if (place.name) {
            setTimeout(() => {
                inputElement.value = place.name;
            }, 1);
        }


        // 移除上一個標記
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
            map: map,
            title: place.name,
            position: place.geometry.location,
            icon: {
                url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                scaledSize: new google.maps.Size(40, 40)
            }


        });

        // 景點彈窗
        let infoWindow = new google.maps.InfoWindow();
        const mapWidth = document.getElementById('map').offsetWidth; // 取得地圖目前像素寬度
        const targetWidth = mapWidth * 0.4; // 計算 50% 的寬度   
        const photoUrl = place.photos[0].getUrl({ maxWidth: 400 }); // 取得照片 URL
        let heartStyle = isPlaceInWishlist(place.place_id) ? 'bi-heart-fill active' : 'bi-heart';

        const contentString = `
        <div class="info-window-content" style="width: ${targetWidth}px;">
    
            <img src="${photoUrl}" class="rounded-top info-window-img">

            <div class="p-3">
                <h6 class="fw-bold mb-1">${place.name}</h6>
                <p class="text-muted small mb-3 info-window-address">
                    ${place.formatted_address || ''}
                </p>

                <div class="d-flex align-items-center gap-2"> 
            
                    <button id="add-to-itinerary-btn" class="btn btn-light flex-grow-1 py-2 shadow-sm border-0">
                        <i class="bi bi-plus-lg me-1"></i> 加入行程
                    </button>
            
                    <div id="add-to-wishlist-btn" class="wishlist-heart text-danger">
                        <i class="bi ${heartStyle}"></i> 
                    </div>
                    
                </div>
            </div>
        </div>
        `;


        // 設定內容並「立即開啟」
        // 這樣使用者按 Enter 或選完地點後，不需點標記也會彈出
        infoWindow.setContent(contentString);
        infoWindow.open(map, currentSearchMarker);

        // 依然保留標記的點擊事件 (預防使用者關閉後想再打開)
        currentSearchMarker.addListener("click", () => { infoWindow.open(map, currentSearchMarker) });


        // 當 infoWindow 開啟後，再去抓取按鈕並綁定事件
        google.maps.event.addListener(infoWindow, 'domready', () => {
            const btn = document.getElementById('add-to-itinerary-btn');
            if (btn) {
                btn.addEventListener('click', handleAddPlaceToItinerary);
            }
        });

        // 當 infoWindow 開啟後，再去抓取愛心並綁定事件
        google.maps.event.addListener(infoWindow, 'domready', () => {
            const btn = document.getElementById('add-to-wishlist-btn');
            if (btn) {
                btn.addEventListener('click', handleAddPlaceToWishlist);
            }
        });

    });


    function handleAddPlaceToItinerary() {
        // 這裡可以放加入行程的邏輯
        alert("已將景點加入行程！");
    }

    //將搜尋到的景點儲存到景點快照資料庫
    function savePlaceToDatabase(place) {
        // 這裡可以放儲存地點到資料庫的邏輯
        alert("已將景點加入資料庫！");
    }

    function isPlaceInWishlist(placeId) {




        // 這裡可以放檢查地點是否在願望清單的邏輯
        return false; // 假設預設不在願望清單
    }

    function handleAddPlaceToWishlist() {
        
        const icon = this.querySelector('i'); // 找到愛心圖示
        this.classList.toggle('active');

        // 3. 判斷現在是「加入」還是「移除」
        const isActive = this.classList.contains('active');

        if (isActive) {
            icon.classList.remove('bi-heart');
            icon.classList.add('bi-heart-fill');
        } else {
            icon.classList.remove('bi-heart-fill');
            icon.classList.add('bi-heart');          
        }
    }
}