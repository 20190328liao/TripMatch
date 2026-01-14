const tripId = document.getElementById('current-trip-id').value;
let currentTripDates = [];

export function initEditPage(mapInstance, dates) {
    // 【修改】將 map 實體暫存到 window 或模組變數，供點擊列表時使用
    window.currentMapInstance = mapInstance;
    currentTripDates = dates || [];
    loadTripData();
}

import { showPlaceByGoogleId } from './edit-map-manager.js';

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
            renderItinerary(items, currentTripDates);
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
function renderItinerary(items, dates) {

    //取得行程列表容器並清空
    const container = document.getElementById('place-list');
    container.innerHTML = '';
    
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
        daySection.className = 'day-block';
        // 加上 data-day 屬性，方便未來實作「拖曳到這一天」的功能
        daySection.setAttribute('data-day', dayNum);

        // Header
        daySection.innerHTML = `
            <div class="day-header">
                <span>Day ${dayNum} <small class="text-secondary fw-normal ms-2">${dateString}</small></span>
                <button class="btn btn-sm text-secondary p-0"><i class="bi bi-three-dots"></i></button>
            </div>
            <div class="timeline-container" style="min-height: 50px;">
                <!-- 行程卡片容器 -->
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

                const displayStart = formatTime(item.startTime);
                const displayEnd = formatTime(item.endTime);
                const spotName = item.profile ? item.profile.name_ZH : "未命名景點";
                const spotAddress = item.profile ? item.profile.address : "無地址資訊";
                const lat = item.profile ? item.profile.lat : null;
                const lng = item.profile ? item.profile.lng : null;
                const googlePlaceId = item.profile ? item.profile.placeId : ""

                const itemHtml = `
                    <div class="itinerary-card itinerary-item" 
                         data-id="${item.id}" 
                         data-spot-id="${item.spotId}"
                         data-lat="${lat}"
                         data-lng="${lng}"
                         data-external-id="${googlePlaceId}">
                        
                        <div class="timeline-dot text-muted small">${index + 1}</div>

                        <div class="d-flex w-100 gap-2">
                            <div class="place-time border-end pe-2">
                                <div class="fw-bold text-primary">${displayStart}</div>
                                <div class="text-muted small">${displayEnd}</div>
                            </div>

                            <div class="place-info ps-1">
                                <div class="place-title text-truncate" title="${spotName}">${spotName}</div>
                                <div class="place-address text-muted small">
                                    <i class="bi bi-geo-alt-fill text-secondary me-1"></i>${spotAddress}
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

    bindItemEvents();
}

// 【修改】新增事件綁定函式
function bindItemEvents() {

    // 點擊行程卡片
    document.querySelectorAll('.itinerary-item').forEach(item => {
        item.addEventListener('click', function (e) {

            // 0. 排除刪除與拖曳按鈕的點擊事件
            if (e.target.closest('.delete-btn') || e.target.closest('.drag-handle')) return;

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
            const itemId = card.getAttribute('data-id');

            if (confirm('確定要移除此景點嗎？')) {
                console.log(`準備刪除行程 ID: ${itemId}`);
                // 這裡加入 $.ajax 刪除邏輯
            }
        });
    });
}

// 工具：移除秒數
function formatTime(timeString) {
    if (!timeString) return "--:--";
    if (timeString.length >= 5) return timeString.substring(0, 5);
    return timeString;
}

export function refreshItineraryList() {
    loadTripData();
}