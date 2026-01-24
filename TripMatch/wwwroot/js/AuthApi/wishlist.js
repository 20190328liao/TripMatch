document.addEventListener('DOMContentLoaded', () => {
    const wishlistContainer = document.getElementById('wishlist_cards');
    const apiGet = window.Routes?.MemberCenterApi?.GetWish ?? '/api/MemberCenterApi/GetWish';
    const apiToggle = window.Routes?.MemberCenterApi?.Toggle ?? '/api/MemberCenterApi/Toggle';
    const apiGetPhoto = window.Routes?.MemberCenterApi?.GetSpotPhoto ?? '/api/MemberCenterApi/GetSpotPhoto';
    const apiGetExternalPlace = window.Routes?.AuthApi?.GetExternalPlaceId ?? '/api/auth/GetExternalPlaceId';

    // 新增：分類相關 API
    const apiCategories = window.Routes?.MemberCenterApi?.GetWishlistCategories ?? '/api/MemberCenterApi/GetWishlistCategories';
    const apiWishByCat = window.Routes?.MemberCenterApi?.GetWishByCategory ?? '/api/MemberCenterApi/GetWishByCategory';

    const undoTimers = {};
    if (!wishlistContainer) return;

    // 初始化：先載入分類按鈕，再載入全部（categoryId = 0）
    init();

    async function init() {
        try {
            await renderCategories(); // 嘗試載入分類（失敗不阻塞）
        } catch {
            // ignore
        }
        await loadWishlist(0);
    }

    // 新增：載入並渲染分類按鈕 (支援縮圖 sampleImage / imageUrl)
    async function renderCategories() {
        try {
            const res = await fetch(apiCategories, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) return;
            const j = await res.json().catch(() => ({}));
            const cats = j.categories || [];
            const container = document.getElementById('wishlist_categories');
            if (!container) return;

            // helper: hex -> {r,g,b}，支援 #abc 與 #aabbcc
            function hexToRgb(hex) {
                if (!hex) return null;
                let h = hex.replace('#', '').trim();
                if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
                if (h.length !== 6) return null;
                const r = parseInt(h.substring(0, 2), 16);
                const g = parseInt(h.substring(2, 4), 16);
                const b = parseInt(h.substring(4, 6), 16);
                if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
                return { r, g, b };
            }

            function rgba(hex, a = 1) {
                const rgb = hexToRgb(hex);
                if (!rgb) return `rgba(0,0,0,${a})`;
                return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
            }

            // helper: 決定白或深色文字（以相對亮度近似）
            function readableTextColor(hex) {
                const rgb = hexToRgb(hex);
                if (!rgb) return '#0b1220'; // fallback 深色文字

                // linearize sRGB then compute relative luminance (WCAG)
                const srgb = [rgb.r, rgb.g, rgb.b].map(v => {
                    const c = v / 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                });
                const l = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];

                // 以亮度閾值選擇文字顏色：較亮背景用深色文字，較暗背景用白色文字
                return l < 0.6 ? '#0b1220' : '#ffffff';
            }

            container.innerHTML = cats.map(c => {
                const id = c.id ?? 0;
                const badge = c.count ? `<span class="badge bg-secondary ms-2">${c.count}</span>` : '';
                const imgSrc = c.sampleImage || c.imageUrl || '';
                const imgTag = imgSrc ? `<img src="${escapeHtml(imgSrc)}" class="cat-thumb" alt="${escapeHtml(c.nameZh)}" />` : '';

                const bg = (c.color || '#0EA5A4').trim();
                const fg = readableTextColor(bg);
                const border = rgba(bg, 0.12);

                // data 屬性方便其他 script 使用
                return `<button class="wishlist-cat-btn btn-transparent btn-sm" data-cat-id="${id}" data-cat-color="${escapeHtml(bg)}" data-cat-text="${escapeHtml(fg)}" style="background: linear-gradient(180deg, #f5fffb, #fff); background-color: ${escapeHtml(bg)}; color: ${escapeHtml(fg)}; border:1px solid ${border};">${imgTag}<span class="cat-name">${escapeHtml(c.nameZh)}</span> ${badge}</button>`;
            }).join('');
            attachCatHandlers();
        } catch (ex) {
            console.warn('載入分類失敗', ex);
        }
    }

    function attachCatHandlers() {
        const container = document.getElementById('wishlist_categories');
        if (!container) return;
        container.querySelectorAll('.wishlist-cat-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = Number(btn.getAttribute('data-cat-id') || '0');
                // 樣式切換
                container.querySelectorAll('.wishlist-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                await loadWishlist(id);
            });
        });
    }

    // 修改：loadWishlist 支援 categoryId。若 categoryId 為 0 或 undefined 使用原本的 apiGet。
    async function loadWishlist(categoryId) {
        try {
            let res;
            if (categoryId && Number(categoryId) > 0) {
                const url = `${apiWishByCat}?categoryId=${encodeURIComponent(categoryId)}`;
                res = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            } else {
                res = await fetch(apiGet, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            }

            if (!res.ok) { renderEmpty(); return; }
            const data = await res.json().catch(() => ({}));

            // 若來自 GetWishByCategory API（通常回傳 { items: [...] }，items 物件屬性名可能不同），將其 map 成舊的 shape 以重用 render()
            let items = (data && data.items) ? data.items : data;

            // 若 items 的第一筆有 nameZh 或 photosSnapshot（表示是由 GetWishByCategory 回傳），則做 mapping
            if (Array.isArray(items) && items.length > 0 && (items[0].nameZh !== undefined || items[0].photosSnapshot !== undefined)) {
                items = items.map(it => ({
                    spotId: it.spotId ?? it.SpotId ?? 0,
                    SpotId: it.spotId ?? it.SpotId ?? 0,
                    name_ZH: it.nameZh ?? it.name_ZH ?? it.spotTitle ?? null,
                    Name_ZH: it.nameZh ?? it.Name_ZH ?? it.spotTitle ?? null,
                    externalPlaceId: it.externalPlaceId ?? it.ExternalPlaceId ?? '',
                    ExternalPlaceId: it.externalPlaceId ?? it.ExternalPlaceId ?? '',
                    PhotosSnapshot: it.photosSnapshot ?? it.PhotosSnapshot ?? it.photosSnapshotJson ?? null,
                    photosSnapshot: it.photosSnapshot ?? it.PhotosSnapshot ?? it.photosSnapshotJson ?? null,
                    Address: it.address ?? it.Address ?? '',
                    Rating: it.rating ?? it.Rating ?? null,
                    imageUrl: it.imageUrl ?? null,
                    spot: it.spot ?? null,
                    locationCategoryId: it.locationCategoryId ?? it.locationCategoryId ?? null
                }));
            }

            render(items);
        } catch (ex) {
            console.error('載入願望清單失敗', ex);
            renderEmpty();
        }
    }

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
            const snapshot = item.PhotosSnapshot || item.photosSnapshot || item.spot?.photosSnapshot;
            const parsedPhoto = safeParsePhotos(snapshot);

            let currentImageUrl = '/img/placeholder.png';
            let needsGoogleFetch = false;

            if (item.imageUrl) {
                currentImageUrl = item.imageUrl;
            } else if (parsedPhoto) {
                if (typeof parsedPhoto === 'string') {
                    const s = parsedPhoto.trim();
                    if (s.toLowerCase().startsWith('http://') || s.toLowerCase().startsWith('https://')) {
                        currentImageUrl = s;
                    } else if (/^\d+x\d+\?text=/.test(s)) {
                        currentImageUrl = `https://via.placeholder.com/${s}`;
                    } else {
                        needsGoogleFetch = true;
                        currentImageUrl = '/img/placeholder.png';
                    }
                } else if (Array.isArray(parsedPhoto) && parsedPhoto.length) {
                    const s = parsedPhoto[0] && parsedPhoto[0].trim ? parsedPhoto[0].trim() : '';
                    if (s.toLowerCase().startsWith('http')) currentImageUrl = s;
                    else if (/^\d+x\d+\?text=/.test(s)) currentImageUrl = `https://via.placeholder.com/${s}`;
                    else needsGoogleFetch = true;
                } else {
                    currentImageUrl = '/img/placeholder.png';
                }
            } else if (extId) {
                needsGoogleFetch = true;
                currentImageUrl = '/img/placeholder.png';
            }

            // 決定 href：只有在 extId 存在時才使用 /Spot?placeId=，否則回內部 Detail 或 /Spot
            let finalHref;
            if (extId && extId.trim() !== '') {
                finalHref = `/Spot?placeId=${encodeURIComponent(extId)}`;
            } else if (currentSpotId) {
                finalHref = `/Spot/Detail?id=${encodeURIComponent(currentSpotId)}`;
            } else {
                finalHref = '/Spot';
            }

            // data-place-id 只在 extId 有效時才帶
            const dataPlaceAttr = (extId && extId.trim() !== '') ? `data-place-id="${escapeHtml(extId)}"` : '';

            // 把 title 放到 data-title，做為後備搜尋關鍵字
            const dataTitle = `data-title="${escapeHtml(currentSpotTitle)}"`;

            return `
<div class="col" data-spot-col="${escapeHtml(currentSpotId)}">
  <div class="card w-100 h-100 shadow-sm border-0 position-relative wishlist-item" ${extId ? `data-place-id="${escapeHtml(extId)}"` : ''} ${dataTitle}>
    <button type="button"
            class="btn_remove_wish active"
            data-spotid="${escapeHtml(currentSpotId)}"
            title="從清單移除"
            style="position: absolute; top: 10px; right: 10px; z-index: 10; border: none; background: rgba(255,255,255,0.8); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #dc3545; transition: all 0.2s;">
        <i class="bi bi-trash-fill"></i>
    </button>

    <a href="${finalHref}" class="d-block btn-view-more" data-spot-id="${escapeHtml(currentSpotId)}" ${dataPlaceAttr} ${dataTitle}>
      <img src="${escapeHtml(currentImageUrl)}" class="card-img-top wishlist-img" alt="${escapeHtml(currentSpotTitle)}"
           data-spot-id="${escapeHtml(currentSpotId)}"
           ${dataPlaceAttr}
           data-needs-fetch="${needsGoogleFetch}"
           style="height: 250px; object-fit: cover; border-top-left-radius: 8px; border-top-right-radius: 8px;">
    </a>

    <div class="card-body">
      <h6 class="card-title text-truncate fw-bold mb-1">${escapeHtml(currentSpotTitle)}</h6>
    </div>

    <div class="card-footer bg-transparent border-0 pb-3">
      <a href="${finalHref}" class="btn_view_more btn_member_detail w-100" style="text-decoration:none; display:inline-block; text-align:center;" data-spot-id="${escapeHtml(currentSpotId)}" ${dataPlaceAttr} ${dataTitle}>
        View More
      </a>
    </div>
  </div>
</div>`;
        }).join('');

        attachImageFallbacks();
        fetchMissingPhotos(); // 渲染後立即啟動補圖
    }

    // 替換原有 fetchMissingPhotos，移除 Google API 與 client-side photo sync 的 fallback
    // 僅使用後端快照 (apiGetPhoto) 與已存在的 externalPlaceId 機制來取得圖片
    async function fetchMissingPhotos() {
        const images = document.querySelectorAll('img[data-spot-id]');
        for (let img of images) {
            const isPlaceholder = img.src && (img.src.endsWith('/img/placeholder.png') || img.src.includes('placeholder'));
            if (!isPlaceholder) continue;

            const spotId = img.getAttribute('data-spot-id') || img.dataset?.spotId || '';
            let placeId = img.getAttribute('data-place-id') || img.dataset?.placeId || '';

            try {
                // 1) 若沒有 placeId，先向後端查 spot -> externalPlaceId
                if ((!placeId || placeId === 'null') && spotId) {
                    try {
                        const resExt = await fetch(`${apiGetExternalPlace}/${encodeURIComponent(spotId)}`, { credentials: 'include' });
                        if (resExt.ok) {
                            const json = await resExt.json().catch(() => ({}));
                            placeId = json.externalPlaceId || placeId;
                            if (placeId) {
                                img.setAttribute('data-place-id', placeId);
                                updateCardLinks(spotId, placeId);
                                // 同步更新卡片內所有連結
                                const card = img.closest('.col');
                                if (card) {
                                    const aLinks = card.querySelectorAll('a.btn-view-more, a.btn_view_more, a.btnSpot, a.wishlist-link, a.btn_member_detail');
                                    const finalUrl = `/Spot?placeId=${encodeURIComponent(placeId)}`;
                                    aLinks.forEach(a => {
                                        try { a.setAttribute('href', finalUrl); a.setAttribute('data-place-id', placeId); } catch { }
                                    });
                                    const cardWrapper = card.querySelector('.wishlist-item') || card;
                                    cardWrapper && cardWrapper.setAttribute('data-place-id', placeId);
                                }
                            }
                        }
                    } catch (e) {
                        // 不阻斷後續流程
                        console.warn('fetchMissingPhotos: fetch externalPlaceId failed', e);
                    }
                }

                // 2) 使用後端快照 API 取得最終 imageUrl（若存在） — 不再呼叫 Google Places 或 client-side sync
                try {
                    // 優先使用在檔案頂部定義的 apiGetPhoto（若未定義再 fallback 到 known path）
                    const getPhotoUrl = apiGetPhoto || '/api/MemberCenterApi/GetSpotPhoto';
                    const url = `${getPhotoUrl}?${placeId ? `placeId=${encodeURIComponent(placeId)}&` : ''}${spotId ? `spotId=${encodeURIComponent(spotId)}` : ''}`;
                    const photoRes = await fetch(url, { credentials: 'include' });
                    if (photoRes.ok) {
                        const j = await photoRes.json().catch(() => ({}));
                        if (j && j.imageUrl) {
                            img.src = j.imageUrl;
                            continue; // 成功更新，處理下一張
                        }
                    }
                } catch (ex) {
                    console.warn('fetchMissingPhotos: apiGetPhoto failed', ex);
                }

                // 3) 如果後端也沒有，保留 placeholder（不再嘗試 Google API）
                // 若將來需要可在此加入額外策略
            } catch (err) {
                console.error('fetchMissingPhotos error', err);
            }
        }
    }

    wishlistContainer.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.btn_remove_wish');
        if (removeBtn) {
            const spotIdRaw = removeBtn.getAttribute('data-spotid');
            const spotIdNum = Number(spotIdRaw);
            if (Number.isFinite(spotIdNum)) handleRemoveWithUndo(spotIdNum, removeBtn);
            return;
        }

        const viewMoreBtn = e.target.closest('.btn-view-more, .btn_view_more, .card .wishlist-img, .card .wishlist-link, a.btn_view_more, a.btn-view-more');
        if (viewMoreBtn) {
            e.preventDefault();

            const spotId = viewMoreBtn.getAttribute('data-spot-id') || viewMoreBtn.dataset?.spotId || null;
            let placeId = viewMoreBtn.getAttribute('data-place-id') || viewMoreBtn.dataset?.placeId || null;
            const title = viewMoreBtn.getAttribute('data-title') || viewMoreBtn.dataset?.title || '';

            // 若沒有 placeId，先現場向後端查一次
            if ((!placeId || placeId === 'null' || placeId === '') && spotId) {
                try {
                    const res = await fetch(`/api/auth/GetExternalPlaceId/${encodeURIComponent(spotId)}`, { credentials: 'include' });
                    if (res.ok) {
                        const json = await res.json().catch(() => ({}));
                        placeId = json.externalPlaceId || placeId;
                        if (placeId) {
                            // 更新同卡片內所有連結
                            const card = viewMoreBtn.closest('.col');
                            if (card) {
                                const aLinks = card.querySelectorAll('a.btn-view-more, a.btn_view_more, a.btnSpot, a.wishlist-link');
                                const final = `/Spot?placeId=${encodeURIComponent(placeId)}`;
                                aLinks.forEach(a => {
                                    a.setAttribute('href', final);
                                    a.setAttribute('data-place-id', placeId);
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.warn('現場補抓 placeId 失敗', err);
                }
            }

            // 若仍無 placeId，嘗試用 title 透過 client-side Google Places 搜尋 place_id
            if ((!placeId || placeId === 'null' || placeId === '') && title && window.google && window.google.maps && window.google.maps.places) {
                try {
                    const svc = new window.google.maps.places.PlacesService(document.createElement('div'));
                    // findPlaceFromQuery 需要 callback，封裝成 Promise 以便 await
                    const placeIdFound = await new Promise((resolve) => {
                        try {
                            svc.findPlaceFromQuery({ query: title, fields: ['place_id'] }, (results, status) => {
                                const okStatus = window.google.maps.places.PlacesServiceStatus.OK;
                                if (status === okStatus && results && results.length) {
                                    resolve(results[0].place_id);
                                } else {
                                    resolve(null);
                                }
                            });
                        } catch (ex) {
                            resolve(null);
                        }
                    });
                    if (placeIdFound) {
                        placeId = placeIdFound;
                        const card = viewMoreBtn.closest('.col');
                        if (card) {
                            const aLinks = card.querySelectorAll('a.btn-view-more, a.btn_view_more, a.btnSpot, a.wishlist-link');
                            const final = `/Spot?placeId=${encodeURIComponent(placeId)}`;
                            aLinks.forEach(a => {
                                a.setAttribute('href', final);
                                a.setAttribute('data-place-id', placeId);
                            });
                        }
                    }
                } catch (e) {
                    console.warn('client-side places lookup failed', e);
                }
            }

            // 成功取得 placeId 後
            if (placeId) {
                const card = viewMoreBtn.closest('.col');
                if (card) {
                    updateCardLinks(spotId, placeId); // 新增這行，會即時更新所有連結
                }
            }

            // 最後決定導向
            let finalUrl = '/Spot';
            if (placeId && placeId !== 'null' && placeId.trim() !== '') {
                finalUrl = `/Spot?placeId=${encodeURIComponent(placeId)}`;
            } else if (spotId) {
                finalUrl = `/Spot/Detail?id=${encodeURIComponent(spotId)}`;
            }

            window.location.href = finalUrl;
        }
    });

    // 新增：統一更新卡片內所有連結與屬性的 helper
    function updateCardLinks(spotId, placeId) {
        if (!placeId) return;
        // 注意：render 目前使用 data-spot-col 存 spotId，因此選用 data-spot-col
        const col = document.querySelector(`.col[data-spot-col="${spotId}"]`) || document.querySelector(`.col[data-spot-id="${spotId}"]`);
        if (!col) return;
        const finalUrl = `/Spot?placeId=${encodeURIComponent(placeId)}`;

        // 常見 link selector，盡量全面
        const linkSelectors = ['a.btn-view-more', 'a.btn_view_more', 'a.btnSpot', 'a.wishlist-link', 'a.btn_member_detail', '.card .wishlist-img'].join(',');
        const links = col.querySelectorAll(linkSelectors);
        links.forEach(el => {
            try {
                if (el.tagName.toLowerCase() === 'img') {
                    el.setAttribute('data-place-id', placeId);
                    // 若 img 包在 a 裡，a 會被更新下面
                } else {
                    el.setAttribute('href', finalUrl);
                    el.setAttribute('data-place-id', placeId);
                }
            } catch { /* ignore */ }
        });

        // 同步更新卡片容器 data
        const cardWrapper = col.querySelector('.wishlist-item') || col;
        if (cardWrapper) cardWrapper.setAttribute('data-place-id', placeId);
    }

    function attachImageFallbacks() {
        wishlistContainer.querySelectorAll('img.card-img-top, img.wishlist-img').forEach(img => {
            if (img.__wishlist_onerror_attached) return;
            img.__wishlist_onerror_attached = true;
            img.onerror = () => {
                img.onerror = null;
                img.src = '/img/placeholder.png';
            };
        });
    }

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
        toast.style = "position:fixed; bottom:20px; z-index:2000; padding:10px 16px; background:#27354A; color:#fff; border-radius:8px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 12px rgba(0,0,0,0.15);";
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
   

    function escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }
});

// 替換原 notify，Spot?placeId= 時 suppress popup
function notify(type, title, message, seconds = 2) {
    try {
        const loc = window.location;
        const isSpotWithPlaceId = loc && typeof loc.pathname === 'string'
            && loc.pathname.toLowerCase().startsWith('/spot')
            && new URLSearchParams(loc.search).has('placeId');

        if (isSpotWithPlaceId) {
            // 在 Spot?placeId= 頁面完全禁止 popup（改為寫入 console 以便除錯）
            console.debug('[notify suppressed on Spot?placeId] ', { type, title, message });
            return;
        }

        // 原有顯示邏輯（保留）
        if (typeof window.showPopup === 'function') {
            try { return window.showPopup({ title: title || '', message: message || '', type: type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info'), autoClose: !!seconds, seconds }); } catch { /* ignore */ }
        }
        if (typeof window.showToast === 'function') {
            try { window.showToast(message || title || ''); return; } catch { /* ignore */ }
        }
        alert((title ? title + '\n' : '') + (message || ''));
    } catch (ex) {
        // 防止 notify 本身拋錯影響主流程
        console.warn('notify error', ex);
    }
}
