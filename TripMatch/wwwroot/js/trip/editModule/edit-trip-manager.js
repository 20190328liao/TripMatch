import { TripApi } from './api/trip-api.js';
import { AddFlightModal } from './components/add-flight-modal.js';
import { FlightRenderer } from './components/flight-renderer.js';
import { RestaurantRenderer } from './components/restaurant-renderer.js';
import { savePlaceToDatabase, showPlaceByGoogleId, renderPlaceOnMap } from './edit-map-manager.js';
import { RecommendationPanel } from './components/recommendation-panel.js';
import { SignalRManager } from './signalr-manager.js';


const currentTripId = document.getElementById('current-trip-id').value;
let DateStrings = [];
let recPanel;
let addFlightModal;
let flightRenderer;
let restaurantRenderer;
let directionsService;
let directionsRenderer;

// 全域切換 Tab 函式 (為了讓 HTML onclick 呼叫)
window.switchTab = function (mode) {
    // 1. 更新按鈕 UI
    $('.seg-item').removeClass('active');
    $(`#tab-${mode}`).addClass('active');

    // 2. 【核心修改】切換內容區：移除舊的 active，加上新的 active
    // CSS 會處理 display: flex 和 position: absolute
    $('.itinerary-content').removeClass('tab-content-active');
    $(`#${mode}-tab-content`).addClass('tab-content-active');

    // 3. 數據載入邏輯 (探索與收藏)
    if (mode === 'explore' || mode === 'favorites') {
        const center = window.currentMapInstance ? window.currentMapInstance.getCenter() : { lat: 25, lng: 121 };
        const geo = { 
            lat: typeof center.lat === 'function' ? center.lat() : center.lat, 
            lng: typeof center.lng === 'function' ? center.lng() : center.lng 
        };
        
        if (recPanel) {
            recPanel.load(`${mode}-tab-content`, geo, mode);
        }
    }
};



// edit-trip-manager.js

export function initEditPage(mapInstance, tripSimpleInfo) {
    window.currentMapInstance = mapInstance;
    DateStrings = tripSimpleInfo.dateStrings || [];

    // 1. 初始化各個組件
    recPanel = new RecommendationPanel(DateStrings);
    addFlightModal = new AddFlightModal();
    flightRenderer = new FlightRenderer('flight-wrapper');
    restaurantRenderer = new RestaurantRenderer('restaurant-wrapper');

    // 2. 【核心修復】改用事件委派 (Event Delegation)
    // 我們把監聽器掛在 '#place-list' 這個永遠不會消失的容器上
    const $placeList = $('#place-list');

    // A. 處理行程卡片點擊 (顯示地圖)
    $placeList.on('click', '.itinerary-item', function (e) {
        // 如果點到的是按鈕或下拉選單，就不觸發地圖跳轉
        if ($(e.target).closest('button, a, .dropdown').length) return;

        const spotId = $(this).data('spot-id');
        if (spotId && window.showPlaceByGoogleId) {
            window.showPlaceByGoogleId(spotId);
        }
    });

    // B. 處理刪除按鈕 (請確認你的 renderItinerary 產出的 HTML 有這個 class)
    $placeList.on('click', '.btn-delete-item', function (e) {
        e.stopPropagation();
        const itemId = $(this).data('id');
        // 呼叫你原本寫在裡面的刪除邏輯
        if (confirm('確定要刪除嗎？')) {
            handleDeleteItem(itemId);
        }
    });

    // C. 處理時間編輯按鈕
    $placeList.on('click', '.btn-edit-time', function (e) {
        e.stopPropagation();
        const itemId = $(this).data('id');
        openTimeEditModal(itemId); // 開啟時間編輯的 Modal
    });

    // 3. 其他原本就有的監聽邏輯
    document.body.addEventListener('add-spot-to-trip', (e) => {
        const { placeId, dayNum } = e.detail;
        handleAddSpotFromModal(placeId, dayNum);
    });

    initHotelEditModal();

    initTimeEditModal();

    // 初始化下拉選單
    initNavDropdown(DateStrings);

    // 最後載入數據
    loadTripData();
}
export function refreshItineraryList() {
    loadTripData();
}
export function GetDateStrings() {
    return DateStrings;
}
export function showSimpleToast(msg) {
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
export function flashItineraryElement(id) {
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

// 【新增】初始化導覽列下拉選單
/**
 * 初始化導覽下拉選單與跳轉功能
 */
function initNavDropdown(dates) {
    const list = document.getElementById('day-jump-list');
    const label = document.getElementById('current-day-label');
    if (!list) return;

    let html = '';

    // 1. 先加三個固定分區
    html += `
        <li>
            <a class="dropdown-item nav-jump-item" href="javascript:void(0)" data-target="#flight-wrapper">
                <i class="bi bi-airplane me-2"></i> 航班
            </a>
        </li>
        <li>
            <a class="dropdown-item nav-jump-item" href="javascript:void(0)" data-target="#accommodation-wrapper">
                <i class="bi bi-building me-2"></i> 住宿
            </a>
        </li>
        <li>
            <a class="dropdown-item nav-jump-item" href="javascript:void(0)" data-target="#restaurant-wrapper">
                <i class="bi bi-cup-straw me-2"></i> 餐廳
            </a>
        </li>
        <li><hr class="dropdown-divider"></li>
    `;

    // 2. 加各天的跳轉
    dates.forEach((date, index) => {
        const dayNum = index + 1;
        const dateStr = new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
        html += `
            <li>
                <a class="dropdown-item day-jump-item" href="javascript:void(0)" data-day="${dayNum}">
                    <span class="fw-bold me-2">Day ${dayNum}</span>
                    <span class="text-muted small">${dateStr}</span>
                </a>
            </li>
        `;
    });

    html += `<li><hr class="dropdown-divider"></li>`;
    html += `<li><a class="dropdown-item text-primary" href="javascript:void(0)" id="btn-add-day-nav-inner"><i class="bi bi-plus-circle me-1"></i>新增天數</a></li>`;

    list.innerHTML = html;

    // 分區跳轉
    $(list).find('.nav-jump-item').on('click', function () {
        // 切回 itinerary 分頁
        window.switchTab('itinerary');
        // 用id找目標
        const targetSel = $(this).data('target');
        setTimeout(() => {
            const sec = document.querySelector(targetSel);
            const scrollContainer = document.getElementById('itinerary-tab-content');
            if (sec && scrollContainer) {
                // 讓目標元素頂到容器頂部
                scrollContainer.scrollTo({
                    top: sec.offsetTop,
                    behavior: 'smooth'
                });
            }
        }, 100);
    });

    // 各天跳轉
    $(list).find('.day-jump-item').on('click', function () {
        const day = $(this).data('day');
        //if (label) label.textContent = `Day ${day}`;

        window.switchTab('itinerary');
        setTimeout(() => {
            const targetDayElement = document.getElementById(`day-${day}`);
            const scrollContainer = document.getElementById('itinerary-tab-content');

            if (targetDayElement && scrollContainer) {
                const topPos = targetDayElement.offsetTop;

                scrollContainer.scrollTo({
                    top: topPos,
                    behavior: 'smooth'
                });
            } else {
                console.warn(`[定位失敗] 找不到 Day ${day} 元素或捲動容器`);
            }
        }, 100);
    });

    // 新增天數
    $('#btn-add-day-nav-inner').on('click', function () {
        if (typeof handleAddDay === 'function') {
            handleAddDay();
        }
    });
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
                        SignalRManager.broadcast(currentTripId, "新增景點", 0); 
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
            SignalRManager.broadcast(currentTripId, `往後新增一天的行程`, 0);
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
                    <button type="button" class="btn btn-sm btn_Gray flex-grow-1" data-bs-dismiss="modal">取消</button>
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
                    <button type="button" class="btn btn-sm btn_Gray flex-grow-1" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-sm btn_light flex-grow-1" id="save-hotel-btn">加入行程</button>
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
    const listContainer = $('#place-list');

    // 顯示 Loading
    listContainer.html(`
        <div class="text-center p-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 text-muted small">同步行程中...</p>
        </div>
    `);

    $.ajax({
        url: `/api/TripApi/detail/${currentTripId}`,
        type: 'GET',
        success: function (data) {
            DateStrings = data.tripInfo.dateStrings || [];
            const items = data.itineraryItems || [];
            const accommodations = data.accomadations || [];
            const flights = data.flights || [];

            // 1. 渲染 HTML (這裡會銷毀舊 DOM)
            renderItinerary(items, DateStrings, accommodations, flights);

            // 2. 更新導覽列 Dropdown (確保 Day 1, Day 2... 與資料同步)
            initNavDropdown(DateStrings);

            // 3. 更新探索面板的天數 (確保加入行程時日期正確)
            if (recPanel) recPanel.updateDays(DateStrings);

            // 4. 如果有使用 Tooltips，需在此重新初始化
            // reinitTooltips();
        },
        error: function (xhr) {
            listContainer.html('<div class="text-danger text-center p-4">資料載入失敗</div>');
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
    document.querySelectorAll('.flight-delete-btn').forEach(btn => {
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
                    await TripApi.deleteFlight(currentTripId, flightId, rowVersion);

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
            <h6 class="fw-bold m-0 text-success"><i class="bi bi-building me-2"></i>住宿安排</h6>          
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
            const photoUrl = hotel.photoUrl || 'https://via.placeholder.com/70?text=No+Image';

            hotelHtml += `
                <div class="hotel-card d-flex gap-3 mb-2 p-2 border rounded position-relative">

                    <div class="hotel-img" style="min-width: 60px; width: 60px; height: 60px;">
                        <img src="${photoUrl}" 
                         class="rounded object-fit-cover w-100 h-100" 
                         alt="${hotelName}">
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

                    <button class="hotel-delete-btn"
                            data-id="${hotel.id}" 
                            data-version="${hotel.rowVersion || ''}"
                            title="移除住宿">
                        <i class="bi bi-trash"></i>
                    </button>                 
                </div>
            `;
        });
    }  

    hotelHtml +=`
        <div class="quick-add-section p-3 border-top">
            <button id="btn-add-hotel" class="btn btn-outline-mint btn-sm w-100 rounded-pill">
                <i class="bi bi-plus-lg me-1"></i> 新增住宿
            </button>
        </div>
    `;

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

                    // 成功後執行載入資料的方法
                    if (typeof loadTripData === 'function') {
                        loadTripData();
                        SignalRManager.broadcast(currentTripId, "刪除住宿", 0); 
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
                <button class="btn btn-outline-mint btn-sm w-100 rounded-pill quick-add-btn">
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
                            

                            <button class="spot-delete-btn" title="移除景點">
                                <i class="bi bi-trash"></i>
                            </button>


                           
                        </div>
                    </div>
                `;

                itemsContainer.insertAdjacentHTML('beforeend', itemHtml);




                //// 【新增】如果不是最後一個景點，插入「路線資訊區塊」
                //if (index < dayItems.length - 1) {
                //    const nextItem = dayItems[index + 1];

                //    // 取得起點與終點座標或 ID
                //    const originId = item.profile?.placeId;
                //    const destId = nextItem.profile?.placeId;
                //    const originLat = item.profile?.lat;
                //    const originLng = item.profile?.lng;
                //    const destLat = nextItem.profile?.lat;
                //    const destLng = nextItem.profile?.lng;
                //    const routeHtml = `
                //        <div class="route-info-block my-3 mx-4 p-3 shadow-sm border rounded-3" 
                //             style="cursor: pointer; transition: transform 0.2s; background: #ffffff;"
                //             data-origin-id="${originId}"
                //             data-dest-id="${destId}"
                //             data-origin-lat="${originLat}"
                //             data-dest-lat="${destLat}"
                //             data-origin-lng="${originLng}"
                //             data-dest-lng="${destLng}">
                //            <div class="d-flex align-items-center gap-2">
                //                <div class="spinner-grow spinner-grow-sm text-success" role="status" style="width: 8px; height: 8px;"></div>
                //                <span class="small text-secondary">點擊獲取最佳交通建議...</span>
                //            </div>
                //        </div>
                //    `;
                //    itemsContainer.insertAdjacentHTML('beforeend', routeHtml);
                //}




            });
        }

        container.appendChild(daySection);
  
    });
    recPanel.updateDays(dates);
    bindItemEvents();
}

// 【修改】新增事件綁定函式
function bindItemEvents() {

    // 點擊行程卡片
    document.querySelectorAll('.itinerary-item').forEach(item => {
        item.addEventListener('click', function (e) {

            // 0. 排除刪除與拖曳按鈕的點擊事件
            if (e.target.closest('.spot-delete-btn') || e.target.closest('.drag-handle')) return;



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
    document.querySelectorAll('.spot-delete-btn').forEach(btn => {
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
                        SignalRManager.broadcast(currentTripId, "刪除行程", 0); 
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

    document.querySelectorAll('.route-info-block').forEach(block => {
        block.addEventListener('click', function () {
            const data = this.dataset;
            const origin = data.originId ? { placeId: data.originId } : { lat: parseFloat(data.originLat), lng: parseFloat(data.originLng) };
            const destination = data.destId ? { placeId: data.destId } : { lat: parseFloat(data.destLat), lng: parseFloat(data.destLng) };

            // 傳入 this (即點擊的那個區塊)
            calculateAndDisplayRoute(origin, destination, this);
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
            SignalRManager.broadcast(updateDto.TripId, "更新行程時間", response.targetId);              
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

                // 【關鍵修改】：呼叫地圖渲染功能，顯示標記與 InfoWindow
                if (typeof renderPlaceOnMap === 'function') {
                    // 傳入 Google Place 物件與剛產生的 spotId
                    renderPlaceOnMap(place, spotId);
                } else if (window.currentMapInstance && place.geometry.location) {
                    // 備案邏輯
                    window.currentMapInstance.panTo(place.geometry.location);
                    window.currentMapInstance.setZoom(16);
                }

                // 提示使用者 (可選)
                showSimpleToast(`已加入 Day ${dayNum}`);
            },
            error: function (xhr) {
                alert('加入失敗：' + (xhr.responseJSON?.message || "伺服器錯誤"));
            }
        });
    });
}

// 儲存住宿資料
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

                SignalRManager.broadcast(currentTripId, "新增住宿", 0); 
            },
            error: function (xhr) {
                alert("新增住宿失敗：" + (xhr.responseJSON?.message || "Error"));
            }
        });
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

                SignalRManager.broadcast(currentTripId, `刪除第 ${dayNum} 天，後續行程已自動遞補。`, 0);
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


/**
 * 計算並顯示路線，同時更新 UI 區塊資訊
 * @param {Object} origin - 起點資訊 { placeId: '...', lat: ..., lng: ... }
 * @param {Object} destination - 終點資訊 { placeId: '...', lat: ..., lng: ... }
 * @param {HTMLElement} displayElement - 要顯示資訊的 HTML 容器元件
 */
function calculateAndDisplayRoute(origin, destination, displayElement) {
    if (!window.currentMapInstance) return;

    // 1. 確保服務已初始化
    if (!window.directionsService) {
        window.directionsService = new google.maps.DirectionsService();
    }
    if (!window.directionsRenderer) {
        window.directionsRenderer = new google.maps.DirectionsRenderer({
            map: window.currentMapInstance,
            suppressMarkers: false, // 是否隱藏 A/B 標記，若想自訂標記可設為 true
            polylineOptions: {
                strokeColor: "blue", // 薄荷綠/翡翠綠
                strokeWeight: 6,
                strokeOpacity: 0.7
            }
        });
    }

    // 2. 準備要求參數
    const request = {
        origin: origin.placeId ? { placeId: origin.placeId } : { lat: parseFloat(origin.lat), lng: parseFloat(origin.lng) },
        destination: destination.placeId ? { placeId: destination.placeId } : { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) },
        travelMode: google.maps.TravelMode.DRIVING // 預設最佳建議 (開車)
    };

    // 3. 呼叫 Google Directions Service
    window.directionsService.route(request, (response, status) => {
        if (status === "OK") {
            // 在地圖上畫出線條
            window.directionsRenderer.setDirections(response);

            const leg = response.routes[0].legs[0];

            // --- 關鍵：正確組裝 Google Maps 外部連結 ---
            // 使用官方規格 https://www.google.com/maps/dir/?api=1
            const baseUrl = "https://www.google.com/maps/dir/?api=1";
            const originParam = origin.placeId ? `&origin=unused&origin_place_id=${origin.placeId}` : `&origin=${origin.lat},${origin.lng}`;
            const destParam = destination.placeId ? `&destination=unused&destination_place_id=${destination.placeId}` : `&destination=${destination.lat},${destination.lng}`;
            const googleMapsUrl = `${baseUrl}${originParam}${destParam}&travelmode=driving`;

            // 4. 更新 UI 內容
            if (displayElement) {
                displayElement.innerHTML = `
                    <div class="d-flex align-items-center justify-content-between w-100 animate__animated animate__fadeIn">
                        <div class="d-flex align-items-center">
                            <div class="route-icon-circle me-3">
                                <i class="bi bi-cursor-fill"></i>
                            </div>
                            <div>
                                <div class="fw-bold text-dark" style="font-size: 0.9rem;">最佳路線建議</div>
                                <div class="text-secondary" style="font-size: 0.8rem;">
                                    預估 ${leg.duration.text} (${leg.distance.text})
                                </div>
                            </div>
                        </div>
                        <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" 
                           class="btn btn-sm shadow-sm rounded-pill px-3 google-map-link-btn"
                           onclick="event.stopPropagation();">
                            <i class="bi bi-geo-alt-fill me-1"></i>查看詳情
                        </a>
                    </div>
                `;

                // 套用薄荷綠動態樣式
                displayElement.classList.add('route-active');
            }
        } else {
            console.error("無法取得路線: " + status);
            if (displayElement) {
                displayElement.innerHTML = `<span class="text-danger small"><i class="bi bi-exclamation-triangle"></i> 無法計算路線</span>`;
            }
        }
    });
}