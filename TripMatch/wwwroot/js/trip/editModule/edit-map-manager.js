
// 模組內的變數，外部無法直接存取，保持全域乾淨
let map;
let autocomplete;
let currentSearchMarker = null;
let tripDates = []

// 匯出初始化函式
// 參數化：傳入 HTML ID，這樣以後 ID 變了不用改這裡的邏輯
export function initGoogleMap(mapElementId, searchInputId, dates = []) {

    // 檢查 Google API 是否載入
    if (typeof google === 'undefined' || !google.maps) {
        console.error("Google Maps API 未正確載入，請檢查 API Key 與網路連線。");
        return;
    }

    const mapElement = document.getElementById(mapElementId);
    const inputElement = document.getElementById(searchInputId);
    tripDates = dates; // 儲存行程日期陣列

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

    // 回傳地圖實體，方便外部使用
    return map;
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

        // 1. 發送請求，但不等待它完成才顯示視窗 (為了使用者體驗，視窗要馬上出來)
        // 我們把這個 Promise 存起來
        const savePlacePromise = savePlaceToDatabase(place);

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
        //const photoUrl = place.photos[0].getUrl({ maxWidth: 400 }); // 取得照片 URL
        //let heartStyle = isPlaceInWishlist(place.place_id) ? 'bi-heart-fill active' : 'bi-heart';



        //照片內容
        // 1. 判斷是否有照片，如果有，就產生 img 標籤的 HTML；如果沒有，就給空字串
        const imageHtml = (place.photos && place.photos.length > 0)
            ? `<img src="${place.photos[0].getUrl({ maxWidth: 400 })}" class="rounded-top info-window-img" style="width:100%; height:150px; object-fit:cover;">`
            : '';


        // 取得下拉選單的 HTML 內容
        const dayMenuItems = getDayMenuItems();

        const contentString = `
        <div class="info-window-content" style="width: ${targetWidth}px;">
            ${imageHtml}

            <div class="p-3">           
                <div class="d-flex justify-content-between align-items-start mb-3">               
                    <div style="max-width: 85%;">
                        <h6 class="fw-bold mb-1 text-truncate" title="${place.name}">${place.name}</h6>
                        <p class="text-muted small mb-0 info-window-address">
                            ${place.formatted_address || ''}
                        </p>
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


        // 設定內容並「立即開啟」
        // 這樣使用者按 Enter 或選完地點後，不需點標記也會彈出
        infoWindow.setContent(contentString);
        infoWindow.open(map, currentSearchMarker);

        // 依然保留標記的點擊事件 (預防使用者關閉後想再打開)
        currentSearchMarker.addListener("click", () => { infoWindow.open(map, currentSearchMarker) });


        // ---------------------------------------------------------
        // 【核心邏輯 2】：在 domready 中綁定事件，並處理非同步 ID
        // ---------------------------------------------------------
        google.maps.event.addListener(infoWindow, 'domready', async () => {
            const tripItems = document.querySelectorAll('.add-trip-item');
            const wishlistBtn = document.getElementById('add-to-wishlist-btn');

            // ==========================================
            // 第一步：初始化狀態 (自動執行，不需要使用者點)
            // ==========================================
            let spotId = null;

            try {
                // 1. 等待取得 Spot ID
                console.log("初始化：等待景點 ID...");
                spotId = await savePlacePromise;

                // 2. 拿到 ID 後，立刻檢查是否已收藏
                if (spotId && wishlistBtn) {
                    // 在 async function 內
                    const isLiked = await checkIsWishlist(spotId);

                    console.log(`初始化：景點 ID ${spotId} 的收藏狀態為 ${isLiked}`);

                    // 如果已收藏，馬上把愛心塗黑
                    if (isLiked) {
                        const icon = wishlistBtn.querySelector('i');
                        wishlistBtn.classList.add('active'); // 標記為 active
                        icon.classList.remove('bi-heart');
                        icon.classList.add('bi-heart-fill');
                    }
                }
            } catch (err) {
                console.error("初始化愛心狀態失敗", err);
            }


            // A. 綁定下拉選單

            tripItems.forEach(item => {
                // 注意：這裡 callback 加上 async，才能使用 await
                item.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const day = e.currentTarget.getAttribute('data-day');

                    try {
                        // 在這裡等待 ID (如果 API 還沒跑完，會停在這裡等；如果跑完了，會馬上拿到)
                        console.log("正在確認景點 ID...");
                        const spotId = await savePlacePromise;

                        if (spotId) {
                            // 成功拿到 ID，執行加入行程
                            handleAddPlaceToItinerary(spotId, place, day);
                        } else {
                            alert("無法取得景點 ID，請稍後再試或檢查網路。");
                        }
                    } catch (err) {
                        console.error("取得 ID 過程發生錯誤", err);
                    }
                });
            });

            // =================================================
            // B. 綁定愛心按鈕 (加入願望清單)
            // =================================================


            wishlistBtn.addEventListener('click', async function (e) {


                e.preventDefault();

                // 1. 先保存按鈕元素的參照 (因為是在這個 function 觸發的，this 就是按鈕)
                // 或者更保險的做法是用 e.currentTarget
                const btnElement = e.currentTarget;

                try {
                    // 優化體驗：可以在這裡先切換愛心樣式 (讓使用者覺得很快)，再去後端處理
                    // 但為了確保資料正確，這裡示範「先拿ID再處理」

                    console.log("正在確認景點 ID (愛心)...");
                    // 2. 等待 ID (Promise 會直接給出結果，不會重複發請求)
                    const spotId = await savePlacePromise;


                    if (spotId) {

                        handleAddPlaceToWishlist(btnElement, spotId);
                    } else {
                        console.warn("無 ID，無法加入願望清單");
                    }
                } catch (err) {
                    console.error("愛心按鈕錯誤", err);
                }
            });

        });
    });

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
    function savePlaceToDatabase(place) {
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
}