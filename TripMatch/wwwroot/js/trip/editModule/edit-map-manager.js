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
        // 擴充回傳欄位，確保包含後端所需的所有資料
        fields: [
            'place_id',
            'geometry',
            'name',
            'types',
            'formatted_address',
            'photos',
            'rating',               // 加入評分
            'user_ratings_total'    // 加入評分總人數
        ]
    };

    autocomplete = new google.maps.places.Autocomplete(inputElement, options);
    autocomplete.bindTo("bounds", map);

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        console.log("選擇的地點資料：", place); // 除錯用

        if (!place.geometry || !place.geometry.location) {
            window.alert("找不到地點資訊：" + place.name);
            return;
        }

        //將資料儲存到景點快照
        savePlaceToDatabase(place);

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

        let significantType = '';
        if (place.types != null)
            significantType = place.types.find(t => t !== 'establishment' && t !== 'point_of_interest') || place.types[0];

        
        let dto = {
            externalPlaceId: place.place_id,
            nameZh: place.name,
            nameEn: place.name,
            locationCategory: significantType,      
            address: place.formatted_address,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            rating: place.rating || 0,
            userRatingsTotal: place.user_ratings_total || 0,
            photosSnapshot: place.photos ? place.photos.map(p => p.getUrl({ maxWidth: 400 })) : []
        }

        $.ajax({
            url: '/api/TripApi/AddSnapshot',
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify(dto),
            success: function () {
                console.log("景點快照增加成功");
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "景點快照增加失敗";
                console.log(msg);
            }
        })



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