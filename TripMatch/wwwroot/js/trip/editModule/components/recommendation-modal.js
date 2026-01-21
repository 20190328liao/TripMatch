import { savePlaceToDatabase, showPlaceByGoogleId } from '../edit-map-manager.js';

export class RecommendationModal {
    constructor(tripDates) {
        this.modalId = 'recommendationModal';
        this.tripDates = tripDates || [];
        this.initModal();
    }

    initModal() {
        const html = `
        <div class="modal fade" id="${this.modalId}" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
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

    updateDays(newDates) {
        this.tripDates = newDates || [];
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
            success: (data) => this.renderList(data.spots, type),
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

        // 1. 預先生成日期下拉選單的 HTML (因為每個項目都一樣，先組好字串比較快)
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



        items.forEach(item => {
            console.log("u景點探索項目", item);

            const imgUrl = item.photosSnapshot && item.photosSnapshot[0]
                ? item.photosSnapshot[0]
                : '/images/default-placeholder.png';

            const ratingHtml = item.rating
                ? `<div class="d-flex align-items-center text-warning small mt-1">
                <i class="bi bi-star-fill me-1"></i>
                <span class="fw-bold text-dark">${item.rating}</span>
                <span class="text-muted ms-1" style="font-size: 0.8rem;">(${item.userRatingsTotal || 0} 則評論)</span>
              </div>`
                : '';

            html += `
         <div class="list-group-item list-group-item-action p-3 p-md-4 d-flex gap-4 align-items-start rec-item" 
                data-place-id="${item.externalPlaceId}" data-spot-id="${item.externalPlaceId}"
                style="cursor: pointer; transition: background-color 0.2s;">
               
               <!-- 1. 圖片區塊  -->
               <div style="width: 300px; height: 200px; flex-shrink: 0;" class="shadow-sm rounded overflow-hidden">
                   <img src="${imgUrl}" class="w-100 h-100 object-fit-cover transition-transform" alt="${item.nameZh}">
               </div>
               
               <!-- 2. 內容區塊 -->
               <div class="flex-grow-1 overflow-hidden d-flex flex-column justify-content-center" style="min-height: 110px;">
                   
                   <!-- 標題 -->
                   <h5 class="mb-1 fw-bold text-dark text-truncate" title="${item.nameZh}" style="font-size: 1.1rem;">
                       ${item.nameZh}
                   </h5>
                   
                   <!-- 評分 -->
                   ${ratingHtml}

                   <!-- 地址 -->
                   <div class="text-secondary mt-2 small text-truncate">
                       <i class="bi bi-geo-alt-fill me-1 text-muted"></i>${item.address || "無地址資訊"}
                   </div>

                   <!-- (選用) 類型標籤或其他資訊 -->
                   <!-- <div class="mt-auto pt-2"><span class="badge bg-light text-secondary border">景點</span></div> -->


               </div>

              
               <div class="align-self-center dropdown">
                  <button class="btn btn-outline-primary rounded-pill btn-add-rec px-3 py-2 shadow-sm"
                           type="button"
                           data-bs-toggle="dropdown"
                           aria-expanded="false"
                           title="加入行程">
                       <i class="bi bi-plus-lg me-1"></i>
                       <span class="d-none d-sm-inline small fw-bold">加入</span>
                   </button>

                   <ul class="dropdown-menu dropdown-menu-end shadow border-0" style="z-index: 1060;">
                       <li><h6 class="dropdown-header">選擇日期</h6></li>
                       ${dropdownItemsHtml}
                   </ul>
              </div>
         </div>
       `;
        });
        container.innerHTML = html;

        // 綁定事件
        container.querySelectorAll('.js-add-to-day').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡，避免觸發卡片點擊 (地圖預覽)

                // 找到父層卡片的資料
                const card = e.target.closest('.rec-item');
                const placeId = card.dataset.placeId;
                const spotId = card.dataset.spotId; // 注意：這裡可能需要確認是後端 DB 的 ID 還是 Google Place ID
                const dayNum = btn.dataset.day;

                // 觸發加入事件
                this.triggerAddEvent(placeId, spotId, dayNum);

                // 關閉 Modal (或是顯示一個 Toast 提示加入成功，保持 Modal 開啟更好)
                // this.bsModal.hide(); 
            });
        });

        // 2. 綁定 Dropdown Toggle (防止冒泡觸發卡片預覽)
        container.querySelectorAll('.dropdown-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => e.stopPropagation());
        });

        // 3. 綁定卡片點擊預覽 (保持不變)
        container.querySelectorAll('.rec-item').forEach(el => {
            el.addEventListener('click', (e) => {
                // 如果點到 dropdown 相關元素，不動作
                if (e.target.closest('.dropdown') || e.target.closest('.js-add-to-day')) return;

                if (window.showPlaceByGoogleId) {
                    // 關閉 Modal 以便看地圖? 還是保持開啟? 
                    // 通常會保持開啟，但因為遮住地圖，或許可以先縮小或透明化
                    // 這裡暫時保持原樣
                    window.showPlaceByGoogleId(el.dataset.placeId);
                }
            });
        });
    } 

    triggerAddEvent(placeId, spotId, dayNum) {
        // 發送自定義事件給主程式監聽
        const event = new CustomEvent('add-spot-to-trip', {
            detail: { placeId, spotId, dayNum },
            bubbles: true
        });
        document.getElementById(this.modalId).dispatchEvent(event);
    }
}