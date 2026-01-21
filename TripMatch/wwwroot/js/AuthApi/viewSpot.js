(async function () {
    // 小工具：安全 escape
    function escapeHtml(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function fetchWishlistItems() {
        const apiGet = window.Routes?.MemberCenterApi?.GetWish ?? '/api/MemberCenterApi/GetWish';
        try {
            const res = await fetch(apiGet, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) return null;
            const data = await res.json();
            return (data && data.items) ? data.items : data;
        } catch (ex) {
            console.error('取得 wishlist 失敗', ex);
            return null;
        }
    }

    function buildWishlistCardHtml(item) {
        const currentSpotId = item.spotId ?? item.SpotId ?? '';
        const currentSpotTitle = item.name_ZH ?? item.Name_ZH ?? item.spotTitle ?? '未知地點';
        const extId = item.externalPlaceId ?? item.ExternalPlaceId ?? item.googlePlaceId ?? '';
        const snapshot = item.PhotosSnapshot ?? item.photosSnapshot ?? item.spot?.photosSnapshot;
        const detailUrl = extId ? `/Spot?placeId=${encodeURIComponent(extId)}` : 'javascript:void(0);';
        const parsed = (() => { try { return snapshot ? JSON.parse(snapshot) : null; } catch { return null; } })();
        let img = '/img/placeholder.png';
        if (item.imageUrl) img = item.imageUrl;
        else if (typeof parsed === 'string') {
            const s = parsed.trim();
            if (s.toLowerCase().startsWith('http')) img = s;
            else if (/^\d+x\d+\?text=/.test(s)) img = `https://via.placeholder.com/${s}`;
        }

        return `
<div class="card pcard w-100 h-auto shadow-sm border-0 mb-3 wishlist-inserted"
     data-spot-col="${escapeHtml(currentSpotId)}" 
     data-place-id="${escapeHtml(extId)}">
  <a href="${detailUrl}" class="d-block wishlist-link">
    <img src="${escapeHtml(img)}" alt="${escapeHtml(currentSpotTitle)}" class="wishlist-img" style="width:100%; height:200px; object-fit:cover;">
  </a>
  <div class="card-body">
    <h6 class="card-title fw-bold mb-0">${escapeHtml(currentSpotTitle)}</h6>
  </div>
  <div class="card-footer bg-transparent border-0 pb-2">
    <a href="${detailUrl}" class="btnSpot w-100 wishlist-link" style="text-decoration:none; display:inline-block; text-align:center;">View More</a>
  </div>
</div>`;
    }

    // 等待 cardsRow 出現並（可選）等到初次填充完成
    function waitForCardsRow(timeout = 3000) {
        return new Promise((resolve) => {
            const el = document.getElementById('cardsRow');
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const found = document.getElementById('cardsRow');
                if (found) {
                    observer.disconnect();
                    resolve(found);
                }
            });

            observer.observe(document.documentElement, { childList: true, subtree: true });

            // timeout fallback
            setTimeout(() => {
                observer.disconnect();
                resolve(document.getElementById('cardsRow')); // 可能為 null
            }, timeout);
        });
    }

    // 若我們插入 card 後 extId 為空，嘗試向後端查 spotId 對應的 externalPlaceId
    async function fetchExternalPlaceIdBySpot(spotId) {
        if (!spotId) return '';
        try {
            const url = `/api/auth/GetExternalPlaceId/${encodeURIComponent(spotId)}`;
            const res = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) return '';
            const data = await res.json().catch(() => ({}));
            return data?.externalPlaceId ?? '';
        } catch (e) {
            console.warn('fetchExternalPlaceIdBySpot failed', e);
            return '';
        }
    }

    // 把插入的 card 更新 extId 與 href（若後端回傳 extId）
    function updateCardExtId(cardEl, extId) {
        if (!cardEl || !extId) return;

        // 1. 更新卡片本身的 Data 屬性
        cardEl.setAttribute('data-place-id', extId);

        // 2. 構造正確的連結
        const finalUrl = `/Spot?placeId=${encodeURIComponent(extId)}`;

        // 3. 找出卡片內所有帶有 .wishlist-link 的 <a> 標籤 (包含圖片跟按鈕)
        const links = cardEl.querySelectorAll('a.wishlist-link');
        links.forEach(link => {
            link.href = finalUrl;
            // 同步更新它們的 data-place-id 以防萬一
            link.setAttribute('data-place-id', extId);
        });
    }

    // 在插入後確保 extId，有則嘗試同步照片（由另一個 module 負責儲存）
    async function ensureExtIdAndSyncPhoto(item, insertedEl) {
        try {
            let extId = item.externalPlaceId ?? item.ExternalPlaceId ?? item.googlePlaceId ?? '';
            const spotId = item.spotId ?? item.SpotId ?? '';

            if (!extId && spotId) {
                extId = await fetchExternalPlaceIdBySpot(spotId);
                if (extId) {
                    updateCardExtId(insertedEl, extId);
                }
            }

            // 若有 extId 且缺少圖片，觸發 photo sync：呼叫全域的 trySyncWishlistPhoto 如果存在
            const img = insertedEl.querySelector('.wishlist-img');
            const hasImage = img && img.src && !img.src.endsWith('/img/placeholder.png');
            if (extId && (!hasImage || hasImage && img.src.includes('placeholder'))) {
                // 若你已載入 viewSpot-photo-sync.js，會有 window.trySyncWishlistPhoto 可用
                if (typeof window.trySyncWishlistPhoto === 'function') {
                    const ok = await window.trySyncWishlistPhoto(Number(spotId || 0), extId);
                    if (ok) {
                        // 從後端抓回剛存的圖片路徑（或直接使用 client-side photo fetch）
                        // 嘗試呼叫一個後端 proxy 取得剛存的圖片（若你有此 endpoint），否則嘗試 client-side places
                        // fallback: 若 stored image path unknown，略過更新（避免覆蓋）
                    }
                } else {
                    // 若沒有全域 helper，我們也可嘗試 client-side places fetch（若有 google maps）
                    if (window.viewSpotPhotoSyncFetch && typeof window.viewSpotPhotoSyncFetch === 'function') {
                        const url = await window.viewSpotPhotoSyncFetch(extId);
                        if (url && img) img.src = url;
                    }
                }
            }
        } catch (e) {
            console.warn('ensureExtIdAndSyncPhoto error', e);
        }
    }

    async function highlightWishlistPlaceFromQuery() {
        try {
            const params = new URLSearchParams(window.location.search);
            const placeId = params.get('placeId');
            if (!placeId) return;

            const items = await fetchWishlistItems();
            if (!items || !items.length) return;

            const match = items.find(it =>
                (it.externalPlaceId ?? it.ExternalPlaceId ?? it.googlePlaceId ?? '') === placeId
            );
            if (!match) return;

            const cardsRowEl = await waitForCardsRow(4000);
            if (!cardsRowEl) {
                console.warn('cardsRow 未找到，無法插入 wishlist highlight');
                return;
            }

            const extId = match.externalPlaceId ?? match.ExternalPlaceId ?? match.googlePlaceId ?? '';
            // 檢查是否已插入（避免重複）
            if (cardsRowEl.querySelector(`[data-place-id="${CSS.escape ? CSS.escape(extId) : extId}"]`) !== null) {
                return;
            }

            const cardHtml = buildWishlistCardHtml(match);
            cardsRowEl.insertAdjacentHTML('afterbegin', cardHtml);

            // 找到剛插入的元素，並嘗試補抓 extId 與圖片
            const inserted = cardsRowEl.querySelector('.wishlist-inserted');
            if (inserted) {
                // small delay 保險
                setTimeout(() => ensureExtIdAndSyncPhoto(match, inserted), 200);
            }
        } catch (ex) {
            console.error('highlightWishlistPlaceFromQuery 失敗', ex);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        highlightWishlistPlaceFromQuery();
    } else {
        document.addEventListener('DOMContentLoaded', highlightWishlistPlaceFromQuery);
    }
})();

// second module: 增強的 photo sync 與 click interception（expose trySyncWishlistPhoto globally）
(function () {
    'use strict';

    // 解析 query string 的 placeId
    function getPlaceIdFromQuery() {
        try {
            const params = new URLSearchParams(window.location.search);
            return params.get('placeId') || '';
        } catch {
            return '';
        }
    }

    // 安全 post 到後端 StoreSpotPhoto，回傳 json
    async function postStoreSpotPhoto(payload) {
        try {
            const url = window.Routes?.AuthApi?.StoreSpotPhoto ?? '/api/auth/StoreSpotPhoto';
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'RequestVerificationToken': window.csrfToken || ''
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) return null;
            return await res.json().catch(() => null);
        } catch (e) {
            console.warn('postStoreSpotPhoto failed', e);
            return null;
        }
    }

    // 以 Google Places client-side 取得首張照片 URL（若有）
    function getPhotoUrlFromPlaces(placeId) {
        return new Promise((resolve) => {
            try {
                const placesSvc = window.placesService || window.google && window.google.maps && window.google.maps.places && window.placesService ||
                    (window.google && window.google.maps && window.google.maps.places ? new window.google.maps.places.PlacesService(document.createElement('div')) : null);
                if (!placesSvc || !placeId) {
                    return resolve(null);
                }

                // 欲取得照片需 fields: ['photos']
                placesSvc.getDetails({ placeId: placeId, fields: ['photos'] }, (place, status) => {
                    try {
                        if (!place || status !== (window.google && window.google.maps && window.google.maps.places && window.google.maps.places.PlacesServiceStatus ? window.google.maps.places.PlacesServiceStatus.OK : 'OK')) {
                            return resolve(null);
                        }
                        if (place.photos && place.photos.length) {
                            const url = place.photos[0].getUrl({ maxWidth: 1200 });
                            return resolve(url || null);
                        }
                        return resolve(null);
                    } catch (e) {
                        console.warn('getDetails callback error', e);
                        return resolve(null);
                    }
                });
            } catch (e) {
                console.warn('getPhotoUrlFromPlaces error', e);
                resolve(null);
            }
        });
    }

    // 嘗試同步照片：若取得 photoUrl，呼叫後端儲存。exposed as window.trySyncWishlistPhoto
    async function trySyncWishlistPhoto(spotId, placeId) {
        if (!placeId) return false;

        const photoUrl = await getPhotoUrlFromPlaces(placeId);
        if (!photoUrl) {
            console.info('no photo found for', placeId);
            return false;
        }

        const payload = {
            SpotId: spotId || 0,
            PlaceId: placeId,
            ImageUrl: photoUrl
        };

        const result = await postStoreSpotPhoto(payload);
        if (result && (result.saved || result.imageUrl)) {
            // 若後端回傳 imageUrl，回傳給 caller
            return result.imageUrl || true;
        }
        return false;
    }

    // 若使用者點擊 wishlist 的 View More，但 href placeId 空白，攔截並先取得 extId 再導向
    async function attachLinkInterceptor() {
        document.addEventListener('click', async function (e) {
            try {
                const a = e.target.closest && e.target.closest('a.wishlist-link');
                if (!a) return;
                const href = a.getAttribute('href') || '';
                const url = new URL(href, window.location.origin);
                const q = url.searchParams.get('placeId') || '';
                if (q && q.trim()) return; // 已有 placeId，正常導向

                // 若無 placeId，嘗試從 card data-place-id 或 data-spot-col 取得
                const card = a.closest('.wishlist-inserted');
                if (!card) return; // 非我們插入的 card 不處理

                e.preventDefault();

                let ext = card.getAttribute('data-place-id') || '';
                const spotId = card.getAttribute('data-spot-col') || '';
                if (!ext && spotId) {
                    try {
                        const res = await fetch(`/api/auth/GetExternalPlaceId/${encodeURIComponent(spotId)}`, { credentials: 'include' });
                        if (res.ok) {
                            const data = await res.json().catch(() => ({}));
                            ext = data?.externalPlaceId || '';
                        }
                    } catch { /* ignore */ }
                }

                // 改為（保留 debug log，優先使用 anchor 原始 href；若找到 ext 則使用 ext）：
                const originalHref = a.getAttribute('href') || a.href || '/Spot';
                if (ext) {
                    const final = `/Spot?placeId=${encodeURIComponent(ext)}`;
                    console.debug('[wishlist] navigate with extId', final, { spotId, ext });
                    window.location.href = final;
                } else {
                    console.debug('[wishlist] extId not found, navigating to anchor href', originalHref, { spotId });
                    // 使用 anchor 本身的 href（可能是 '/Spot?placeId=' 或 javascript:void(0)）
                    // 若你不想 navigate 到 empty query，也可以在此顯示提示並 return
                    window.location.href = originalHref;
                }
            } catch (ex) {
                console.warn('wishlist link interceptor error', ex);
            }
        }, true);
    }

    // === 自動觸發觸發器 (針對 /Spot?placeId=... 頁面) ===
    async function autoTriggerPanelByQuery() {
        const pid = getPlaceIdFromQuery();
        if (!pid) return;

        // 1) 先用後端快照快取圖（非阻斷，但我們 await 一次短時間嘗試，讓圖片先顯示）
        fastFillHeroFromSnapshot(pid, null);

        // 2) 優先呼叫 Spot.js 提供的開啟方法（若有）
        if (typeof window.openPlaceByPlaceId === 'function') {
            // 若 openPlaceByPlaceId 可立即使用，直接呼叫並 return
            try {
                window.openPlaceByPlaceId(pid);
                return;
            } catch (e) {
                console.warn('openPlaceByPlaceId failed', e);
            }
        }

        // 3) 若 Spot.js 還沒準備好，短輪詢更快（減少重試次數與間隔以加速）
        let attempts = 0;
        const maxAttempts = 8; // 減少重試次數
        const intervalMs = 250; // 縮短間隔
        const timer = setInterval(async () => {
            attempts++;
            if (typeof window.openPlaceByPlaceId === 'function' && window.placesService) {
                clearInterval(timer);
                try {
                    window.openPlaceByPlaceId(pid);
                    return;
                } catch (e) {
                    console.warn('openPlaceByPlaceId failed on retry', e);
                }
            }
            if (attempts >= maxAttempts) {
                clearInterval(timer);
                // 4) fallback：用 client-side placesService 直接抓簡單資料並開 panel（若有）
                try {
                    const svc = window.placesService || (window.google && window.google.maps && window.google.maps.places ? new window.google.maps.places.PlacesService(document.createElement('div')) : null);
                    if (svc && typeof svc.getDetails === 'function') {
                        svc.getDetails({
                            placeId: pid,
                            fields: ['name', 'photos', 'formatted_address', 'geometry', 'rating']
                        }, (place, status) => {
                            const okStatus = window.google && window.google.maps && window.google.maps.places && window.google.maps.places.PlacesServiceStatus
                                ? window.google.maps.places.PlacesServiceStatus.OK
                                : 'OK';
                            if (status === okStatus && place) {
                                if (typeof window.fillPanelFromPlaceDetails === 'function') {
                                    try { window.fillPanelFromPlaceDetails(place); }
                                    catch (ex) { console.warn('fillPanelFromPlaceDetails failed', ex); }
                                } else {
                                    // 最低限度填充 panel
                                    const pName = document.getElementById('pName'); if (pName) pName.textContent = place.name || '';
                                    const pHero = document.getElementById('pHero'); if (pHero && place.photos && place.photos.length) pHero.style.backgroundImage = `url(${place.photos[0].getUrl({ maxWidth: 800 })})`;
                                    const panel = document.getElementById('panel'); if (panel) panel.classList.add('open');
                                    if (window.map && place.geometry && place.geometry.location) { try { window.map.setCenter(place.geometry.location); window.map.setZoom(16); } catch { } }
                                }
                            }
                        });
                    } else {
                        // 最後 fallback: 模擬搜尋
                        simulateInputClick(pid);
                    }
                } catch (e) {
                    console.warn('placesService fallback failed', e);
                    simulateInputClick(pid);
                }
            }
        }, intervalMs);
    }

    // 啟動觸發器
    if (document.readyState === 'complete') {
        autoTriggerPanelByQuery();
    } else {
        window.addEventListener('load', autoTriggerPanelByQuery);
    }

    // expose for other modules
    window.trySyncWishlistPhoto = trySyncWishlistPhoto;
    window.viewSpotPhotoSyncFetch = getPhotoUrlFromPlaces; // optional helper

    // attach on dom ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachLinkInterceptor);
    } else {
        attachLinkInterceptor();
    }
})();

(function () {
    'use strict';

    async function simulateSearchOrOpenByPlaceId() {
        const params = new URLSearchParams(window.location.search);
        const pid = params.get('placeId');
        if (!pid) return;

        // 優先嘗試 Spot.js 的開啟函式（最乾淨）
        const tryOpenWithSpot = () => {
            try {
                if (typeof window.openPlaceByPlaceId === 'function' && window.placesService) {
                    window.openPlaceByPlaceId(pid);
                    return true;
                }
            } catch (e) {
                console.warn('openPlaceByPlaceId call failed', e);
            }
            return false;
        };

        // 等待 Spot.js / map 初始化（短輪詢）
        for (let i = 0; i < 20; i++) {
            if (tryOpenWithSpot()) return;
            await new Promise(r => setTimeout(r, 300));
        }

        // 次選：若有 client-side placesService，直接呼 getDetails 並填 panel
        try {
            const svc = window.placesService || (window.google && window.google.maps && window.google.maps.places ? new window.google.maps.places.PlacesService(document.createElement('div')) : null);
            if (svc && typeof svc.getDetails === 'function') {
                svc.getDetails({
                    placeId: pid,
                    fields: ['name', 'rating', 'formatted_address', 'opening_hours', 'formatted_phone_number', 'photos', 'geometry']
                }, (place, status) => {
                    try {
                        const okStatus = window.google && window.google.maps && window.google.maps.places && window.google.maps.places.PlacesServiceStatus
                            ? window.google.maps.places.PlacesServiceStatus.OK
                            : 'OK';
                        if (status === okStatus && place) {
                            // 如果 Spot.js 提供填入函式則呼它
                            if (typeof window.fillPanelFromPlaceDetails === 'function') {
                                try { window.fillPanelFromPlaceDetails(place); }
                                catch (e) { console.warn('fillPanelFromPlaceDetails error', e); }
                            } else {
                                // 最小型填 panel（保險）
                                const pName = document.getElementById('pName'); if (pName) pName.textContent = place.name || '';
                                const pAddress = document.getElementById('pAddress'); if (pAddress) pAddress.textContent = place.formatted_address || '';
                                const pRating = document.getElementById('pRating'); if (pRating) pRating.textContent = place.rating ? String(place.rating) : '';
                                const pHero = document.getElementById('pHero'); if (pHero && place.photos && place.photos.length) pHero.style.backgroundImage = `url(${place.photos[0].getUrl({ maxWidth: 800 })})`;
                                const panel = document.getElementById('panel'); if (panel) panel.classList.add('open');
                                if (window.map && place.geometry && place.geometry.location) {
                                    try { window.map.setCenter(place.geometry.location); window.map.setZoom(16); } catch { /* ignore */ }
                                }
                            }
                            return;
                        }
                        // 若 Google 回應非 OK，退回模擬輸入
                        simulateInputClick(pid);
                    } catch (ex) {
                        console.warn('placesService.getDetails callback error', ex);
                        simulateInputClick(pid);
                    }
                });
                return;
            }
        } catch (e) {
            console.warn('placesService usage failed', e);
        }

        // 最後 fallback：模擬輸入 searchInput 並按下 searchBtn（讓 Spot.js 的搜尋流程處理）
        simulateInputClick(pid);
    }

    function simulateInputClick(value) {
        try {
            const input = document.getElementById('searchInput');
            const btn = document.getElementById('searchBtn');

            if (input) {
                input.focus();
                input.value = value;
                // 觸發 input 與鍵盤事件，模擬使用者操作
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }

            if (btn) {
                // 延遲一點點讓 input 事件先處理
                setTimeout(() => btn.click(), 100);
            }
        } catch (e) {
            console.warn('simulateInputClick error', e);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        simulateSearchOrOpenByPlaceId();
    } else {
        document.addEventListener('DOMContentLoaded', simulateSearchOrOpenByPlaceId);
    }
})();

// 快速用後端快照填充 hero（若有）
async function fastFillHeroFromSnapshot(placeId, spotId) {
    if (!placeId) return;
    try {
        // 1) 先向後端快取 API 取 imageUrl（MemberCenterApiController.GetSpotPhoto 已實作）
        const url = `/api/MemberCenterApi/GetSpotPhoto?placeId=${encodeURIComponent(placeId)}${spotId ? `&spotId=${encodeURIComponent(spotId)}` : ''}`;
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
            const j = await res.json().catch(() => ({}));
            if (j && j.imageUrl) {
                const pHero = document.getElementById('pHero');
                if (pHero) {
                    // 先顯示快取圖片，讓使用者感覺快速
                    pHero.style.backgroundImage = `url("${j.imageUrl}")`;
                    pHero.textContent = "";
                }
            }
        }
    } catch (ex) {
        // 不阻塞主流程
        console.warn('fastFillHeroFromSnapshot failed', ex);
    }
}

// 新增：當 View More href 沒有 placeId 時，使用同卡片內 img[data-place-id] 作為 fallback 導向
function attachBtnViewMoreFallback() {
    document.addEventListener('click', function (e) {
        try {
            const a = e.target.closest && e.target.closest('a.btn-view-more, a.btn_view_more');
            if (!a) return;

            // 若 href 已有有效 placeId，則不處理
            const href = a.getAttribute('href') || a.href || '';
            try {
                const parsed = new URL(href, window.location.origin);
                const q = parsed.searchParams.get('placeId') || '';
                if (q && q.trim()) return; // 已包含 placeId，正常導向
            } catch { /* ignore URL parse error and fallthrough */ }

            // 嘗試從 <img data-place-id> 取得 placeId（先找 a 內的 img，沒找到再往上找同卡片）
            const img = a.querySelector && a.querySelector('img[data-place-id]') ||
                        a.closest && a.closest('.col') && a.closest('.col').querySelector('img[data-place-id]');
            const placeId = img && img.getAttribute && img.getAttribute('data-place-id') || '';

            if (placeId && placeId !== 'null' && placeId.trim()) {
                // 攔截並導向正確的 placeId
                e.preventDefault();
                const final = `/Spot?placeId=${encodeURIComponent(placeId)}`;
                try { a.setAttribute('href', final); } catch { /* ignore */ }
                window.location.href = final;
            }
            // 若無 placeId，保留原本行為（可能是 javascript:void(0) 或 /Spot?placeId=）
        } catch (ex) {
            console.warn('attachBtnViewMoreFallback error', ex);
        }
    }, true); // capture phase 以便先攔截
}

// 註冊
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachBtnViewMoreFallback);
} else {
    attachBtnViewMoreFallback();
}

// 新增：同步 View More 與圖片的 placeId（若圖片一開始就有 data-place-id）
(function () {
    'use strict';

    function syncViewMoreToImage() {
        try {
            // 支援你專案中常見的 card 容器選取器
            const cards = document.querySelectorAll('.wishlist-inserted, .col, .pcard, .wishlist-item');
            cards.forEach(card => {
                if (!card) return;
                // 優先找卡片內的 img[data-place-id]
                const img = card.querySelector && card.querySelector('img[data-place-id]');
                if (!img) return;
                const pid = (img.getAttribute('data-place-id') || img.dataset?.placeId || '').trim();
                if (!pid || pid === 'null') return;

                // 找到同卡片中所有應該同步的連結並設定 href 與 data-place-id
                const linkSelectors = [
                    'a.btn-view-more',
                    'a.btn_view_more',
                    'a.wishlist-link',
                    'a.btnSpot',
                    'a.wishlist-link'
                ].join(',');
                const links = card.querySelectorAll(linkSelectors);
                links.forEach(a => {
                    try {
                        a.setAttribute('href', `/Spot?placeId=${encodeURIComponent(pid)}`);
                        a.setAttribute('data-place-id', pid);
                    } catch (ex) { /* ignore */ }
                });
            });
        } catch (e) {
            console.warn('syncViewMoreToImage error', e);
        }
    }

    // 初始同步（頁面載入後）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncViewMoreToImage);
    } else {
        // 已載入的情況立即執行一次
        syncViewMoreToImage();
    }

    // 若 cardsRow 存在，監聽 childList 變動（新增卡片時自動同步）
    const cardsRowEl = document.getElementById('cardsRow');
    if (cardsRowEl) {
        const obs = new MutationObserver((mutations) => {
            // 簡單且保守：每次 childList 變動時做一次全域同步
            let changed = false;
            for (const m of mutations) {
                if (m.addedNodes && m.addedNodes.length) { changed = true; break; }
            }
            if (changed) syncViewMoreToImage();
        });
        obs.observe(cardsRowEl, { childList: true, subtree: true });
    }
})();