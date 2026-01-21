document.addEventListener('DOMContentLoaded', () => {
    const wishlistContainer = document.getElementById('wishlist_cards');
    const apiGet = window.Routes?.MemberCenterApi?.GetWish ?? '/api/MemberCenterApi/GetWish';
    const apiToggle = window.Routes?.MemberCenterApi?.Toggle ?? '/api/MemberCenterApi/Toggle';
    const apiGetPhoto = window.Routes?.MemberCenterApi?.GetSpotPhoto ?? '/api/MemberCenterApi/GetSpotPhoto';
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

    async function fetchMissingPhotos() {
        const images = document.querySelectorAll('img[data-spot-id]');
        for (let img of images) {
            const isPlaceholder = img.src && (img.src.endsWith('/img/placeholder.png') || img.src.includes('placeholder'));
            if (!isPlaceholder) continue;

            const spotId = img.getAttribute('data-spot-id');
            let placeId = img.getAttribute('data-place-id');

            try {
                if ((!placeId || placeId === 'null') && spotId) {
                    try {
                        const resExt = await fetch(`${apiGetExternalPlace}/${encodeURIComponent(spotId)}`, { credentials: 'include' });
                        if (resExt.ok) {
                            const json = await resExt.json().catch(() => ({}));
                            placeId = json.externalPlaceId || placeId;
                            if (placeId) {
                                img.setAttribute('data-place-id', placeId);
                                updateCardLinks(spotId, placeId); // 新增這行
                                const card = img.closest('.col');
                                if (card) {
                                    const aLinks = card.querySelectorAll('a.btn-view-more, a.btn_view_more, a.btnSpot, a.wishlist-link');
                                    const finalUrl = `/Spot?placeId=${encodeURIComponent(placeId)}`;
                                    aLinks.forEach(a => {
                                        a.setAttribute('href', finalUrl);
                                        a.setAttribute('data-place-id', placeId);
                                    });
                                    const cardWrapper = card.querySelector('.wishlist-item') || card;
                                    cardWrapper && cardWrapper.setAttribute('data-place-id', placeId);
                                }
                            }
                        }
                    } catch { /* ignore */ }
                }

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

                    if (window.viewSpotPhotoSyncFetch && typeof window.viewSpotPhotoSyncFetch === 'function') {
                        try {
                            const url = await window.viewSpotPhotoSyncFetch(placeId);
                            if (url) {
                                img.src = url;
                                continue;
                            }
                        } catch (e) { /* ignore */ }
                    }
                } else {
                    // 最後嘗試用 client-side Google Places 以 title 搜尋
                    const card = img.closest('.col');
                    const title = card?.getAttribute('data-title') || img.getAttribute('alt') || '';
                    if (title && window.google && window.google.maps && window.google.maps.places) {
                        try {
                            const svc = new window.google.maps.places.PlacesService(document.createElement('div'));
                            svc.findPlaceFromQuery({ query: title, fields: ['place_id', 'photos'] }, (places, status) => {
                                const okStatus = window.google.maps.places.PlacesServiceStatus.OK;
                                if (status === okStatus && places && places.length) {
                                    const p = places[0];
                                    if (p.place_id) {
                                        // 更新所有連結
                                        const aLinks = card.querySelectorAll('a.btn-view-more, a.btn_view_more, a.btnSpot, a.wishlist-link');
                                        const finalUrl = `/Spot?placeId=${encodeURIComponent(p.place_id)}`;
                                        aLinks.forEach(a => {
                                            a.setAttribute('href', finalUrl);
                                            a.setAttribute('data-place-id', p.place_id);
                                        });
                                        img.setAttribute('data-place-id', p.place_id);
                                    }
                                    if (p.photos && p.photos.length) {
                                        try { img.src = p.photos[0].getUrl({ maxWidth: 800 }); } catch { }
                                    }
                                }
                            });
                        } catch (e) {
                            console.warn('client-side findPlaceFromQuery failed', e);
                        }
                    }
                }
            } catch (err) {
                console.error("補撈圖片失敗:", err);
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
