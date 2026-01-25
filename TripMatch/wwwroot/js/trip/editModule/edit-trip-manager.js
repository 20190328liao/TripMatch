import { TripApi } from './api/trip-api.js';
import { ItineraryNavigator } from './components/itinerary-navigator.js';
import { AddFlightModal } from './components/add-flight-modal.js';
import { FlightRenderer } from './components/flight-renderer.js';
import { RestaurantRenderer } from './components/restaurant-renderer.js';
import { savePlaceToDatabase, showPlaceByGoogleId } from './edit-map-manager.js';
import { RecommendationModal } from './components/recommendation-modal.js';


const currentTripId = document.getElementById('current-trip-id').value;
let DateStrings = [];
let itineraryNavigator;
let recModal;
let addFlightModal;
let flightRenderer;
let restaurantRenderer;
let connection = null;







export function initEditPage(mapInstance, tripSimpleInfo) {
    //將 map 實體暫存到 window 或模組變數，供點擊列表時使用
    window.currentMapInstance = mapInstance;
    DateStrings = tripSimpleInfo.dateStrings || [];   


    recModal = new RecommendationModal(DateStrings); 

    itineraryNavigator = new ItineraryNavigator(
        'itinerary-nav-container',
        'place-list',
        handleAddDay
    );


  

    // [新增] 監聽導覽列發出的事件
    const navContainer = document.getElementById('itinerary-nav-container');

    navContainer.addEventListener('explore-click', () => {
        recModal.open(tripSimpleInfo.tripRegions[0], 'explore');
    });

    navContainer.addEventListener('favorites-click', () => {
        // 假設有全域變數 currentUserId，或從 hidden input 抓
        // const userId = document.getElementById('current-user-id').value;
        recModal.open(tripSimpleInfo.tripRegions[0], 'favorites');
    });

    document.body.addEventListener('add-spot-to-trip', (e) => {
        const { placeId, spotId, dayNum } = e.detail;
        console.log(`準備加入行程: PlaceID=${placeId}, Day=${dayNum}`);

        handleAddSpotFromModal(placeId, dayNum);
    });
    addFlightModal = new AddFlightModal();
    flightRenderer = new FlightRenderer('flight-wrapper'); 
    restaurantRenderer = new RestaurantRenderer('restaurant-wrapper');
    initTimeEditModal();
    initHotelEditModal();
    loadTripData();
    setupSignalR(currentTripId);
}

export function refreshItineraryList() {
    loadTripData();
}

export function GetDateStrings() {
    return DateStrings;
}

async function setupSignalR(tripId) {
    connection = new signalR.HubConnectionBuilder()
        .withUrl("/tripHub")
        .withAutomaticReconnect()
        .build();

    // 監聽廣播
    connection.on("ReceiveItineraryUpdate", (data) => {
        showSimpleToast(data.message); // 1. 提示
        flashElement(data.targetId);   // 2. 閃爍

        // 3. 延遲刷新 (解決 Edge 渲染競爭問題)
        setTimeout(() => refreshItineraryList(), 500);
    });

    try {
        await connection.start();
        // 連線後立即加入群組
        await connection.invoke("JoinTripGroup", tripId.toString());

        // 【補強】針對 Edge 重連機制：重新連線後要補回群組身分
        connection.onreconnected(() => {
            connection.invoke("JoinTripGroup", tripId.toString());
        });
    } catch (err) {
        console.error("SignalR 啟動失敗:", err);
    }
}

// 簡單的提示小工具
function showSimpleToast(msg) {
    const toastId = 'toast-' + Date.now();
    const html = `
        <div id="${toastId}" class="toast show align-items-center text-white bg-dark border-0 position-fixed bottom-0 end-0 m-3" style="z-index: 9999;">
            <div class="d-flex">
                <div class="toast-body">${msg}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>`;
    $('body').append(html);
    setTimeout(() => $(`#${toastId}`).fadeOut(() => $(`#${toastId}`).remove()), 3000);
}

function flashElement(id) {
    if (id) {
        const $item = $(`.itinerary-item[data-id="${id}"]`);
        if ($item.length > 0) {
            $item.css({
                'transition': 'background-color 0.5s',
                'background-color': '#fff3cd'
            });
            // 2秒後移除黃色背景
            setTimeout(() => $item.css('background-color', ''), 2000);
        }
    }
}

function handleAddSpotFromModal(googlePlaceId, dayNum) {

    // 1. 這裡需要一個方法：依據 PlaceID 取得 Place Details 並存入 DB
    // 我們可以重複利用 savePlaceToDatabase，但它需要 Place Result 物件
    // 所以我們需要先用 Places Service 查一次詳情 (因為列表 API 給的資料可能不夠詳細存 DB)

    if (!window.currentMapInstance) return;

    const service = new google.maps.places.PlacesService(window.currentMapInstance);
    service.getDetails({ placeId: googlePlaceId }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {

            // 2. 存入 DB 取得 SpotId
            savePlaceToDatabase(place).then(spotId => {
                if (!spotId) {
                    alert("儲存景點失敗");
                    return;
                }

                // 3. 呼叫加入行程 API
                const dto = {
                    TripId: parseInt(document.getElementById('current-trip-id').value),
                    SpotId: parseInt(spotId),
                    DayNumber: parseInt(dayNum),
                    StartTime: "08:00:00", // 預設時間
                    EndTime: "09:00:00",
                    SortOrder: 99
                };

                $.ajax({
                    url: '/api/TripApi/AddSpotToTrip',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify(dto),
                    success: function () {
                        // 成功！
                        // 1. 顯示成功提示 (Toast)
                        // 2. 重新整理列表
                        loadTripData();
                        alert(`已成功加入 Day ${dayNum}！`);
                    },
                    error: function () {
                        alert("加入行程失敗");
                    }
                });
            });

        } else {
            alert("無法取得景點詳情，加入失敗");
        }
    });
}


// [新增] 處理新增天數
function handleAddDay() {
    if (!confirm("確定要增加一天行程嗎？")) return;

    // 假設後端 API 路徑
    $.ajax({
        url: `/api/TripApi/AddTripDay/${currentTripId}`, // 請確認後端 API
        type: 'POST',
        success: function (newDate) {   
            loadTripData();    
        },
        error: function (err) {
            alert("新增天數失敗");
        }
    });
}





// 【新增函式】插入彈窗 HTML 到頁面底部
function initTimeEditModal() {
    const modalHtml = `
    <div class="modal fade" id="timeEditModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-sm modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header py-2">
                    <h6 class="modal-title fw-bold">編輯時間</h6>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="edit-item-id">
                    <input type="hidden" id="edit-item-rowVersion">
                    <div class="mb-3">
                        <label class="form-label small text-muted">開始時間</label>
                        <input type="time" id="edit-start-time" class="form-control">
                    </div>
                    <div class="mb-0">
                        <label class="form-label small text-muted">結束時間</label>
                        <input type="time" id="edit-end-time" class="form-control">
                    </div>
                </div>                

                <div class="modal-footer py-2 d-flex flex-nowrap w-100 gap-2">
                    <button type="button" class="btn btn-sm btn_gray flex-grow-1" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-sm btn_light flex-grow-1" id="save-time-btn">儲存</button>
                </div>

            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 綁定儲存按鈕事件
    document.getElementById('save-time-btn').addEventListener('click', saveEditedTime);
}

// 【新增】初始化住宿彈窗
function initHotelEditModal() {
    const modalHtml = `
    <div class="modal fade" id="hotelEditModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header py-2 bg-light">
                    <h6 class="modal-title fw-bold"><i class="bi bi-house-door-fill me-2"></i>安排住宿</h6>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <!-- 搜尋飯店 -->
                    <div class="mb-3">
                        <label class="form-label small text-muted fw-bold">搜尋飯店</label>
                        <div class="input-group">
                            <span class="input-group-text"><i class="bi bi-search"></i></span>
                            <input type="text" id="hotel-search-input" class="form-control" placeholder="請輸入飯店名稱..." autocomplete="off">
                        </div>
                        <div id="hotel-selected-info" class="text-success small mt-1 d-none">
                            <i class="bi bi-check-circle-fill"></i> 已選擇: <span id="hotel-name-display"></span>
                        </div>
                    </div>

                    <!-- 日期設定 -->
                    <div class="row g-2 mb-3">
                        <div class="col-6">
                            <label class="form-label small text-muted">入住日期 (Check-in)</label>
                            <input type="date" id="hotel-checkin" class="form-control">
                        </div>
                        <div class="col-6">
                            <label class="form-label small text-muted">退房日期 (Check-out)</label>
                            <input type="date" id="hotel-checkout" class="form-control">
                        </div>
                    </div>

     
                </div>                

                <div class="modal-footer py-2 d-flex flex-nowrap w-100 gap-2">
                    <button type="button" class="btn btn-sm btn-secondary flex-grow-1" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-sm btn-primary flex-grow-1" id="save-hotel-btn">加入行程</button>
                </div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 綁定事件
    const searchInput = document.getElementById('hotel-search-input');
    const saveBtn = document.getElementById('save-hotel-btn');

    // 初始化 Autocomplete
    initHotelAutocomplete(searchInput);

    // 綁定儲存按鈕
    saveBtn.addEventListener('click', saveHotelData);
}

// 【新增】住宿專用的 Google Autocomplete
let selectedHotelPlace = null; // 暫存選到的地點

function initHotelAutocomplete(inputElement) {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) return;

    const options = {
        types: ['establishment'], // 優先搜尋住宿
        fields: ['place_id', 'geometry', 'name', 'formatted_address', 'photos', 'rating', 'user_ratings_total', 'types']
    };

    const autocomplete = new google.maps.places.Autocomplete(inputElement, options);
    if (window.currentMapInstance) autocomplete.bindTo("bounds", window.currentMapInstance);

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) {
            alert("請從下拉選單中選擇地點");
            return;
        }
        selectedHotelPlace = place;

        // UI 回饋
        document.getElementById('hotel-name-display').innerText = place.name;
        document.getElementById('hotel-selected-info').classList.remove('d-none');
    });

    // 當使用者重新打字時，清除已選狀態
    inputElement.addEventListener('input', () => {
        selectedHotelPlace = null;
        document.getElementById('hotel-selected-info').classList.add('d-none');
    });
}

// 載入行程資料
function loadTripData() {

    // 取得行程列表容器
    const listContainer = $('#place-list');

    // 顯示載入中，提示使用者程式正在運作    
    listContainer.html(`
        <div class="text-center p-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 text-muted">正在載入行程...</p>
        </div>
    `);

    $.ajax({
        url: `/api/TripApi/detail/${currentTripId}`,
        type: 'GET',
        success: function (data) {
            console.log("行程詳細資料:", data);
            const items = data.itineraryItems || [];
            DateStrings = data.tripInfo.dateStrings || [];
            const accommodations = data.accomadations || [];
            const flights = data.flights || []; 

            TripApi.getDetail(currentTripId).then(data => {

                console.log("行程詳細資料:", data);

                renderItinerary(items, DateStrings, accommodations, flights);
            });
        
        },
        error: function (xhr) {
            console.error("載入失敗", xhr);
            listContainer.html('<div class="text-danger text-center p-4">載入行程失敗，請重新整理。</div>');
        }
    });
}

/**
 * 渲染行程列表 (包含空天數)
 */
function renderItinerary(items, dates, accommodations, flights) {

    //取得行程列表容器並清空
    const container = document.getElementById('place-list');
    container.innerHTML = '';

    // A. [新增] 建立航班區塊容器
    const flightWrapper = document.createElement('div');
    flightWrapper.id = 'flight-wrapper'; // 給 ID 讓 renderer 找得到
    container.appendChild(flightWrapper);

    // 呼叫 Renderer 渲染內容
    flightRenderer.render(flights || []);

    // 綁定「新增航班」按鈕事件 (因為 HTML 是 renderer 產生的，所以要在這裡綁)
    const addBtn = document.getElementById('btn-add-flight-trigger');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            addFlightModal.open(currentTripId, () => loadTripData());
        });
    }

    // 綁定「刪除航班」按鈕
    document.querySelectorAll('.delete-flight-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            // 取得按鈕上的資料 (建議在渲染 HTML 時補上 data-version)
            const flightId = e.currentTarget.dataset.id;
            const rowVersion = e.currentTarget.dataset.version;

            if (!flightId || !rowVersion) {
                console.error("缺少刪除所需的 ID 或版本資訊");
                return;
            }

            if (confirm("確定要刪除這筆航班資訊嗎？")) {
                try {
                    // 傳送 ID 與版本標記
                    await TripApi.deleteFlight(flightId, rowVersion);

                    // 刪除成功後重新載入資料
                    alert("刪除成功！");
                    loadTripData();
                } catch (error) {
                    // 這裡會接收到 API 回傳的 409 衝突或其他錯誤訊息
                    alert("操作失敗：" + error);

                    // 如果是衝突錯誤，通常建議重新載入資料以獲取最新版本
                    loadTripData();
                }
            }
        });
    });



  

    // ==========================================
    // 【新增】 渲染頂部「住宿資訊」區塊
    // ==========================================
    const hotelSection = document.createElement('div');
    hotelSection.id = 'accommodation-wrapper'; 
    hotelSection.className = 'hotel-section mb-4 p-3 bg-white rounded shadow-sm border';

    // 住宿區塊 Header
    let hotelHtml = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="fw-bold m-0 text-primary"><i class="bi bi-building me-2"></i>住宿安排</h6>
            <button class="btn btn-sm btn-outline-primary rounded-pill" id="btn-add-hotel">
                <i class="bi bi-plus-lg"></i> 新增
            </button>
        </div>
        <div class="hotel-list-container">
    `;

    if (accommodations.length === 0) {
        hotelHtml += `
            <div class="text-center py-3 text-muted small bg-light rounded border border-dashed">
                尚未安排住宿
            </div>
        `;
    } else {
        accommodations.forEach(hotel => {
            // 這裡假設 hotel 裡有 Snapshot 的資料 (Address, Name)
            // 如果只有 SpotId，您可能需要後端做 Join 或是這裡再額外查
            const hotelName = hotel.hotelName || "未命名飯店";
            const address = hotel.address || "";
            const checkIn = hotel.checkInDate ? new Date(hotel.checkInDate).toLocaleDateString() : "--";
            const checkOut = hotel.checkOutDate ? new Date(hotel.checkOutDate).toLocaleDateString() : "--";

            hotelHtml += `
                <div class="hotel-card d-flex gap-3 mb-2 p-2 border rounded position-relative">
                    <div class="d-flex flex-column justify-content-center text-center bg-light rounded px-2" style="min-width: 60px;">
                        <i class="bi bi-moon-stars-fill text-primary mb-1"></i>
                        <small class="text-muted" style="font-size: 0.7rem;">${checkIn}</small>
                    </div>
                    <div class="flex-grow-1 overflow-hidden">
                        <div class="fw-bold text-truncate" title="${hotelName}">${hotelName}</div>
                        <div class="text-muted small text-truncate"><i class="bi bi-geo-alt me-1"></i>${address}</div>
                        <div class="text-muted small mt-1">
                            <span class="badge bg-secondary bg-opacity-10 text-secondary border">
                                <i class="bi bi-calendar-check me-1"></i>${checkIn} - ${checkOut}
                            </span>
                        </div>
                    </div>
                    <!-- 刪除按鈕 -->
                    <button class="btn btn-link text-danger p-0 position-absolute top-0 end-0 mt-1 me-2 hotel-delete-btn" data-id="${hotel.id}" data-version="${hotel.rowVersion}">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            `;
        });
    }

    hotelHtml += `</div>`; // Close container
    hotelSection.innerHTML = hotelHtml;
    container.appendChild(hotelSection);

    // 綁定「新增住宿」按鈕事件
    hotelSection.querySelector('#btn-add-hotel').addEventListener('click', () => {
        // 清空欄位
        document.getElementById('hotel-search-input').value = '';
        document.getElementById('hotel-checkin').value = '';
        document.getElementById('hotel-checkout').value = '';
  
        document.getElementById('hotel-selected-info').classList.add('d-none');
        selectedHotelPlace = null;

        const modal = new bootstrap.Modal(document.getElementById('hotelEditModal'));
        modal.show();
    });

    // 綁定「刪除住宿」按鈕
    hotelSection.querySelectorAll('.hotel-delete-btn').forEach(btn => {
        btn.addEventListener('click', async function () { // 加入 async
            const hotelId = this.dataset.id;
            const version = this.dataset.version;

            if (!hotelId || !version) {
                console.error("缺少 ID 或版本標記 (RowVersion)");
                return;
            }

            if (confirm("確定移除此住宿？")) {
                try {
                    // 呼叫 API 並帶入版本印章
                    await TripApi.deleteAccommodation(hotelId, version);

                    alert("已成功移除住宿");

                    // 成功後執行載入資料的方法 (假設名稱為 loadTripData)
                    if (typeof loadTripData === 'function') {
                        loadTripData();
                    } else {
                        location.reload(); // 備案：重新整理頁面
                    }
                } catch (error) {
                    // 這裡會抓到 API 回傳的 409 或其他錯誤訊息
                    alert("無法移除住宿：" + error);

                    // 如果是並行衝突，通常需要刷新的資料以取得正確狀態
                    if (typeof loadTripData === 'function') loadTripData();
                }
            }
        });
    });



    // 餐廳匯總區塊
    const restaurantWrapper = document.createElement('div');
    restaurantWrapper.id = 'restaurant-wrapper';
    container.appendChild(restaurantWrapper);
    restaurantRenderer.render(items || [], dates); 
    restaurantRenderer.bindEvents((data) => {
        handleSpotClick(data);
    })





    // ==========================================
    // 【新增】 渲染頂部「景點」區塊
    // ==========================================
    //確保景點陣列不為NULL
    items = items || [];

    // 1. 資料分組：按 DayNumber 分組 { 1: [...], 2: [...] }
    const groupedItems = items.reduce((acc, item) => {
        const day = item.dayNumber;
        if (!acc[day]) acc[day] = [];
        acc[day].push(item);
        return acc;
    }, {});

    // 2. 依日期渲染每一天
    dates.forEach((dateString, index) => {

        const dayNum = index + 1; // 陣列索引 0 是 Day 1

        // 嘗試取得該天的行程，如果沒有就給空陣列
        const dayItems = groupedItems[dayNum] || [];

        // 排序 (如果有資料的話)
        if (dayItems.length > 0) {
            dayItems.sort((a, b) => {
                const timeCompare = (a.startTime || "").localeCompare(b.startTime || "");
                if (timeCompare !== 0) return timeCompare;
                return a.sortOrder - b.sortOrder;
            });
        }

        // 建立 Day Block
        const daySection = document.createElement('div');
        daySection.className = 'day-block mb-4'; // 增加一點底部間距
        daySection.id = `day-${dayNum}`; // [新增] 加上 ID: day-1, day-2...
        daySection.setAttribute('data-day', dayNum);

        // Header + Timeline + 【新增】快速新增區塊
        daySection.innerHTML = `
        <div class="day-header">
            <span>Day ${dayNum} <small class="text-secondary fw-normal ms-2">${dateString}</small></span>

            <div class="dropdown">
                <button class="btn btn-sm text-secondary p-0" data-bs-toggle="dropdown">
                <i class="bi bi-three-dots"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li>
                        <a class="dropdown-item text-danger delete-day-btn"
                           href="javascript:void(0)"
                           data-day="${dayNum}">
                           <i class="bi bi-calendar-minus me-2"></i>刪除此天
                        </a>
                    </li>
                </ul>
            </div>
        </div>
    
        <div class="timeline-container" style="min-height: 50px;">
            <!-- 行程卡片容器 -->
        </div>

        <!-- 【新增】底部快速新增區塊 -->
        <div class="quick-add-section p-3 border-top">
            <!-- 狀態 A: 顯示 + 按鈕 -->
            <div class="quick-add-btn-wrapper text-center">
                <button class="btn btn-outline-primary btn-sm w-100 rounded-pill quick-add-btn">
                    <i class="bi bi-plus-lg me-1"></i> 新增景點
                </button>
            </div>

            <!-- 狀態 B: 顯示搜尋框 (預設隱藏) -->
            <div class="quick-add-input-wrapper d-none">
                <div class="input-group input-group-sm">
                    <span class="input-group-text bg-white border-end-0"><i class="bi bi-search text-muted"></i></span>
                    <input type="text" class="form-control border-start-0 quick-search-input" placeholder="搜尋景點以加入 Day ${dayNum}..." autocomplete="off">
                    <button class="btn btn-outline-secondary cancel-quick-add" type="button"><i class="bi bi-x-lg"></i></button>
                </div>
            </div>
        </div>
        `;


        const itemsContainer = daySection.querySelector('.timeline-container');

        // 【修改 3】判斷是否有行程，決定要渲染卡片還是空狀態
        if (dayItems.length === 0) {
            // A. 如果沒行程 -> 顯示空狀態 (Empty State)
            itemsContainer.innerHTML = `
                <div class="text-center py-4 text-muted empty-day-placeholder" style="border: 2px dashed #f0f0f0; margin: 10px; border-radius: 8px;">
                    <small>目前沒有安排行程</small><br>
                    <small style="font-size: 0.75rem;">可從右側地圖搜尋加入</small>
                </div>
            `;
        } else {
            // B. 如果有行程 -> 正常渲染卡片
            dayItems.forEach((item, index) => {


                console.log("渲染行程項目:", item);

                const rawStart = item.startTime || "";
                const rawEnd = item.endTime || "";
                const displayStart = formatTime(item.startTime);
                const displayEnd = formatTime(item.endTime);
                const spotName = item.profile ? item.profile.name_ZH : "未命名景點";
                const spotAddress = item.profile ? item.profile.address : "無地址資訊";
                const lat = item.profile ? item.profile.lat : null;
                const lng = item.profile ? item.profile.lng : null;
                const googlePlaceId = item.profile ? item.profile.placeId : ""
                const photoUrl = item.profile ? item.profile.photoUrl : ""


                const itemHtml = `
                    <div class="itinerary-card itinerary-item"
                         data-id="${item.id}"
                         data-spot-id="${item.spotId}"
                         data-lat="${lat}"
                         data-lng="${lng}"
                         data-external-id="${googlePlaceId}">
                        
                        <div class="timeline-dot text-muted small">${index + 1}</div>

                        <div class="d-flex w-100 gap-3">

                            <div class="place-time border-end pe-2 edit-time-trigger"
                                style="cursor: pointer;"
                                title="點擊編輯時間"
                                data-id="${item.id}" 
                                data-version="${item.rowVersion}"
                                data-start="${rawStart}" 
                                data-end="${rawEnd}">     
                                
                                <div class="fw-bold text-primary">${displayStart}</div>
                                <div class="text-muted small">${displayEnd}</div>

                            </div>


                            <div class="place-content d-flex flex-grow-1 gap-2 overflow-hidden"> 
                            

                                 <div class="place-img" style="min-width: 60px; width: 60px; height: 60px;">
                                    <img src="${photoUrl || 'default-placeholder.png'}" 
                                         class="rounded object-fit-cover w-100 h-100" 
                                         alt="${spotName}">
                                </div>

                                <div class="place-info overflow-hidden">
                                    <div class="place-title text-truncate fw-bold" title="${spotName}">${spotName}</div>
                                    <div class="place-address text-muted small text-truncate">
                                        <i class="bi bi-geo-alt-fill text-secondary me-1"></i>${spotAddress}
                                    </div>
                                </div>
                                
                            </div>                        

                            <div class="place-action ms-auto d-flex flex-column justify-content-between align-items-end">
                                <div class="drag-handle text-muted"><i class="bi bi-grip-vertical"></i></div>
                                <button class="btn btn-link text-danger p-0 delete-btn" style="font-size: 0.9rem;">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                itemsContainer.insertAdjacentHTML('beforeend', itemHtml);
            });
        }

        container.appendChild(daySection);
  
    });

    itineraryNavigator.updateDays(dates);
    recModal.updateDays(dates);
    bindItemEvents();
}

// 【修改】新增事件綁定函式
function bindItemEvents() {

    // 點擊行程卡片
    document.querySelectorAll('.itinerary-item').forEach(item => {
        item.addEventListener('click', function (e) {

            // 0. 排除刪除與拖曳按鈕的點擊事件
            if (e.target.closest('.delete-btn') || e.target.closest('.drag-handle')) return;



            // 【新增 2】偵測是否點擊了「時間區塊」
            const timeTrigger = e.target.closest('.edit-time-trigger');
            if (timeTrigger) {
                e.stopPropagation(); // 阻止事件冒泡 (不要觸發地圖移動)

                const itemId = timeTrigger.dataset.id;             
                const rowVersion = timeTrigger.dataset.version;
                const start = (timeTrigger.dataset.start || "").substring(0, 5);
                const end = (timeTrigger.dataset.end || "").substring(0, 5);

                document.getElementById('edit-item-id').value = itemId;         
                document.getElementById('edit-item-rowVersion').value = rowVersion;
                document.getElementById('edit-start-time').value = start;
                document.getElementById('edit-end-time').value = end;

                // 顯示彈窗 (使用 Bootstrap Modal API)
                const modal = new bootstrap.Modal(document.getElementById('timeEditModal'));
                modal.show();

                return; // 結束，不執行地圖移動
            }


            // 1. 嘗試取得 Google Place ID 與 Spot ID
            const googlePlaceId = this.getAttribute('data-external-id');
            const spotId = this.getAttribute('data-spot-id');

            // 2. 呼叫 Map Manager 的新函式
            if (googlePlaceId) {
                // 如果有 Google Place ID，就去查完整資料並顯示彈窗
                showPlaceByGoogleId(googlePlaceId, spotId);
            } else {
                // 如果是舊資料沒有 Place ID，則退回到原本的只移動地圖
                const lat = parseFloat(this.getAttribute('data-lat'));
                const lng = parseFloat(this.getAttribute('data-lng'));
                if (!isNaN(lat) && !isNaN(lng) && window.currentMapInstance) {
                    window.currentMapInstance.panTo({ lat, lng });
                    window.currentMapInstance.setZoom(17);
                }
            }
        });
    });

    // 刪除按鈕
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const card = this.closest('.itinerary-item');
            const id = card.getAttribute('data-id');



            if (confirm('確定要移除此景點嗎？')) {
                console.log(`準備刪除行程 ID: ${id}`);


                $.ajax({
                    url: `/api/TripApi/DeleteSpotFromTrip/${id}`,
                    type: 'DELETE',
                    success: function (result) {
                        refreshItineraryList();

                    },
                    error: function (xhr, status, error) {
                        alert('發生錯誤：' + xhr.responseText);
                    }
                });
            }
        });
    });

    // --- 新增：刪除天數的事件監聽 ---
    const deleteDayButtons = document.querySelectorAll('.delete-day-btn');

    deleteDayButtons.forEach(btn => {
        btn.addEventListener('click', async function (e) {
            e.preventDefault(); // 阻止 <a> 標籤的預設跳轉行為

            // 從 data-day 屬性中取得天數
            const dayNum = parseInt(this.getAttribute('data-day'));

            // 直接呼叫模組內的 deleteTripDay 函式 (不需要 window.)
            await deleteTripDay(dayNum);
        });
    });

    // ============================================
    // 【新增】快速新增區塊的事件綁定
    // ============================================

    // 1. 點擊「+ 新增景點」按鈕
    document.querySelectorAll('.quick-add-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const wrapper = this.closest('.quick-add-section');
            const btnWrapper = wrapper.querySelector('.quick-add-btn-wrapper');
            const inputWrapper = wrapper.querySelector('.quick-add-input-wrapper');
            const input = wrapper.querySelector('.quick-search-input');
            const dayBlock = wrapper.closest('.day-block');
            const dayNum = dayBlock.getAttribute('data-day');

            // 切換顯示
            btnWrapper.classList.add('d-none');
            inputWrapper.classList.remove('d-none');

            // 聚焦並初始化 Autocomplete
            input.focus();
            initQuickAutocomplete(input, dayNum);
        });
    });

    // 2. 點擊「X」取消按鈕
    document.querySelectorAll('.cancel-quick-add').forEach(btn => {
        btn.addEventListener('click', function () {
            const wrapper = this.closest('.quick-add-section');
            const btnWrapper = wrapper.querySelector('.quick-add-btn-wrapper');
            const inputWrapper = wrapper.querySelector('.quick-add-input-wrapper');
            const input = wrapper.querySelector('.quick-search-input');

            // 清空並還原顯示
            input.value = '';
            btnWrapper.classList.remove('d-none');
            inputWrapper.classList.add('d-none');
        });
    });
}

// 工具：移除秒數
function formatTime(timeString) {
    if (!timeString) return "--:--";
    if (timeString.length >= 5) return timeString.substring(0, 5);
    return timeString;
}

function saveEditedTime() {
    const id = document.getElementById('edit-item-id').value;
    const rowVersion = document.getElementById('edit-item-rowVersion').value;
    const start = document.getElementById('edit-start-time').value; // 格式 "08:30"
    const end = document.getElementById('edit-end-time').value;     // 格式 "09:30"

    // 簡單驗證
    if (!start) {
        alert("請輸入開始時間");
        return;
    }

    // 準備 DTO (根據您的後端需求調整，通常需要補上秒數)
    const updateDto = {
        Id: parseInt(id),
        TripId: currentTripId,
        RowVersion: rowVersion, // 如果需要版本控制，請在此填入正確的值
        StartTime: start + ":00", // 補上秒數
        EndTime: end ? (end + ":00") : null
    };

    console.log("更新時間 DTO:", updateDto);

    // 關閉彈窗
    const modalEl = document.getElementById('timeEditModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    modalInstance.hide();

 
    $.ajax({
        url: '/api/TripApi/UpdateSpotTime',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(updateDto),
        success: function (response) {

            refreshItineraryList();

            // 通知成員修改
            if (connection && connection.state === signalR.HubConnectionState.Connected) {
                connection.invoke("NotifyUpdate", updateDto.TripId.toString(), updateDto.Id)
                    .catch(err => console.error("通知失敗: ", err));
            }            
        },
        error: function (xhr) {
            // 這裡只處理「儲存」這件事發生的錯誤
            if (xhr.status === 409) {
                const errorMsg = xhr.responseJSON?.message || "此行程已被其他成員修改";
                alert(errorMsg); // 告知衝突原因
            } else {
                alert('更新時間失敗：' + (xhr.responseText || '未知錯誤'));
            }

            // 關鍵：儲存失敗後的 refreshItineraryList 是為了把正確的資料抓回來
            // 確保 refreshItineraryList 內部只負責「渲染畫面」，不要在它裡面再寫 alert
            refreshItineraryList();
        }
    });
}

// 【新增 helper】初始化單一輸入框的 Autocomplete
function initQuickAutocomplete(inputElement, dayNum) {
    // 避免重複綁定 (Google API 會報錯或產生多個下拉)
    if (inputElement.dataset.autocompleteBound) return;

    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        console.error("Google Maps API 未載入");
        return;
    }

    const options = {
        types: ['establishment', 'geocode'],
        fields: ['place_id', 'geometry', 'name', 'types', 'formatted_address', 'photos', 'rating', 'user_ratings_total']
    };

    const autocomplete = new google.maps.places.Autocomplete(inputElement, options);

    // 如果有地圖實體，綁定 bounds 讓搜尋結果偏向地圖目前區域
    if (window.currentMapInstance) {
        autocomplete.bindTo("bounds", window.currentMapInstance);
    }

    // 綁定選取事件
    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            alert("找不到地點資訊：" + place.name);
            return;
        }

        console.log(`在 Day ${dayNum} 選擇了地點:`, place.name);

        // 直接執行加入行程的邏輯
        addQuickPlaceToTrip(place, dayNum);

        // 清空輸入框 (或還原按鈕狀態，看您喜好)
        inputElement.value = '';
    });

    // 標記已綁定
    inputElement.dataset.autocompleteBound = "true";
}

// 【新增 helper】處理快速加入行程 (複製 edit-map-manager 的邏輯並簡化)
function addQuickPlaceToTrip(place, dayNum) {
    // 1. 先存 Snapshot (因為需要 SpotId)
    savePlaceToDatabase(place).then(spotId => {
        if (!spotId) {
            alert("儲存景點失敗，無法加入");
            return;
        }

        // 2. 呼叫加入行程 API
        const tripId = document.getElementById('current-trip-id').value;

        const dto = {
            TripId: parseInt(tripId),
            SpotId: parseInt(spotId),
            DayNumber: parseInt(dayNum),
            StartTime: "08:00:00", // 預設時間，或者您可以讓 input 旁邊多兩個時間選擇器
            EndTime: "09:00:00",
            SortOrder: 0
        };

        $.ajax({
            url: '/api/TripApi/AddSpotToTrip',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dto),
            success: function (response) {
                // 成功後重新整理列表
                refreshItineraryList();

                // 選用：移動地圖到該點
                if (window.currentMapInstance && place.geometry.location) {
                    window.currentMapInstance.panTo(place.geometry.location);
                    window.currentMapInstance.setZoom(16);
                }
            },
            error: function (xhr) {
                alert('加入失敗：' + (xhr.responseJSON?.message || "伺服器錯誤"));
            }
        });
    });
}

// 【新增】儲存住宿資料
function saveHotelData() {
    if (!selectedHotelPlace) {
        alert("請先搜尋並選擇一間飯店");
        return;
    }

    const checkIn = document.getElementById('hotel-checkin').value;
    const checkOut = document.getElementById('hotel-checkout').value;
   

    if (!checkIn || !checkOut) {
        alert("請填寫完整的入住與退房時間");
        return;
    }

    savePlaceToDatabase(selectedHotelPlace).then(spotId => {
        if (!spotId) return;

        const dto = {
            tripId: parseInt(currentTripId),
            spotId: parseInt(spotId),
            hotelName: selectedHotelPlace.name, 
            address: selectedHotelPlace.formatted_address,
            checkInDate: checkIn,
            checkOutDate: checkOut,          
        };

        $.ajax({
            url: '/api/TripApi/AddAccommodation',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dto),
            success: function (res) {
                // 關閉 Modal
                const modalEl = document.getElementById('hotelEditModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();

                // 重新整理
                refreshItineraryList();
            },
            error: function (xhr) {
                alert("新增住宿失敗：" + (xhr.responseJSON?.message || "Error"));
            }
        });
    });
}

// 【新增】刪除住宿
function deleteHotel(accommodationId) {
    $.ajax({
        url: `/api/TripApi/DeleteAccommodation/${accommodationId}`, // 請確認後端 API
        type: 'DELETE',
        success: function () {
            refreshItineraryList();
        },
        error: function (xhr) {
            alert("刪除失敗");
        }
    });
}

// 抽離出一個共用的處理函式 (給餐廳卡片用，也可以給行程卡片用)
function handleSpotClick(data) {
    const { lat, lng, googlePlaceId, spotId } = data;

    if (googlePlaceId) {
        // 1. 如果有 Google Place ID，查詳細資料並開彈窗
        showPlaceByGoogleId(googlePlaceId, spotId);
    } else if (lat && lng && window.currentMapInstance) {
        // 2. 如果只有經緯度 (舊資料)，只移動地圖
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (!isNaN(latNum) && !isNaN(lngNum)) {
            window.currentMapInstance.panTo({ lat: latNum, lng: lngNum });
            window.currentMapInstance.setZoom(17);
        }
    }
}

// 處理刪除天數（包含中間天數遞補邏輯）
async function deleteTripDay(dayNum) {
    const totalDays = DateStrings.length;

    // 安全檢查
    if (totalDays <= 1) {
        alert("行程至少需要保留一天。");
        return;
    }

    const confirmMsg = `確定要刪除第 ${dayNum} 天嗎？\n\n警告：\n1. 該天的所有景點與住宿將被永久刪除。\n2. 第 ${dayNum + 1} 天之後的行程將會自動往前遞補。\n3. 行程總天數將減少一天。`;

    if (!confirm(confirmMsg)) return;

    try {
        // 呼叫後端 API 執行刪除與遞補邏輯
        // 這裡的 URL 需對應您後端的 Action
        await $.ajax({
            url: `/api/TripApi/DeleteDay/${currentTripId}/${dayNum}`,
            type: 'DELETE',
            success: function () {
                alert(`第 ${dayNum} 天已刪除，後續行程已自動遞補。`);
                // 重新載入資料以更新介面 (DateStrings, 導覽列, 行程列表)
                refreshItineraryList();
                // 如果刪除後導致日期變動，建議重新載入頁面確保全域變數同步
                window.location.reload();
            },
            error: function (xhr) {
                const errorMsg = xhr.responseJSON?.message || "刪除天數失敗";
                alert(errorMsg);
            }
        });
    } catch (err) {
        console.error("Delete Day Error:", err);
    }
}

// 為了讓 HTML onclick 能點到，需掛載到 window (或在 bindEvents 綁定)
window.deleteTripDay = deleteTripDay;