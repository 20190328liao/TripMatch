import { savePlaceToDatabase, showPlaceByGoogleId } from '../edit-map-manager.js';

export class RecommendationModal {
    constructor() {
        this.modalId = 'recommendationModal';
        this.initModal();
    }

    initModal() {
        const html = `
        <div class="modal fade" id="${this.modalId}" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header bg-light py-2">
                        <h6 class="modal-title fw-bold" id="rec-modal-title">
                            <i class="bi bi-compass me-2"></i>探索景點
                        </h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-0">
                        <div id="rec-list-container" class="list-group list-group-flush">
                            <!-- JS 動態填入 -->
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this.bsModal = new bootstrap.Modal(document.getElementById(this.modalId));
    }

    open(geo, type) {

        const titleEl = document.getElementById('rec-modal-title');
        const listContainer = document.getElementById('rec-list-container');

        // 1. 設定標題與 Loading
        if (type === 'explore') {
            titleEl.innerHTML = `<i class="bi bi-compass-fill text-primary me-2"></i>探索熱門景點(目的地附近)`;
        } else {
            titleEl.innerHTML = `<i class="bi bi-heart-fill text-danger me-2"></i>收藏清單(目的地附近)`;
        }

        listContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-secondary" role="status"></div>
                <p class="mt-2 text-muted small">正在搜尋好去處...</p>
            </div>
        `;

        this.bsModal.show();

        // 2. 呼叫 API
        const apiUrl = type === 'explore'
            ? `/api/TripApi/Explore`
            : `/api/TripApi/MyFavorites`;  

        const dto = {
            lat : geo.lat,
            lng : geo.lng
        }

        $.ajax({
            url: apiUrl,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dto),
            success: (data) => this.renderList(data.popularSpots, type),
            error: () => {
                listContainer.innerHTML = `<div class="p-4 text-center text-danger">載入失敗，請稍後再試。</div>`;
            }
        });
    }

    renderList(items, type) {
        const container = document.getElementById('rec-list-container');
        if (!items || items.length === 0) {
            container.innerHTML = `<div class="p-5 text-center text-muted">目前沒有相關景點資料</div>`;
            return;
        }

        console.log("Debug - items content:", items); // 檢查這行印出來的是 [] 還是 {}
        console.log("Debug - items type:", typeof items);



        let html = '';
        items.forEach(item => {

            console.log("我進來了1");




            const imgUrl = item.photoUrl || '/images/default-placeholder.png';
            const ratingHtml = item.rating
                ? `<span class="text-warning small"><i class="bi bi-star-fill"></i> ${item.rating}</span>`
                : '';

            html += `
                <div class="list-group-item list-group-item-action p-3 d-flex gap-3 align-items-center rec-item" 
                     data-place-id="${item.placeId}" data-spot-id="${item.id}">
                    
                    <div style="width: 60px; height: 60px; flex-shrink: 0;">
                        <img src="${imgUrl}" class="w-100 h-100 rounded object-fit-cover" alt="${item.name}">
                    </div>
                    
                    <div class="flex-grow-1 overflow-hidden">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h6 class="mb-0 fw-bold text-truncate" title="${item.name}">${item.name}</h6>
                            ${ratingHtml}
                        </div>
                        <small class="text-muted d-block text-truncate">${item.address || "無地址資訊"}</small>
                    </div>

                    <button class="btn btn-sm btn-outline-primary rounded-pill flex-shrink-0 btn-add-rec">
                        <i class="bi bi-plus-lg"></i>
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;

        // 綁定事件
        container.querySelectorAll('.rec-item').forEach(el => {
            el.addEventListener('click', (e) => {
                // 如果點到按鈕，不觸發地圖預覽
                if (e.target.closest('.btn-add-rec')) {
                    this.handleAddSpot(el.dataset.placeId, el.dataset.spotId);
                    return;
                }
                // 點擊卡片本體 -> 在地圖上預覽 (如果有地圖實體)
                // 這邊可以呼叫 showPlaceByGoogleId
                if (window.showPlaceByGoogleId) {
                    window.showPlaceByGoogleId(el.dataset.placeId, el.dataset.spotId);
                }
            });
        });
    }

    handleAddSpot(placeId, spotId) {
        // 這裡可以呼叫原本的加入行程邏輯
        // 或者簡單一點：關閉彈窗，並觸發地圖上的「加入行程」行為
        alert("功能開發中：請先在地圖預覽後加入行程");
    }
}