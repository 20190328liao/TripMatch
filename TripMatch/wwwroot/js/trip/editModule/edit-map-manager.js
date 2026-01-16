
// 模組內的變數，外部無法直接存取，保持全域乾淨
let map;
let autocomplete;
let placesService;
let currentSearchMarker = null;
let tripDates = [];
let inputElement = null;


// 匯出初始化函式
// 參數化：傳入 HTML ID，這樣以後 ID 變了不用改這裡的邏輯
export function initGoogleMap(mapElementId, searchInputId, tripSimpleInfo) {

    // 檢查 Google API 是否載入
    if (typeof google === 'undefined' || !google.maps) {
        console.error("Google Maps API 未正確載入，請檢查 API Key 與網路連線。");
        return;
    }

    const mapElement = document.getElementById(mapElementId);
    inputElement = document.getElementById(searchInputId);
    tripDates = tripSimpleInfo.dateStrings || [];    

    if (!mapElement) {
        console.warn(`找不到地圖容器: #${mapElementId}`);
        return;
    }
    
    // 使用邏輯或運算子，同時處理 null, undefined, 0
    // 只要 latitude 是「虛值」(Falsy)，就採用後面的預設值
    let latitude = tripSimpleInfo.lat || 25.033976;
    let longitude = tripSimpleInfo.lng || 121.564421;

    // 檢查是否真的拿到了有效數字（防止字串或其他異常）
    if (isNaN(latitude) || isNaN(longitude)) {
        latitude = 25.033976;
        longitude = 121.564421;
    }

    map = new google.maps.Map(mapElement, {
        center: { lat: Number(latitude), lng: Number(longitude) }, // 強制轉為 Number 確保 API 讀取正確
        zoom: 13,
        mapTypeControl: false,
    });

    placesService = new google.maps.places.PlacesService(map);

    // 2. 如果有搜尋框才綁定 Autocomplete
    if (inputElement) {
        setupAutocomplete();
    }

    // 回傳地圖實體，方便外部使用
    return map;
}

// 【新增】匯出給外部使用的函式：透過 Google Place ID 顯示地點
export function showPlaceByGoogleId(googlePlaceId, spotId) {
    if (!googlePlaceId) return;

    const request = {
        placeId: googlePlaceId,
        // 指定需要的欄位，節省成本並確保資料一致
        fields: ['place_id', 'geometry', 'name', 'types', 'formatted_address', 'photos', 'rating', 'user_ratings_total']
    };

    placesService.getDetails(request, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            // 呼叫共用的渲染函式，並傳入已知的 spotId (資料庫 ID)
            renderPlaceOnMap(place, spotId);
        } else {
            console.error("Google Place Details 查詢失敗:", status);
        }
    });
}

// 內部私有函式：設定自動完成 (不需匯出)
function setupAutocomplete() {

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

        renderPlaceOnMap(place, null);
    }); 
}

// existingSpotId: 如果是從左側列表點擊，會傳入已知的 DB ID；如果是搜尋，則為 null
function renderPlaceOnMap(place, existingSpotId) {

    // 1. 決定 Spot ID 的來源 (Promise)
    // 如果是從列表點來的，我們已經有 ID 了，直接回傳；否則就要去 Call API 存檔
    let savePlacePromise;
    if (existingSpotId) {
        console.log("使用現有 SpotId:", existingSpotId);
        savePlacePromise = Promise.resolve(existingSpotId);
    } else {
        savePlacePromise = savePlaceToDatabase(place);
    }

    // 強制改為只顯示名稱
    if (place.name) {
        setTimeout(() => {
            inputElement.value = place.name;
        }, 1);
    }

    // 2. 清除舊標記 & 設定地圖視野 (邏輯保持不變)
    if (currentSearchMarker) currentSearchMarker.setMap(null);

    if (place.geometry.viewport) {
        map.fitBounds(place.geometry.viewport);
    } else {
        map.setCenter(place.geometry.location);
        map.setZoom(17);
    }

    currentSearchMarker = new google.maps.Marker({
        map: map,
        title: place.name,
        position: place.geometry.location,
        icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            scaledSize: new google.maps.Size(40, 40)
        }
    });

    // 3. InfoWindow 邏輯 (原本的程式碼搬過來)
    let infoWindow = new google.maps.InfoWindow();
    const mapWidth = document.getElementById('map').offsetWidth;
    const targetWidth = mapWidth * 0.4;

    const imageHtml = (place.photos && place.photos.length > 0)
        ? `<img src="${place.photos[0].getUrl({ maxWidth: 400 })}" class="rounded-top info-window-img" style="width:100%; height:150px; object-fit:cover;">`
        : '';

    const dayMenuItems = getDayMenuItems(); // 記得把 getDayMenuItems 搬到這裡能存取的地方，或是放在下面

    const contentString = `
        <div class="info-window-content" style="width: ${targetWidth}px;">
            ${imageHtml}
            <div class="p-3">           
                <div class="d-flex justify-content-between align-items-start mb-3">               
                    <div style="max-width: 85%;">
                        <h6 class="fw-bold mb-1 text-truncate" title="${place.name}">${place.name}</h6>
                        <p class="text-muted small mb-0 info-window-address">${place.formatted_address || ''}</p>
                    </div>
                    <div id="add-to-wishlist-btn" class="wishlist-heart text-danger ms-2" style="cursor:pointer; font-size: 1.2rem;">
                        <i class="bi bi-heart"></i> 
                    </div>
                </div>
                <div class="dropdown">
                    <button class="btn btn-primary btn-sm w-100 dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bi bi-plus-lg me-1"></i>加入行程
                    </button>
                    <ul class="dropdown-menu w-100" style="max-height: 200px; overflow-y: auto;">
                        ${dayMenuItems}
                    </ul>
                </div>
            </div>
        </div>
    `;

    infoWindow.setContent(contentString);
    infoWindow.open(map, currentSearchMarker);
    currentSearchMarker.addListener("click", () => { infoWindow.open(map, currentSearchMarker) });

    // 4. domready 事件綁定 (邏輯保持不變，因為我們用了 savePlacePromise 抽象化 ID 來源)
    google.maps.event.addListener(infoWindow, 'domready', async () => {
        const tripItems = document.querySelectorAll('.add-trip-item');
        const wishlistBtn = document.getElementById('add-to-wishlist-btn');
        let spotId = null;

        try {
            spotId = await savePlacePromise; // 這裡會自動處理：搜尋模式->存檔拿ID; 列表模式->直接拿ID

            if (spotId && wishlistBtn) {
                const isLiked = await checkIsWishlist(spotId);
                if (isLiked) {
                    const icon = wishlistBtn.querySelector('i');
                    wishlistBtn.classList.add('active');
                    icon.classList.remove('bi-heart');
                    icon.classList.add('bi-heart-fill');
                }
            }
        } catch (err) { console.error(err); }

        // 綁定加入行程按鈕
        tripItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                e.preventDefault();
                const day = e.currentTarget.getAttribute('data-day');
                try {
                    const spotId = await savePlacePromise;
                    if (spotId) handleAddPlaceToItinerary(spotId, place, day);
                } catch (err) { console.error(err); }
            });
        });

        // 綁定願望清單按鈕
        wishlistBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            const btnElement = e.currentTarget;
            try {
                const spotId = await savePlacePromise;
                if (spotId) handleAddPlaceToWishlist(btnElement, spotId);
            } catch (err) { console.error(err); }
        });
    });
}

function getDayMenuItems() {
    // 若無日期資料的預設處理
    if (!tripDates || tripDates.length === 0) {
        return '<li><a class="dropdown-item add-trip-item" href="#" data-day="1">第一天</a></li>';
    }

    return tripDates.map((date, index) => {
        // class="add-trip-item" 用於後續綁定點擊事件
        // data-day="${index + 1}" 用於儲存該選項代表第幾天
        return `<li><a class="dropdown-item add-trip-item" href="#" data-day="${index + 1}">第 ${index + 1} 天 (${date})</a></li>`;
    }).join('');
}

function handleAddPlaceToItinerary(spotId, place, day) {
    // 1. 取得當前的行程 ID (這通常放在頁面的隱藏欄位中)
    const tripId = $('#current-trip-id').val();

    // 2. 組裝對應後端 ItineraryItemDto 的物件
    const dto = {
        TripId: parseInt(tripId),    // 所屬行程 ID
        SpotId: parseInt(spotId),    // 景點 ID (來自快照表)
        DayNumber: parseInt(day),    // 使用者選擇的天數
        StartTime: "08:00:00",          // 預設開始時間 (對應 TimeOnly)
        EndTime: "09:00:00",            // 預設結束時間
        SortOrder: 0                 // 排序 (後端 Service 會再重新計算)
    };

    console.log("加入行程的 DTO:", dto);

    // 3. 發送 AJAX 請求
    $.ajax({
        url: '/api/TripApi/AddSpotToTrip',
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify(dto),
        success: function (response) {
            // 成功提示
            alert(`景點已加入到第${day}天行程`);

            // 呼叫全域函數重新整理列表
            if (typeof window.refreshItineraryList === "function") {
                window.refreshItineraryList();
            }
        },
        error: function (xhr) {
            console.error("加入失敗:", xhr);
            const errorMsg = xhr.responseJSON ? xhr.responseJSON.message : "伺服器錯誤";
            alert(`加入失敗：${errorMsg}`);
        }
    });
}

//將搜尋到的景點儲存到景點快照資料庫
// 儲存景點快照 (回傳 Promise)
export function savePlaceToDatabase(place) {
    return new Promise((resolve, reject) => {

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
        };

        $.ajax({
            url: '/api/TripApi/AddSnapshot',
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify(dto),
            success: function (res) {
                console.log("景點快照 Id:" + res.id);
                resolve(res.id);
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "景點快照增加失敗";
                console.log(msg);
                resolve(null); // 失敗回傳 null，避免卡死
            }
        });
    });
}

function handleAddPlaceToWishlist(btnElement, spotId) {

    console.log("願望清單 spotID:" + spotId)

    const icon = btnElement.querySelector('i'); // 找到愛心圖示
    btnElement.classList.toggle('active');

    // 3. 判斷現在是「加入」還是「移除」
    const isActive = btnElement.classList.contains('active');

    if (isActive) {
        icon.classList.remove('bi-heart');
        icon.classList.add('bi-heart-fill');
    } else {
        icon.classList.remove('bi-heart-fill');
        icon.classList.add('bi-heart');
    }

    let dto = {
        spotId: spotId,
        addToWishlist: isActive
    };

    // 更新願望清單
    $.ajax({
        url: '/api/TripApi/UpdateWishList',
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify(dto),
        success: function (res) {
            console.log("願望清單更新成功，spotId:", res.id);
        },
        error: function (xhr) {
            const msg = xhr.responseJSON ? xhr.responseJSON.message : "願望清單更新失敗";
            console.log(msg);
        }
    });
}

function checkIsWishlist(spotId) {
    // 1. 必須回傳一個 Promise 物件
    return new Promise((resolve, reject) => {

        $.ajax({
            url: '/api/TripApi/CheckIsWishlist',
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify(spotId),
            success: function (res) {
                // 2. 成功時，使用 resolve 把值傳出去 (不要用 return)
                // 假設後端回傳的是 boolean，直接丟出去
                console.log("API 回傳完整資料:", res);
                resolve(res.addToWishlist);
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "取得願望清單失敗";
                console.error(msg);

                // 3. 失敗時，建議 resolve(false) 讓流程繼續，當作沒收藏
                resolve(false);
            }
        });
    });
}