
import { savePlaceToDatabase, showPlaceByGoogleId } from '../edit-map-manager.js';

export class RecommendationPanel {
    constructor(tripDates) {
        // 不再需要 initModal，因為容器已經在 HTML 裡了
        this.tripDates = tripDates || [];
    }

    updateDays(newDates) {
        this.tripDates = newDates || [];
    }

    // Load 方法：接收容器 ID，直接渲染內容
    load(containerId, geo, type) {
        const listContainer = document.getElementById(containerId);
        if (!listContainer) return;

        // 1. 顯示 Loading 狀態
        listContainer.innerHTML = `
            <div class="text-center py-5 mt-5">
                <div class="spinner-border text-secondary" role="status"></div>
                <p class="mt-3 text-muted small">
                    ${type === 'explore' ? '正在搜尋熱門景點...' : '正在讀取您的收藏...'}
                </p>
            </div>
        `;

        // 2. 準備 API 參數
        // 注意：這裡假設後端 API 路徑不變
        const apiUrl = type === 'explore'
            ? `/api/TripApi/Explore`
            : `/api/TripApi/MyFavorites`;

        const dto = {
            lat: geo ? geo.lat : 0,
            lng: geo ? geo.lng : 0
        };

        // 3. 發送請求
        $.ajax({
            url: apiUrl,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dto),
            success: (data) => {
                // 資料回傳後渲染列表
                this.renderList(listContainer, data.spots);
            },
            error: () => {
                listContainer.innerHTML = `
                    <div class="d-flex flex-column align-items-center justify-content-center h-100 mt-5">
                        <i class="bi bi-exclamation-circle text-danger display-4 mb-3"></i>
                        <div class="text-muted">載入失敗，請稍後再試。</div>
                    </div>`;
            }
        });
    }

    renderList(container, items) {
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center h-100 mt-5">
                    <i class="bi bi-inbox text-muted display-4 mb-3"></i>
                    <div class="text-muted">目前沒有相關資料</div>
                </div>`;
            return;
        }

        // 預先生成日期下拉選單 HTML
        let dropdownItemsHtml = '';
        this.tripDates.forEach((date, idx) => {
            const dayNum = idx + 1;
            const dateShort = new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
            dropdownItemsHtml += `
                <li><button class="dropdown-item js-add-to-day" type="button" data-day="${dayNum}">
                    <span class="badge bg-light text-dark border me-2">Day ${dayNum}</span> ${dateShort}
                </button></li>
            `;
        });

        let html = '<div class="list-group list-group-flush">';

        items.forEach(item => {
            const imgUrl = item.photosSnapshot && item.photosSnapshot[0] ? item.photosSnapshot[0] : '/images/default-placeholder.png';

            // 簡化版卡片樣式 (適應側邊欄)
            html += `
             <div class="list-group-item p-3 d-flex flex-column gap-2 rec-item border-bottom" 
                  data-place-id="${item.externalPlaceId}" data-spot-id="${item.externalPlaceId}">
                   
                   <div class="d-flex gap-3">
                       <div style="width: 240px; height: 160px; flex-shrink: 0;" class="rounded overflow-hidden bg-light">
                           <img src="${imgUrl}" class="w-100 h-100 object-fit-cover" alt="${item.nameZh}">
                       </div>

                       <div class="flex-grow-1 overflow-hidden">
                            <h6 class="mb-1 fw-bold text-dark text-truncate" title="${item.nameZh}">
                                ${item.nameZh}
                            </h6>
                            <div class="small text-warning mb-1">
                                ${item.rating ? `<i class="bi bi-star-fill me-1"></i>${item.rating}` : ''} 
                                <span class="text-muted">(${item.userRatingsTotal || 0})</span>
                            </div>

                            ${item.description ? `
                               <div class="text-secondary small mb-2 text-wrap-2-lines" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
                                   ${item.description}
                               </div>
                               ` : ''}

                            <div class="text-muted small text-truncate" title="${item.address || "無地址"}">
                                <i class="bi bi-geo-alt me-1"></i>${item.address || "無地址"}
                            </div>
                       </div>
                   </div>

                   <div class="dropdown w-100 mt-1">
                        <button class="btn btn-outline-mint btn-sm w-100 rounded-pill" type="button" data-bs-toggle="dropdown" data-bs-display="static" aria-expanded="false">
                            <i class="bi bi-plus-lg me-1"></i>加入行程
                        </button>
                        <ul class="dropdown-menu shadow border-0 w-100 text-center">
                            <li><h6 class="dropdown-header">選擇要加入哪一天?</h6></li>
                            ${dropdownItemsHtml}
                        </ul>
                   </div>
             </div>
            `;
        });

        html += '</div>'; // Close list-group
        container.innerHTML = html;

        // --- 綁定事件 ---

        // 1. 加入行程點擊
        container.querySelectorAll('.js-add-to-day').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡
                const card = e.target.closest('.rec-item');
                const placeId = card.dataset.placeId;
                const spotId = card.dataset.spotId;
                const dayNum = btn.dataset.day;

                // 發送事件給 edit-trip-manager 接收
                this.triggerAddEvent(placeId, spotId, dayNum);
            });
        });

        // 2. 防止 Dropdown 點擊時關閉或觸發地圖
        container.querySelectorAll('.dropdown-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => e.stopPropagation());
        });

        // 3. 點擊卡片本體 -> 顯示地圖預覽
        container.querySelectorAll('.rec-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.dropdown') || e.target.closest('.js-add-to-day')) return;
                if (window.showPlaceByGoogleId) {
                    window.showPlaceByGoogleId(el.dataset.placeId);
                }
            });
        });
    }

    triggerAddEvent(placeId, spotId, dayNum) {
        // 使用 document.body 發送事件，因為現在沒有 modal DOM 了
        const event = new CustomEvent('add-spot-to-trip', {
            detail: { placeId, spotId, dayNum },
            bubbles: true
        });
        document.body.dispatchEvent(event);
    }
}