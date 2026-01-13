document.addEventListener('DOMContentLoaded', () => {
    const wishlistContainer = document.getElementById('wishlist_cards');
    const apiGet = window.Routes?.MemberCenterApi?.GetWish ?? '/api/MemberCenterApi/GetWish';
    const apiToggle = window.Routes?.MemberCenterApi?.Toggle ?? '/api/MemberCenterApi/Toggle';
    // undoTimers 以 spotId (number) 為鍵，值為 { timerId, toastEl, removeBtn }
    const undoTimers = {};

    if (!wishlistContainer) return;

    // 初始載入
    loadWishlist();

    async function loadWishlist() {
        try {
            const res = await fetch(apiGet, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) {
                console.warn('GetWishlist 讀取失敗', res.status);
                renderEmpty();
                return;
            }
            const data = await res.json();
            const items = (data && data.items) ? data.items : data;
            render(items);
        } catch (ex) {
            console.error('載入願望清單失敗', ex);
            renderEmpty();
        }
    }

    function render(items) {
        if (!items || items.length === 0) {
            renderEmpty();
            return;
        }
        // 修正後的 render 內部片段
        wishlistContainer.innerHTML = items.map(item => {
            // 自動相容 SpotId 或 spotId
            const currentSpotId = item.spotId || item.SpotId;
            const currentSpotTitle = item.spotTitle || item.Name_ZH || item.name_ZH || '未知地點';
            const currentImageUrl = item.imageUrl || (item.PhotosSnapshot ? JSON.parse(item.PhotosSnapshot)[0] : '/img/placeholder.jpg');

            return `
        <div class="col" data-spot-col="${currentSpotId}">
            <div class="card h-100 shadow-sm border-0 position-relative wishlist-item">
                <button type="button"
                        class="btn_remove_wish active"
                        data-spotid="${currentSpotId}"
                        title="從清單移除">
                    <i class="bi bi-trash-fill"></i>
                </button>
                <a href="/Spot/Detail?id=${currentSpotId}">
                    <img src="${escapeHtml(currentImageUrl)}" class="card-img-top" style="height: 180px; object-fit: cover;">
                </a>
                <div class="card-body">
                    <h6 class="card-title text-truncate fw-bold">${escapeHtml(currentSpotTitle)}</h6>
                </div>
                <div class="card-footer bg-transparent border-0 pb-3">
                    <button class="btn btn-primary w-100 btn-view-more" data-id="${currentSpotId}">
                        View More
                    </button>
                </div>
            </div>
        </div>`;
        }).join('');
    }

    function renderEmpty() {
        wishlistContainer.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">目前沒有願望清單</p></div>';
    }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, function (m) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
        });
    }

    // 事件代理（包含 View More 與 移除/取消收藏）
    wishlistContainer.addEventListener('click', async (e) => {
        const viewMoreBtn = e.target.closest('.btn-view-more');
        if (viewMoreBtn) {
            const spotId = viewMoreBtn.getAttribute('data-id');
            if (spotId) {
                window.location.href = `/Spot/Detail?id=${spotId}`;
            }
            return;
        }

        const removeBtn = e.target.closest('.btn_remove_wish');
        if (!removeBtn) return;

        e.preventDefault();
        const spotIdRaw = removeBtn.getAttribute('data-spotid')
            || removeBtn.dataset?.spotid
            || removeBtn.dataset?.spotId
            || removeBtn.closest('[data-spot-col]')?.getAttribute('data-spot-col');

        // 新增除錯：印出各來源，確認為何會得到 "undefined"
        console.log('wishlist debug - spotIdRaw:', spotIdRaw, {
            attr_data_spotid: removeBtn.getAttribute('data-spotid'),
            dataset_spotid: removeBtn.dataset?.spotid,
            dataset_spotId: removeBtn.dataset?.spotId,
            closest_data_spot_col: removeBtn.closest('[data-spot-col]')?.getAttribute('data-spot-col'),
            outerHTML: removeBtn.outerHTML
        });

        // 過濾掉字串 'undefined' 與空值，並解析為數字
        if (!spotIdRaw || spotIdRaw === 'undefined') {
            console.error('Invalid spotId:', spotIdRaw, removeBtn);
            return;
        }

        const spotIdNum = Number(spotIdRaw);
        if (!Number.isFinite(spotIdNum)) {
            console.error('Invalid numeric spotId:', spotIdRaw);
            return;
        }

        const cardCol = removeBtn.closest('.col');
        if (!cardCol) return;

        // 樣式：標記為 pending
        cardCol.classList.add('pending-remove');
        cardCol.style.transition = 'all 0.35s ease';
        cardCol.style.opacity = '0.5';
        cardCol.style.pointerEvents = 'none';
        removeBtn.setAttribute('disabled', 'true');

        // 建立 undo toast 並綁定 undo 行為
        const toastEl = showUndoToast(spotIdNum, () => {
            // undo
            if (undoTimers[spotIdNum]) {
                clearTimeout(undoTimers[spotIdNum].timerId);
                cleanupAfterUndo(spotIdNum, true);
            }
        });

        // 延遲真正呼叫 API（允許 undo）
        const timerId = setTimeout(async () => {
            try {
                const response = await fetch(apiToggle, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ spotId: spotIdNum })
                });

                if (response.ok) {
                    // 成功：移除卡片與 toast
                    cardCol.remove();
                    if (toastEl && toastEl.parentNode) toastEl.remove();
                    delete undoTimers[spotIdNum];
                    checkEmpty();
                } else {
                    // 失敗：還原 UI，並嘗試顯示錯誤訊息
                    let msg = `操作失敗：${response.status}`;
                    try {
                        const json = await response.json();
                        if (json?.message) msg = json.message;
                    } catch {
                        try {
                            const txt = await response.text();
                            if (txt) msg = txt;
                        } catch { }
                    }
                    console.error(msg);
                    cleanupAfterUndo(spotIdNum, false);
                }
            } catch (error) {
                console.error('API Error:', error);
                cleanupAfterUndo(spotIdNum, false);
            } finally {
                if (undoTimers[spotIdNum]) delete undoTimers[spotIdNum];
            }
        }, 5000);

        // 存下 timer 與元素參考，供 undo 使用
        undoTimers[spotIdNum] = { timerId, toastEl, removeBtn, cardCol };
    });

    function cleanupAfterUndo(spotId, restored) {
        const entry = undoTimers[spotId];
        if (!entry) return;
        // 還原卡片視覺與按鈕
        try {
            const { cardCol, removeBtn, toastEl } = entry;
            if (cardCol) {
                cardCol.classList.remove('pending-remove');
                cardCol.style.opacity = '1';
                cardCol.style.pointerEvents = 'auto';
            }
            if (removeBtn) {
                removeBtn.removeAttribute('disabled');
            }
            if (toastEl && toastEl.parentNode) {
                toastEl.remove();
            }
        } catch (e) {
            console.warn('cleanupAfterUndo error', e);
        } finally {
            if (undoTimers[spotId]) {
                clearTimeout(undoTimers[spotId].timerId);
                delete undoTimers[spotId];
            }
            if (restored) checkEmpty(); // 若還原可能需要檢查空列表（保險）
        }
    }

    function checkEmpty() {
        if (!wishlistContainer) return;
        if (wishlistContainer.querySelectorAll('.col').length === 0) {
            wishlistContainer.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">目前沒有願望清單</p></div>';
        }
    }

    function showUndoToast(spotId, onUndo) {
        // 移除舊 toast（保險）
        const existing = document.getElementById('undo_toast_' + spotId);
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'undo_toast_' + spotId;
        toast.className = 'undo-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.zIndex = '2000';
        toast.style.padding = '8px 12px';
        toast.style.background = 'rgba(0,0,0,0.85)';
        toast.style.color = '#fff';
        toast.style.borderRadius = '6px';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '8px';
        toast.innerHTML = `
            <span>已排程移除</span>
            <button class="btn btn-sm btn-warning" id="undo_btn_${spotId}" type="button">還原</button>
        `;
        document.body.appendChild(toast);

        const undoBtn = document.getElementById(`undo_btn_${spotId}`);
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                try { onUndo(); } catch (e) { console.error(e); }
            });
        }

        // 自動關閉 toast（但不會取消定時器；只是清 UI）
        setTimeout(() => {
            const t = document.getElementById('undo_toast_' + spotId);
            if (t) t.remove();
        }, 5000 + 200); // 與刪除定時器略為同步

        return toast;
    }
});