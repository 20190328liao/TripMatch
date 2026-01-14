const tripId = document.getElementById('current-trip-id').value;

// 【修改】接收 mapInstance
export function initEditPage(mapInstance) {
    // 【修改】將 map 實體暫存到 window 或模組變數，供點擊列表時使用
    window.currentMapInstance = mapInstance;
    loadTripData(tripId);
}

// 載入行程資料
function loadTripData(tripId) {
    const listContainer = $('#place-list');

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
            renderItinerary(items, data.startDate);
        },
        error: function (xhr) {
            console.error("載入失敗", xhr);
            listContainer.html('<div class="text-danger text-center p-4">載入行程失敗，請重新整理。</div>');
        }
    });
}

/**
 * 渲染行程列表
 */
function renderItinerary(items, startDateString) {

    console.log("行程開始日期: "+startDateString);

    const container = document.getElementById('place-list');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="text-center p-5 text-muted">
                <i class="bi bi-map fs-1"></i>
                <p class="mt-3">目前還沒有安排行程<br>請從右側地圖搜尋並加入景點</p>
            </div>
        `;
        return;
    }

    // 1. 資料分組
    const groupedItems = items.reduce((acc, item) => {
        const day = item.dayNumber;
        if (!acc[day]) acc[day] = [];
        acc[day].push(item);
        return acc;
    }, {});

    const days = Object.keys(groupedItems).sort((a, b) => a - b);
    const tripStartDate = startDateString ? new Date(startDateString) : new Date();

    // 3. 迴圈產生 HTML
    days.forEach(dayNum => {
        const dayItems = groupedItems[dayNum];

        // 排序
        dayItems.sort((a, b) => {
            const timeCompare = (a.startTime || "").localeCompare(b.startTime || "");
            if (timeCompare !== 0) return timeCompare;
            return a.sortOrder - b.sortOrder;
        });

        // 日期計算
        const currentDayDate = new Date(tripStartDate);
        currentDayDate.setDate(tripStartDate.getDate() + (parseInt(dayNum) - 1));
        const dateStr = `${currentDayDate.getMonth() + 1}/${currentDayDate.getDate()}`;

        // 【修改】使用 .day-block 結構配合 CSS
        const daySection = document.createElement('div');
        daySection.className = 'day-block';

        // 【修改】Header 結構
        daySection.innerHTML = `
            <div class="day-header">
                <span>Day ${dayNum} <small class="text-secondary fw-normal ms-2">${dateStr}</small></span>
                <button class="btn btn-sm text-secondary p-0"><i class="bi bi-three-dots"></i></button>
            </div>
            <div class="timeline-container">
                <!-- 行程卡片容器 -->
            </div>
        `;

        const itemsContainer = daySection.querySelector('.timeline-container');

        // 【修改】卡片內容渲染
        dayItems.forEach((item, index) => {
            const displayStart = formatTime(item.startTime);
            const displayEnd = formatTime(item.endTime);
            const spotName = item.spot ? item.spot.nameZh : "未命名景點";
            const spotAddress = item.spot ? item.spot.address : "";

            // 【修改】加入 lat, lng 供點擊移動地圖
            const lat = item.spot ? item.spot.lat : null;
            const lng = item.spot ? item.spot.lng : null;

            // 【修改】HTML 結構對應 CSS (.itinerary-card, .timeline-dot)
            const itemHtml = `
                <div class="itinerary-card itinerary-item" 
                     data-id="${item.id}" 
                     data-spot-id="${item.spotId}"
                     data-lat="${lat}"
                     data-lng="${lng}">
                    
                    <!-- 左側時間軸圓點 -->
                    <div class="timeline-dot text-muted small">
                       ${index + 1}
                    </div>

                    <div class="d-flex w-100 gap-2">
                        <!-- 時間欄 -->
                        <div class="place-time border-end pe-2">
                            <div class="fw-bold text-primary">${displayStart}</div>
                            <div class="text-muted small">${displayEnd}</div>
                        </div>

                        <!-- 資訊欄 -->
                        <div class="place-info ps-1">
                            <div class="place-title text-truncate" title="${spotName}">${spotName}</div>
                            <div class="place-address text-muted small">
                                <i class="bi bi-geo-alt-fill text-secondary me-1"></i>${spotAddress}
                            </div>
                        </div>

                        <!-- 操作欄 -->
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

        container.appendChild(daySection);
    });

    // 【修改】綁定互動事件
    bindItemEvents();
}

// 【修改】新增事件綁定函式
function bindItemEvents() {
    // 點擊卡片 -> 移動地圖
    document.querySelectorAll('.itinerary-item').forEach(item => {
        item.addEventListener('click', function (e) {
            // 排除刪除按鈕與拖曳手柄
            if (e.target.closest('.delete-btn') || e.target.closest('.drag-handle')) return;

            const lat = parseFloat(this.getAttribute('data-lat'));
            const lng = parseFloat(this.getAttribute('data-lng'));

            // 使用全域儲存的 map 實體
            if (!isNaN(lat) && !isNaN(lng) && window.currentMapInstance) {
                window.currentMapInstance.panTo({ lat, lng });
                window.currentMapInstance.setZoom(16);
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
    loadTripData(tripId);
}