const tripId = document.getElementById('current-trip-id').value;
let currentTripDates = [];

export function initEditPage(mapInstance, tripSimpleInfo) {
    //將 map 實體暫存到 window 或模組變數，供點擊列表時使用
    window.currentMapInstance = mapInstance;
    currentTripDates = tripSimpleInfo.dateStrings || [];

    initTimeEditModal();
    initHotelEditModal();
    initHeader();
    loadTripData();
}

import { savePlaceToDatabase, showPlaceByGoogleId } from './edit-map-manager.js';


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
function initHeader() {



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
        url: `/api/TripApi/detail/${tripId}`,
        type: 'GET',
        success: function (data) {
            console.log("行程詳細資料:", data);
            const items = data.itineraryItems || [];
            const accommodations = data.accommodations || [];
            renderItinerary(items, currentTripDates, accommodations);
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
function renderItinerary(items, dates, accommodations) {

    //取得行程列表容器並清空
    const container = document.getElementById('place-list');
    container.innerHTML = '';

    //確保景點陣列不為NULL
    items = items || [];

    // ==========================================
    // 【新增】 渲染頂部「住宿資訊」區塊
    // ==========================================
    const hotelSection = document.createElement('div');
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
                    <button class="btn btn-link text-danger p-0 position-absolute top-0 end-0 mt-1 me-2 hotel-delete-btn" data-id="${hotel.id}">
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
        btn.addEventListener('click', function () {
            if (confirm("確定移除此住宿？")) {
                deleteHotel(this.dataset.id);
            }
        });
    });























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
        daySection.setAttribute('data-day', dayNum);

        // Header + Timeline + 【新增】快速新增區塊
        daySection.innerHTML = `
        <div class="day-header">
            <span>Day ${dayNum} <small class="text-secondary fw-normal ms-2">${dateString}</small></span>
            <button class="btn btn-sm text-secondary p-0"><i class="bi bi-three-dots"></i></button>
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

                console.log("行程卡片 HTML:", itemHtml);

                itemsContainer.insertAdjacentHTML('beforeend', itemHtml);
            });
        }

        container.appendChild(daySection);
    });

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

                // 取得資料
                const itemId = timeTrigger.dataset.id;
                // input type="time" 需要格式 HH:mm，如果後端給 HH:mm:ss 要截斷
                const start = (timeTrigger.dataset.start || "").substring(0, 5);
                const end = (timeTrigger.dataset.end || "").substring(0, 5);

                // 填入彈窗
                document.getElementById('edit-item-id').value = itemId;
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
        StartTime: start + ":00", // 補上秒數
        EndTime: end ? (end + ":00") : null
    };

    console.log("更新時間 DTO:", updateDto);

    // 關閉彈窗
    const modalEl = document.getElementById('timeEditModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    modalInstance.hide();

    // 發送 API
    $.ajax({
        url: '/api/TripApi/UpdateSpotTime',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(updateDto),
        success: function (response) {
            // 重新整理列表以顯示新時間
            refreshItineraryList();
        },
        error: function (xhr) {
            console.error(xhr);
            alert('更新時間失敗');
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
            TripId: parseInt(tripId),
            SpotId: parseInt(spotId),
            HotelName: selectedHotelPlace.name, 
            Address: selectedHotelPlace.formatted_address,
            CheckInDate: checkIn,
            CheckOutDate: checkOut,          
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


export function refreshItineraryList() {
    loadTripData();
}