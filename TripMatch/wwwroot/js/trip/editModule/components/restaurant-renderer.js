export class RestaurantRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        // 儲存事件 callback
        this.onCardClick = null;
    }

    // 新增：設定點擊事件的方法
    bindEvents(callback) {
        this.onCardClick = callback;
    }

    render(itineraryItems, tripDates) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        let restaurants = (itineraryItems || []).filter(item => item.profile.locationCategoryId === 1);

        restaurants.sort((a, b) => {
            if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
            return (a.startTime || "00:00").localeCompare(b.startTime || "00:00");
        });

        let html = `
            <div class="restaurant-section mb-4 p-3 bg-white rounded shadow-sm border">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="fw-bold m-0 text-success"><i class="bi bi-cup-hot-fill me-2"></i>美食行程總覽</h6>
                    <span class="badge bg-danger bg-opacity-10 text-danger rounded-pill border border-danger border-opacity-25">${restaurants.length} 間</span>
                </div>
                <div class="restaurant-list-container d-flex flex-column gap-2">
        `;

        if (restaurants.length === 0) {
            html += `<div class="text-center py-4 text-muted small bg-light rounded border border-dashed">尚未安排任何餐廳行程</div>`;
        } else {
            restaurants.forEach(item => {
                const dateStr = tripDates[item.dayNumber - 1] || `Day ${item.dayNumber}`;
                const dateDisplay = new Date(dateStr).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
                const displayStart = this.formatTime(item.startTime);

                const spotName = item.profile ? item.profile.name_ZH : item.locationName;
                const spotAddress = item.profile ? item.profile.address : item.address;
                const photoUrl = (item.profile && item.profile.photoUrl) ? item.profile.photoUrl : '/images/default-food.jpg';

                // 【關鍵修改】取得座標與 Place ID
                const lat = item.profile ? item.profile.lat : null;
                const lng = item.profile ? item.profile.lng : null;
                const googlePlaceId = item.profile ? item.profile.placeId : "";
                const spotId = item.spotId;

                // 【關鍵修改】在 div 加入 data- 屬性 與 cursor-pointer class
                html += `
                <div class="restaurant-item p-2 border rounded bg-white position-relative hover-shadow transition-all" 
                     style="cursor: pointer;"
                     data-lat="${lat}" 
                     data-lng="${lng}" 
                     data-external-id="${googlePlaceId}"
                     data-spot-id="${spotId}">
                     
                    <div class="d-flex gap-3 align-items-center">
                        <div class="d-flex flex-column align-items-center justify-content-center px-2 border-end text-danger" style="min-width: 60px;">
                            <span class="fw-bold fs-5 lh-1">${dateDisplay}</span>
                            <small class="text-muted" style="font-size: 0.75rem;">${displayStart}</small>
                        </div>
                        <div class="place-img" style="width: 60px; height: 60px; min-width: 60px;">
                             <img src="${photoUrl}" class="rounded w-100 h-100 object-fit-cover" alt="${spotName}">
                        </div>
                        <div class="place-info flex-grow-1 overflow-hidden">
                            <div class="fw-bold text-dark text-truncate mb-1" title="${spotName}">${spotName}</div>
                            <div class="text-muted small text-truncate"><i class="bi bi-geo-alt-fill me-1 text-secondary"></i>${spotAddress || "無地址"}</div>
                        </div>
                        <div class="text-secondary"><i class="bi bi-chevron-right"></i></div>
                    </div>
                </div>`;
            });
        }

        html += `</div></div>`;
        container.innerHTML = html;

        // 【關鍵修改】渲染完畢後，綁定 DOM 事件
        this.addClickEvents(container);
    }

    addClickEvents(container) {
        const items = container.querySelectorAll('.restaurant-item');
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                // 如果有點到連結或其他按鈕，不觸發地圖移動
                if (e.target.closest('a') || e.target.closest('button')) return;

                const data = {
                    lat: item.dataset.lat,
                    lng: item.dataset.lng,
                    googlePlaceId: item.dataset.externalId,
                    spotId: item.dataset.spotId
                };

                // 呼叫外部傳進來的 callback
                if (this.onCardClick) {
                    this.onCardClick(data);
                }
            });
        });
    }

    formatTime(timeString) {
        if (!timeString) return "--:--";
        if (timeString.length >= 5) return timeString.substring(0, 5);
        return timeString;
    }
}