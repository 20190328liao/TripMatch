document.addEventListener('DOMContentLoaded', () => {
    const wishlistContainer = document.getElementById('wishlist_cards');
    const apiGet = window.Routes?.MemberCenterApi?.GetWish ?? '/api/MemberCenterApi/GetWish';
    const apiToggle = window.Routes?.MemberCenterApi?.Toggle ?? '/api/MemberCenterApi/Toggle';
    const apiGetPhoto = window.Routes?.AuthApi?.GetSpotPhoto ?? '/api/auth/GetSpotPhoto';
    const apiGetExternalPlace = window.Routes?.AuthApi?.GetExternalPlaceId ?? '/api/auth/GetExternalPlaceId';
    const undoTimers = {};
    if (!wishlistContainer) return;

    loadWishlist();

    async function loadWishlist() {
        try {
            const res = await fetch(apiGet, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) { renderEmpty(); return; }
            const data = await res.json();
            const items = (data && data.items) ? data.items : data;
            render(items);
        } catch (ex) {
            console.error('載入願望清單失敗', ex);
            renderEmpty();
        }
    }

    // 替換或更新 render 與補抓邏輯（確保使用本地 placeholder、並使用後端 proxy）
    function safeParsePhotos(snapshot) {
        if (!snapshot) return null;
        try {
            return JSON.parse(snapshot);
        } catch {
            return null;
        }
    }

    function render(items) {
        if (!items || items.length === 0) { renderEmpty(); return; }

        wishlistContainer.innerHTML = items.map(item => {
            const currentSpotId = item.spotId ?? item.SpotId ?? '';
            const currentSpotTitle = item.name_ZH ?? item.Name_ZH ?? item.spotTitle ?? item.spot?.nameZh ?? '未知地點';
            const extId = item.externalPlaceId || item.ExternalPlaceId || item.googlePlaceId || '';
            // 1. 圖片解析邏輯（更健壯）
            const snapshot = item.PhotosSnapshot || item.photosSnapshot || item.spot?.photosSnapshot;
            const parsedPhoto = safeParsePhotos(snapshot); // 可能回傳 string 或 null

            let currentImageUrl = '/img/placeholder.png';
            let needsGoogleFetch = false;

            if (item.imageUrl) {
                // 後端已回傳完整圖片 URL
                currentImageUrl = item.imageUrl;
            } else if (parsedPhoto) {
                // parsedPhoto 可能是完整 url、photo_reference、或 shorthand( e.g. "400x300?text=..." )
                if (typeof parsedPhoto === 'string') {
                    const s = parsedPhoto.trim();
                    if (s.toLowerCase().startsWith('http://') || s.toLowerCase().startsWith('https://')) {
                        currentImageUrl = s;
                    } else if (/^\d+x\d+\?text=/.test(s)) {
                        // shorthand，例如 "400x300?text=No+Image+Available" -> 補上 domain
                        currentImageUrl = `https://via.placeholder.com/${s}`;
                    } else {
                        // 很大機率是 Google photo_reference（非完整 URL）
                        needsGoogleFetch = true;
                        currentImageUrl = '/img/placeholder.png';
                    }
                } else {
                    currentImageUrl = '/img/placeholder.png';
                }
            } else if (extId) {
                // 沒本地快照但有 externalPlaceId -> 需要去 Google 補圖
                needsGoogleFetch = true;
                currentImageUrl = '/img/placeholder.png';
            }

            return `
<div class="col" data-spot-col="${currentSpotId}">
    <div class="card w-100 h-100 shadow-sm border-0 position-relative wishlist-item">
        <button type="button"
                class="btn_remove_wish active"
                data-spotid="${currentSpotId}"
                title="從清單移除"
                style="position: absolute; top: 10px; right: 10px; z-index: 10; border: none; background: rgba(255,255,255,0.8); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #dc3545; transition: all 0.2s;">
            <i class="bi bi-trash-fill"></i>
        </button>
        
        <a href="javascript:void(0)" class="d-block btn-view-more" data-spot-id="${currentSpotId}" data-place-id="${extId}">
            <img src="${currentImageUrl}" class="card-img-top wishlist-img" alt="${escapeHtml(currentSpotTitle)}"
                 data-spot-id="${currentSpotId}"
                 data-place-id="${extId}"
                 data-needs-fetch="${needsGoogleFetch}"
                 style="height: 250px; object-fit: cover; border-top-left-radius: 8px; border-top-right-radius: 8px;">
        </a>

        <div class="card-body">
            <h6 class="card-title text-truncate fw-bold mb-1">${escapeHtml(currentSpotTitle)}</h6>
        </div>
      
        <div class="card-footer bg-transparent border-0 pb-3">
                    <a href="/Spot?placeId=${encodeURIComponent(extId)}" class="d-block btn-view-more" data-spot-id="${currentSpotId}" data-place-id="${extId}">
                        View More
                    </a>
                </div>
        </div>
    </div>
</div>`;
        }).join('');

        attachImageFallbacks();
        fetchMissingPhotos(); // 渲染後立即啟動補圖
    }

    /**
     * 向後端 API 請求補齊圖片（強化版）
     * 流程：
     * 1) 若 img 有 data-place-id，直接呼叫後端 `/api/auth/GetSpotPhoto?placeId=...&spotId=...`
     * 2) 若沒有 placeId，嘗試用 spotId 反查 `/api/auth/GetExternalPlaceId/{spotId}`
     * 3) 若後端失敗且頁面載入了 Google Maps JS，改由 client-side PlacesService.getDetails 取得 photos[0].getUrl(...)
     */
    async function fetchMissingPhotos() {
        const images = document.querySelectorAll('img[data-place-id]');
        for (let img of images) {
            // 如果目前顯示的是預設圖，才去補撈
            if (img.src && (img.src.endsWith('/img/placeholder.png') || img.src.includes('placeholder'))) {
                const spotId = img.getAttribute('data-spot-id');
                let placeId = img.getAttribute('data-place-id');

                try {
                    // 1) 若沒有 placeId，先嘗試從後端反查
                    if ((!placeId || placeId === 'null') && spotId) {
                        try {
                            const resExt = await fetch(`${apiGetExternalPlace}/${encodeURIComponent(spotId)}`, {
                                credentials: 'include'
                            });
                            if (resExt.ok) {
                                const json = await resExt.json().catch(() => ({}));
                                placeId = json.externalPlaceId || placeId;
                                if (placeId) {
                                    img.setAttribute('data-place-id', placeId);
                                    // 更新 圖片外層的 a.href 及 card 的 data-place-id
                                    const card = img.closest('.col');
                                    if (card) {
                                        const aLinks = card.querySelectorAll('a.btn-view-more, a.btn_view_more');
                                        aLinks.forEach(a => a.setAttribute('href', `/Spot?placeId=${encodeURIComponent(placeId)}`));
                                        const cardWrapper = card.querySelector('.wishlist-item') || card;
                                        cardWrapper && cardWrapper.setAttribute('data-place-id', placeId);
                                    }
                                }
                            }
                        } catch { /* ignore */ }
                    }

                    // 2) 有 placeId 時呼叫後端 proxy 取得 imageUrl（後端會嘗試寫回 DB）
                    if (placeId && placeId !== 'null') {
                        try {
                            const photoRes = await fetch(`/api/auth/GetSpotPhoto?placeId=${encodeURIComponent(placeId)}&spotId=${encodeURIComponent(spotId || '')}`, { credentials: 'include' });
                            if (photoRes.ok) {
                                const j = await photoRes.json().catch(() => ({}));
                                if (j.imageUrl) {
                                    img.src = j.imageUrl;
                                    continue;
                                }
                            }
                        } catch (ex) {
                            console.warn('fetchMissingPhotos GetSpotPhoto error', ex);
                        }

                        // 3) 嘗試用 client-side Google Places（若存在 window.viewSpotPhotoSyncFetch）
                        if (window.viewSpotPhotoSyncFetch && typeof window.viewSpotPhotoSyncFetch === 'function') {
                            try {
                                const url = await window.viewSpotPhotoSyncFetch(placeId);
                                if (url) {
                                    img.src = url;
                                    continue;
                                }
                            } catch (e) { /* ignore */ }
                        }
                    }
                } catch (err) {
                    console.error("補撈圖片失敗:", err);
                }
            }
        }
    }

    // 事件代理 (View More & 移除)
    wishlistContainer.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.btn_remove_wish');
        if (removeBtn) {
            const spotIdRaw = removeBtn.getAttribute('data-spotid');
            const spotIdNum = Number(spotIdRaw);
            if (Number.isFinite(spotIdNum)) handleRemoveWithUndo(spotIdNum, removeBtn);
            return;
        }

        const viewMoreBtn = e.target.closest('.btn-view-more, .btn_view_more, .card .wishlist-img, .card .wishlist-link');
        if (viewMoreBtn) {
            e.preventDefault();

            // 取得 spotId 與 placeId（可能為 empty/null）
            const spotId = viewMoreBtn.getAttribute && viewMoreBtn.getAttribute('data-spot-id') || viewMoreBtn.dataset && viewMoreBtn.dataset.spotId || null;
            let placeId = viewMoreBtn.getAttribute && viewMoreBtn.getAttribute('data-place-id') || viewMoreBtn.dataset && viewMoreBtn.dataset.placeId || null;

            // 嘗試補齊 placeId（若不存在）
            if ((!placeId || placeId === 'null') && spotId) {
                try {
                    const res = await fetch(`/api/auth/GetExternalPlaceId/${encodeURIComponent(spotId)}`, { credentials: 'include' });
                    if (res.ok) {
                        const json = await res.json().catch(() => ({}));
                        placeId = json.externalPlaceId || placeId;
                    }
                } catch (err) {
                    console.warn('GetExternalPlaceId failed', err);
                }
            }

            // 使用者點擊時，優先嘗試補抓圖片並寫回 DB（非同步但在導頁前嘗試）
            if (placeId) {
                try {
                    // 先用後端 proxy 取得 imageUrl，並更新畫面
                    try {
                        const photoRes = await fetch(`/api/auth/GetSpotPhoto?placeId=${encodeURIComponent(placeId)}&spotId=${encodeURIComponent(spotId || '')}`, { credentials: 'include' });
                        if (photoRes.ok) {
                            const j = await photoRes.json().catch(() => ({}));
                            if (j.imageUrl) {
                                // 更新該 card 的 img（若存在）
                                const imgEl = viewMoreBtn.querySelector && viewMoreBtn.querySelector('img.wishlist-img') || document.querySelector(`img[data-spot-id="${spotId}"]`);
                                if (imgEl) imgEl.src = j.imageUrl;
                            }
                        }
                    } catch (innerEx) { console.warn('GetSpotPhoto inner error', innerEx); }

                    // 嘗試呼叫全域 helper 儲存（若存在）
                    if (typeof window.trySyncWishlistPhoto === 'function') {
                        try {
                            const syncResult = await window.trySyncWishlistPhoto(Number(spotId || 0), placeId);
                            if (typeof syncResult === 'string' && syncResult) {
                                // 若返回 imageUrl，更新 UI
                                const imgEl = viewMoreBtn.querySelector && viewMoreBtn.querySelector('img.wishlist-img') || document.querySelector(`img[data-spot-id="${spotId}"]`);
                                if (imgEl) imgEl.src = syncResult;
                            }
                        } catch (syncErr) {
                            console.warn('trySyncWishlistPhoto failed', syncErr);
                        }
                    }
                } catch (e) {
                    console.warn('attempt photo sync failed', e);
                }
            }

            // 最後打開 panel 或導向 Spot（確保 placeId 已補齊時帶入）
            // wishlist.js 中的點擊事件最後
            if (typeof window.openSpotPanel === 'function') {
                window.openSpotPanel(spotId, placeId);
            } else {
                // 這裡是最安全的跳轉法
                let url = '/Spot';
                if (placeId && placeId !== 'null' && placeId.trim() !== '') {
                    url += `?placeId=${encodeURIComponent(placeId)}`;
                } else if (spotId) {
                    // 如果沒有 placeId 但有內部 ID，也可以考慮導向詳情頁
                    url = `/Spot/Detail?id=${spotId}`;
                }
                window.location.href = url;
            }
        }
    });

    function attachImageFallbacks() {
        wishlistContainer.querySelectorAll('img.card-img-top').forEach(img => {
            if (img.__wishlist_onerror_attached) return;
            img.__wishlist_onerror_attached = true;
            img.onerror = () => {
                img.onerror = null;
                img.src = '/img/placeholder.png';
            };
        });
    }

    // --- Undo 邏輯保持不變 ---
    async function handleRemoveWithUndo(spotIdNum, removeBtn) {
        if (undoTimers[spotIdNum]) return;
        const cardCol = removeBtn.closest('.col');
        if (!cardCol) return;

        cardCol.style.transition = 'opacity 0.3s ease';
        cardCol.style.opacity = '0.3';
        cardCol.style.pointerEvents = 'none';
        removeBtn.setAttribute('disabled', 'true');

        const toastEl = showUndoToast(spotIdNum, () => {
            if (undoTimers[spotIdNum]) {
                clearTimeout(undoTimers[spotIdNum].timerId);
                cleanupAfterUndo(spotIdNum, true);
            }
        });

        const timerId = setTimeout(async () => {
            try {
                const response = await fetch(apiToggle, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ spotId: spotIdNum })
                });
                if (response.ok) {
                    cardCol.remove();
                    if (toastEl && toastEl.parentNode) toastEl.remove();
                    delete undoTimers[spotIdNum];
                    checkEmpty();
                } else { cleanupAfterUndo(spotIdNum, false); }
            } catch (error) { cleanupAfterUndo(spotIdNum, false); }
        }, 3000);

        undoTimers[spotIdNum] = { timerId, toastEl, removeBtn, cardCol };
    }

    function cleanupAfterUndo(spotId, restored) {
        const entry = undoTimers[spotId];
        if (!entry) return;
        const { cardCol, removeBtn, toastEl } = entry;
        if (cardCol) { cardCol.style.opacity = '1'; cardCol.style.pointerEvents = 'auto'; }
        if (removeBtn) removeBtn.removeAttribute('disabled');
        if (toastEl) toastEl.remove();
        delete undoTimers[spotId];
        if (restored) checkEmpty();
    }

    function showUndoToast(spotId, onUndo) {
        const existing = document.getElementById('undo_toast_' + spotId);
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'undo_toast_' + spotId;
        toast.style = "position:fixed; bottom:20px; right:20px; z-index:2000; padding:10px 16px; background:#27354A; color:#fff; border-radius:8px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 12px rgba(0,0,0,0.15);";
        toast.innerHTML = `<span style="font-size:14px;">已從清單移除</span><button class="btn btn-sm btn-light" id="undo_btn_${spotId}" style="font-weight:bold;">還原</button>`;
        document.body.appendChild(toast);
        document.getElementById(`undo_btn_${spotId}`).onclick = onUndo;
        setTimeout(() => {
            const t = document.getElementById('undo_toast_' + spotId);
            if (t) {
                t.style.transition = 'opacity 0.5s';
                t.style.opacity = '0';
                setTimeout(() => t.remove(), 500);
            }
        }, 3000);
        return toast;
    }

    function checkEmpty() { if (wishlistContainer.querySelectorAll('.col').length === 0) renderEmpty(); }
    function renderEmpty() { wishlistContainer.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">目前沒有願望清單</p></div>'; }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }
});
document.addEventListener('DOMContentLoaded', () => {
    const wishlistContainer = document.getElementById('wishlist_cards');
    const apiGet = window.Routes?.MemberCenterApi?.GetWish ?? '/api/MemberCenterApi/GetWish';
    const apiToggle = window.Routes?.MemberCenterApi?.Toggle ?? '/api/MemberCenterApi/Toggle';
    const apiGetPhoto = window.Routes?.AuthApi?.GetSpotPhoto ?? '/api/auth/GetSpotPhoto';
    const apiGetExternalPlace = window.Routes?.AuthApi?.GetExternalPlaceId ?? '/api/auth/GetExternalPlaceId';
    const undoTimers = {};
    if (!wishlistContainer) return;

    loadWishlist();

    async function loadWishlist() {
        try {
            const res = await fetch(apiGet, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) { renderEmpty(); return; }
            const data = await res.json();
            const items = (data && data.items) ? data.items : data;
            render(items);
        } catch (ex) {
            console.error('載入願望清單失敗', ex);
            renderEmpty();
        }
    }

    // 替換或更新 render 與補抓邏輯（確保使用本地 placeholder、並使用後端 proxy）
    function safeParsePhotos(snapshot) {
        if (!snapshot) return null;
        try {
            return JSON.parse(snapshot);
        } catch {
            return null;
        }
    }

    function render(items) {
        if (!items || items.length === 0) { renderEmpty(); return; }

        wishlistContainer.innerHTML = items.map(item => {
            const currentSpotId = item.spotId ?? item.SpotId ?? '';
            const currentSpotTitle = item.name_ZH ?? item.Name_ZH ?? item.spotTitle ?? item.spot?.nameZh ?? '未知地點';
            const extId = item.externalPlaceId || item.ExternalPlaceId || item.googlePlaceId || '';
            // 1. 圖片解析邏輯（更健壯）
            const snapshot = item.PhotosSnapshot || item.photosSnapshot || item.spot?.photosSnapshot;
            const parsedPhoto = safeParsePhotos(snapshot); // 可能回傳 string 或 null

            let currentImageUrl = '/img/placeholder.png';
            let needsGoogleFetch = false;

            if (item.imageUrl) {
                // 後端已回傳完整圖片 URL
                currentImageUrl = item.imageUrl;
            } else if (parsedPhoto) {
                // parsedPhoto 可能是完整 url、photo_reference、或 shorthand( e.g. "400x300?text=..." )
                if (typeof parsedPhoto === 'string') {
                    const s = parsedPhoto.trim();
                    if (s.toLowerCase().startsWith('http://') || s.toLowerCase().startsWith('https://')) {
                        currentImageUrl = s;
                    } else if (/^\d+x\d+\?text=/.test(s)) {
                        // shorthand，例如 "400x300?text=No+Image+Available" -> 補上 domain
                        currentImageUrl = `https://via.placeholder.com/${s}`;
                    } else {
                        // 很大機率是 Google photo_reference（非完整 URL）
                        needsGoogleFetch = true;
                        currentImageUrl = '/img/placeholder.png';
                    }
                } else {
                    currentImageUrl = '/img/placeholder.png';
                }
            } else if (extId) {
                // 沒本地快照但有 externalPlaceId -> 需要去 Google 補圖
                needsGoogleFetch = true;
                currentImageUrl = '/img/placeholder.png';
            }

            return `
<div class="col" data-spot-col="${currentSpotId}">
    <div class="card w-100 h-100 shadow-sm border-0 position-relative wishlist-item">
        <button type="button"
                class="btn_remove_wish active"
                data-spotid="${currentSpotId}"
                title="從清單移除"
                style="position: absolute; top: 10px; right: 10px; z-index: 10; border: none; background: rgba(255,255,255,0.8); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #dc3545; transition: all 0.2s;">
            <i class="bi bi-trash-fill"></i>
        </button>
        
        <a href="javascript:void(0)" class="d-block btn-view-more" data-spot-id="${currentSpotId}" data-place-id="${extId}">
            <img src="${currentImageUrl}" class="card-img-top wishlist-img" alt="${escapeHtml(currentSpotTitle)}"
                 data-spot-id="${currentSpotId}"
                 data-place-id="${extId}"
                 data-needs-fetch="${needsGoogleFetch}"
                 style="height: 250px; object-fit: cover; border-top-left-radius: 8px; border-top-right-radius: 8px;">
        </a>

        <div class="card-body">
            <h6 class="card-title text-truncate fw-bold mb-1">${escapeHtml(currentSpotTitle)}</h6>
        </div>
      
        <div class="card-footer bg-transparent border-0 pb-3">
                    <a href="/Spot?placeId=${extId}" class="btn_view_more btn_member_detail w-100" style="text-decoration:none; display:inline-block; text-align:center;">
                        View More
                    </a>
                </div>
        </div>
    </div>
</div>`;
        }).join('');

        attachImageFallbacks();
        fetchMissingPhotos(); // 渲染後立即啟動補圖
    }

    /**
     * 向後端 API 請求補齊圖片（強化版）
     * 流程：
     * 1) 若 img 有 data-place-id，直接呼叫後端 `/api/auth/GetSpotPhoto?placeId=...&spotId=...`
     * 2) 若沒有 placeId，嘗試用 spotId 反查 `/api/auth/GetExternalPlaceId/{spotId}`
     * 3) 若後端失敗且頁面載入了 Google Maps JS，改由 client-side PlacesService.getDetails 取得 photos[0].getUrl(...)
     */
    async function fetchMissingPhotos() {
        const images = document.querySelectorAll('img[data-place-id]');
        for (let img of images) {
            // 如果目前顯示的是預設圖，才去補撈
            if (img.src && (img.src.endsWith('/img/placeholder.png') || img.src.includes('placeholder'))) {
                const spotId = img.getAttribute('data-spot-id');
                let placeId = img.getAttribute('data-place-id');

                try {
                    // 1) 若沒有 placeId，先嘗試從後端反查
                    if ((!placeId || placeId === 'null') && spotId) {
                        try {
                            const resExt = await fetch(`${apiGetExternalPlace}/${encodeURIComponent(spotId)}`, {
                                credentials: 'include'
                            });
                            if (resExt.ok) {
                                const json = await resExt.json().catch(() => ({}));
                                placeId = json.externalPlaceId || placeId;
                                if (placeId) {
                                    img.setAttribute('data-place-id', placeId);
                                    // 更新 圖片外層的 a.href 及 card 的 data-place-id
                                    const card = img.closest('.col');
                                    if (card) {
                                        const aLinks = card.querySelectorAll('a.btn-view-more, a.btn_view_more');
                                        aLinks.forEach(a => a.setAttribute('href', `/Spot?placeId=${encodeURIComponent(placeId)}`));
                                        const cardWrapper = card.querySelector('.wishlist-item') || card;
                                        cardWrapper && cardWrapper.setAttribute('data-place-id', placeId);
                                    }
                                }
                            }
                        } catch { /* ignore */ }
                    }

                    // 2) 有 placeId 時呼叫後端 proxy 取得 imageUrl（後端會嘗試寫回 DB）
                    if (placeId && placeId !== 'null') {
                        try {
                            const photoRes = await fetch(`/api/auth/GetSpotPhoto?placeId=${encodeURIComponent(placeId)}&spotId=${encodeURIComponent(spotId || '')}`, { credentials: 'include' });
                            if (photoRes.ok) {
                                const j = await photoRes.json().catch(() => ({}));
                                if (j.imageUrl) {
                                    img.src = j.imageUrl;
                                    continue;
                                }
                            }
                        } catch (ex) {
                            console.warn('fetchMissingPhotos GetSpotPhoto error', ex);
                        }

                        // 3) 嘗試用 client-side Google Places（若存在 window.viewSpotPhotoSyncFetch）
                        if (window.viewSpotPhotoSyncFetch && typeof window.viewSpotPhotoSyncFetch === 'function') {
                            try {
                                const url = await window.viewSpotPhotoSyncFetch(placeId);
                                if (url) {
                                    img.src = url;
                                    continue;
                                }
                            } catch (e) { /* ignore */ }
                        }
                    }
                } catch (err) {
                    console.error("補撈圖片失敗:", err);
                }
            }
        }
    }

    // 事件代理 (View More & 移除)
    wishlistContainer.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.btn_remove_wish');
        if (removeBtn) {
            const spotIdRaw = removeBtn.getAttribute('data-spotid');
            const spotIdNum = Number(spotIdRaw);
            if (Number.isFinite(spotIdNum)) handleRemoveWithUndo(spotIdNum, removeBtn);
            return;
        }

        const viewMoreBtn = e.target.closest('.btn-view-more, .btn_view_more, .card .wishlist-img, .card .wishlist-link');
        if (viewMoreBtn) {
            e.preventDefault();

            // 取得 spotId 與 placeId（可能為 empty/null）
            const spotId = viewMoreBtn.getAttribute && viewMoreBtn.getAttribute('data-spot-id') || viewMoreBtn.dataset && viewMoreBtn.dataset.spotId || null;
            let placeId = viewMoreBtn.getAttribute && viewMoreBtn.getAttribute('data-place-id') || viewMoreBtn.dataset && viewMoreBtn.dataset.placeId || null;

            // 嘗試補齊 placeId（若不存在）
            if ((!placeId || placeId === 'null') && spotId) {
                try {
                    const res = await fetch(`/api/auth/GetExternalPlaceId/${encodeURIComponent(spotId)}`, { credentials: 'include' });
                    if (res.ok) {
                        const json = await res.json().catch(() => ({}));
                        placeId = json.externalPlaceId || placeId;
                    }
                } catch (err) {
                    console.warn('GetExternalPlaceId failed', err);
                }
            }

            // 使用者點擊時，優先嘗試補抓圖片並寫回 DB（非同步但在導頁前嘗試）
            if (placeId) {
                try {
                    // 先用後端 proxy 取得 imageUrl，並更新畫面
                    try {
                        const photoRes = await fetch(`/api/auth/GetSpotPhoto?placeId=${encodeURIComponent(placeId)}&spotId=${encodeURIComponent(spotId || '')}`, { credentials: 'include' });
                        if (photoRes.ok) {
                            const j = await photoRes.json().catch(() => ({}));
                            if (j.imageUrl) {
                                // 更新該 card 的 img（若存在）
                                const imgEl = viewMoreBtn.querySelector && viewMoreBtn.querySelector('img.wishlist-img') || document.querySelector(`img[data-spot-id="${spotId}"]`);
                                if (imgEl) imgEl.src = j.imageUrl;
                            }
                        }
                    } catch (innerEx) { console.warn('GetSpotPhoto inner error', innerEx); }

                    // 嘗試呼叫全域 helper 儲存（若存在）
                    if (typeof window.trySyncWishlistPhoto === 'function') {
                        try {
                            const syncResult = await window.trySyncWishlistPhoto(Number(spotId || 0), placeId);
                            if (typeof syncResult === 'string' && syncResult) {
                                // 若返回 imageUrl，更新 UI
                                const imgEl = viewMoreBtn.querySelector && viewMoreBtn.querySelector('img.wishlist-img') || document.querySelector(`img[data-spot-id="${spotId}"]`);
                                if (imgEl) imgEl.src = syncResult;
                            }
                        } catch (syncErr) {
                            console.warn('trySyncWishlistPhoto failed', syncErr);
                        }
                    }
                } catch (e) {
                    console.warn('attempt photo sync failed', e);
                }
            }

            // 最後打開 panel 或導向 Spot（確保 placeId 已補齊時帶入）
            // wishlist.js 中的點擊事件最後
            if (typeof window.openSpotPanel === 'function') {
                window.openSpotPanel(spotId, placeId);
            } else {
                // 這裡是最安全的跳轉法
                let url = '/Spot';
                if (placeId && placeId !== 'null' && placeId.trim() !== '') {
                    url += `?placeId=${encodeURIComponent(placeId)}`;
                } else if (spotId) {
                    // 如果沒有 placeId 但有內部 ID，也可以考慮導向詳情頁
                    url = `/Spot/Detail?id=${spotId}`;
                }
                window.location.href = url;
            }
        }
    });

    function attachImageFallbacks() {
        wishlistContainer.querySelectorAll('img.card-img-top').forEach(img => {
            if (img.__wishlist_onerror_attached) return;
            img.__wishlist_onerror_attached = true;
            img.onerror = () => {
                img.onerror = null;
                img.src = '/img/placeholder.png';
            };
        });
    }

    // --- Undo 邏輯保持不變 ---
    async function handleRemoveWithUndo(spotIdNum, removeBtn) {
        if (undoTimers[spotIdNum]) return;
        const cardCol = removeBtn.closest('.col');
        if (!cardCol) return;

        cardCol.style.transition = 'opacity 0.3s ease';
        cardCol.style.opacity = '0.3';
        cardCol.style.pointerEvents = 'none';
        removeBtn.setAttribute('disabled', 'true');

        const toastEl = showUndoToast(spotIdNum, () => {
            if (undoTimers[spotIdNum]) {
                clearTimeout(undoTimers[spotIdNum].timerId);
                cleanupAfterUndo(spotIdNum, true);
            }
        });

        const timerId = setTimeout(async () => {
            try {
                const response = await fetch(apiToggle, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ spotId: spotIdNum })
                });
                if (response.ok) {
                    cardCol.remove();
                    if (toastEl && toastEl.parentNode) toastEl.remove();
                    delete undoTimers[spotIdNum];
                    checkEmpty();
                } else { cleanupAfterUndo(spotIdNum, false); }
            } catch (error) { cleanupAfterUndo(spotIdNum, false); }
        }, 3000);

        undoTimers[spotIdNum] = { timerId, toastEl, removeBtn, cardCol };
    }

    function cleanupAfterUndo(spotId, restored) {
        const entry = undoTimers[spotId];
        if (!entry) return;
        const { cardCol, removeBtn, toastEl } = entry;
        if (cardCol) { cardCol.style.opacity = '1'; cardCol.style.pointerEvents = 'auto'; }
        if (removeBtn) removeBtn.removeAttribute('disabled');
        if (toastEl) toastEl.remove();
        delete undoTimers[spotId];
        if (restored) checkEmpty();
    }

    function showUndoToast(spotId, onUndo) {
        const existing = document.getElementById('undo_toast_' + spotId);
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'undo_toast_' + spotId;
        toast.style = "position:fixed; bottom:20px; right:20px; z-index:2000; padding:10px 16px; background:#27354A; color:#fff; border-radius:8px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 12px rgba(0,0,0,0.15);";
        toast.innerHTML = `<span style="font-size:14px;">已從清單移除</span><button class="btn btn-sm btn-light" id="undo_btn_${spotId}" style="font-weight:bold;">還原</button>`;
        document.body.appendChild(toast);
        document.getElementById(`undo_btn_${spotId}`).onclick = onUndo;
        setTimeout(() => {
            const t = document.getElementById('undo_toast_' + spotId);
            if (t) {
                t.style.transition = 'opacity 0.5s';
                t.style.opacity = '0';
                setTimeout(() => t.remove(), 500);
            }
        }, 3000);
        return toast;
    }

    function checkEmpty() { if (wishlistContainer.querySelectorAll('.col').length === 0) renderEmpty(); }
    function renderEmpty() { wishlistContainer.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">目前沒有願望清單</p></div>'; }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }
});
