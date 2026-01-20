
const panel = document.getElementById('panel');
const panelClose = document.getElementById('panelClose');

const pName = document.getElementById('pName');
const pRating = document.getElementById('pRating');
const pAddress = document.getElementById('pAddress');
const pHours = document.getElementById('pHours');
const pPhone = document.getElementById('pPhone');
const pHero = document.getElementById('pHero');

const fabWrap = document.getElementById('fabWrap');
const fab = document.getElementById('fab');
const btnWishlist = document.getElementById('btnWishlist');
const btnTrip = document.getElementById('btnTrip');

const popular = document.getElementById('popular');
const popularClose = document.getElementById('popularClose');
const popularReopen = document.getElementById('popularReopen');
const cardsRow = document.getElementById('cardsRow');

const overlay = document.getElementById('overlay');
const modalClose = document.getElementById('modalClose');
const modalList = document.getElementById('modalList');
const mTitle = document.getElementById('mTitle');

const toast = document.getElementById('toast');

// 用來記錄「已收藏」的 placeId（前端快取）
const wishlistPlaceIdSet = new Set();


// 導覽列
// search
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
// const userBtn = document.getElementById('userBtn');


let map = null;
let placesService = null;
let currentPlace = null;

let fabExpanded = false;
let popularCat = 'restaurant';

let selectMarker = null;
const popularMarkers = new Map();

// 地圖要用的(圖示)
let ICON_SELECTED_PIN = null;
let ICON_STAR = null;


// ====== DTO converters ======
function extractLatLng(anyLoc) {
    if (!anyLoc) return null;

    // Google LatLng 物件
    if (typeof anyLoc.lat === "function" && typeof anyLoc.lng === "function") {
        return { lat: anyLoc.lat(), lng: anyLoc.lng() };
    }

    // 純物件
    if (typeof anyLoc.lat === "number" && typeof anyLoc.lng === "number") {
        return { lat: anyLoc.lat, lng: anyLoc.lng };
    }
    return null;
}


// Data Transfer Object
// 方便接後端
function toPlaceDetailDTO(place) {
    const latLng = extractLatLng(place.geometry?.location) || extractLatLng(place.latLng) || extractLatLng(place);

    return {
        placeId: place.place_id || place.placeId,
        name: place.name || "未命名景點",
        rating: Number(place.rating || 0),
        address: place.formatted_address || place.address || "--",
        phone: place.formatted_phone_number || place.phone || "--",
        weekdayText: place.opening_hours?.weekday_text || place.weekdayText || null,
        photoUrl:
            place.photoUrl || (place.photos?.length && typeof place.photos[0].getUrl === "function"
                ? place.photos[0].getUrl({ maxWidth: 1200, maxHeight: 700 }) : null),
        lat: latLng?.lat ?? null,
        lng: latLng?.lng ?? null,
    };
}

function toPopularDTO(p) {
    const latLng = extractLatLng(p.geometry?.location) || extractLatLng(p.latLng) || extractLatLng(p);


    return {
        placeId: p.place_id,
        name: p.name || "景點",
        rating: Number(p.rating || 0),
        lat: latLng?.lat ?? null,
        lng: latLng?.lng ?? null,
        photoUrl:
            p.photos?.length && typeof p.photos[0].getUrl === 'function'
                ? p.photos[0].getUrl({ maxWidth: 600, maxHeight: 300 })
                : null,
    };
}

// ====== API layer (future backend ready) ======
// 景點
const api = {
    getPlaceDetails(placeId, cb) {
        placesService.getDetails(
            {
                placeId,
                fields: [
                    'place_id',
                    'name',
                    'rating',
                    'formatted_address',
                    'formatted_phone_number',
                    'opening_hours',
                    'geometry',
                    'photos',
                ],
            },
            (place, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
                    cb(new Error("Places details failed: " + status), null);
                    return;
                }
                cb(null, place);
            }
        );
    },

    // 尋找附近熱門景點，並依類別分類
    searchPopular({ center, radius, type }, cb) {
        const req = { location: center, radius };
        if (type) { req.type = type; }
        placesService.nearbySearch(req, (results, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
                cb(null, []);
                return;
            }
            cb(null, results);
        });
    },

    // 搜尋，只取第一筆，直接打開panel
    searchText(query, bounds, cb) {
        placesService.textSearch(
            { query, bounds },
            (results, status) => {
                if (
                    status !== google.maps.places.PlacesServiceStatus.OK || !results?.length
                ) {
                    cb(null);
                    return;
                }
                // 只取第一個
                cb(null, results[0]);
            }
        );
    },
};

// 加入trip用
const tripApi = {
    async listTrips() {
        // GET /api/trips/mine -> return [{ tripId, name, daysCount }]
        const trips = await apiFetch("/api/trips/mine");
        // 統一 openTripPicker 欄位
        return (trips || []).map(t => ({
            tripId: t.tripId,
            name: t.name,
            daysCount: t.dayCount,
        }));
    },

    // 不用打後端
    async listDays(tripId, daysCount) {
        const n = Number(daysCount || 0);
        return Array.from({ length: n }, (_, i) => ({
            dayNo: i + 1,
            label: `第${i + 1}天`,
        }));
    },

    // POST /api/wishlist
    async addToWishlist({ place }) {
        const payload = {
            externalPlaceId: place.placeId,
            nameZh: place.name,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            rating: place.rating,
            photosJson: JSON.stringify({ photoUrl: place.photoUrl || null }),
        };

        await apiFetch("/api/spot", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        return { ok: true };
    },


    async addToTripDay({ tripId, dayNo, place }) {
        const payload = {
            tripId,
            dayNo,
            placeId: place.placeId,
            nameZh: place.name,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            rating: place.rating,
            //phone: place.phone,
            photosJson: JSON.stringify({ photoUrl: place.photoUrl || null }),
        };
        await apiFetch("/api/spot", { method: "POST", body: payload });
        return { ok: true };
    }
};

// ====== Utils ======
// 防止注入式html
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
    // 用字元當 key 取值
}

// toast 顯示
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    // 清除未跑完的計時器，應對使用者重複點擊
    clearTimeout(showToast._t);
    // 1.5s 後，清除 toast 的 class="show"
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1500);
}

// 角度轉弧度
function toRad(v) {
    return v * Math.PI / 180;
}

// 計算兩點距離
function distanceMeters(a, b) {
    function getLat(v) { return (typeof v.lat === "function") ? v.lat() : v.lat; }
    function getLng(v) { return (typeof v.lng === "function") ? v.lng() : v.lng; }

    const R = 6378137; // 地球半徑
    const dLat = toRad(getLat(b) - getLat(a));
    const dLng = toRad(getLng(b) - getLng(a));
    const lat1 = toRad(getLat(a));
    const lat2 = toRad(getLat(b));
    // 半正矢公式
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    // Math.asin() -> sin 的反函數 -> sin ^ -1
    return 2 * R * Math.asin(Math.sqrt(x));
}

// 計算並平移地圖(經緯度轉成座標後計算)
// 避免地圖被遮擋時用
function panWithOffset(latLng, offsetX, offsetY) {
    // offset in pixels
    // 取得地圖投影系統 -> 用於轉換經緯度跟世界座標
    const projection = map.getProjection();
    // 取得放大倍率(次方)
    const zoom = map.getZoom();
    // 防止地圖還沒加載好報錯
    if (!projection || zoom == null) {
        // panTo() -> 平滑滑動至選取點
        map.panTo(latLng);
        return;
    }

    // 幾算放大了幾倍
    // Math.pow(a, b) -> a ^ b
    const scale = Math.pow(2, zoom);
    // 經緯度 -> 世界座標
    const worldPoint = projection.fromLatLngToPoint(latLng);
    // 要移動的像素(/scale 換算成世界座標單位)
    const pixelOffset = new google.maps.Point(offsetX / scale, offsetY / scale);
    // 新的座標點
    const newPoint = new google.maps.Point(worldPoint.x + pixelOffset.x, worldPoint.y + pixelOffset.y);
    // 換回經緯度
    const newLatLng = projection.fromPointToLatLng(newPoint);
    map.panTo(newLatLng);
}

// 如果要互斥，寫在這裡，但現在不用

function openFab() { fabExpanded = true; fabWrap.classList.add('expanded'); }
function closeFab() { fabExpanded = false; fabWrap.classList.remove('expanded'); }

function openPanel() {
    panel.classList.add("open");
}

function closePanel() {
    panel.classList.remove("open");
    closeFab();
    currentPlace = null;
    // 清掉selectMarker
    if (selectMarker) { selectMarker.setMap(null); selectMarker = null; }
    // 清掉 hero 背景
    pHero.style.backgroundImage = "";
    pHero.textContent = "目前沒有圖片";
}

// 熱門景點區域
function clearPopularMarkers() {
    // 把地圖上景點裝進popularMarkers(set)裡，並從地圖上清掉
    popularMarkers.forEach(m => m.setMap(null));
    popularMarkers.clear();
}

function openPopular() {
    popular.classList.remove("hidden");
    // 寫在後面邏輯區
    refreshPopular();
}

function closePopular() {
    popular.classList.add("hidden");
    clearPopularMarkers();
}

// ====== Popular logic (viewport) ======
function getNearbyTypeByTab() {
    if (popularCat === "restaurant") return "restaurant";
    if (popularCat === "entertainment") return "tourist_attraction";
    return null;
}

// ====== Place panel fill ======
// 把place的資料抓進panel顯示

// btn 要用的 -> 隨景點狀態改變按鈕外觀
function updateWishlistButtonState(place) {
    const btn = document.getElementById("btnWishlist");
    const placeId = place.place_id || place.placeId;

    if (!btnWishlist) return;

    if (wishlistPlaceIdSet.has(placeId)) {
        btn.textContent = "已在願望清單";
        btn.classList.add("disabled"); // 你可以用 css 控制外觀
        btn.style.pointerEvents = "none";
        btn.style.opacity = "0.6";
    } else {
        btn.textContent = "加入願望清單";
        btn.classList.remove("disabled");
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
    }
}

function fillPanelFromPlaceDetails(place) {
    const dto = toPlaceDetailDTO(place);
    currentPlace = dto;

    updateWishlistButtonState(place);

    pName.textContent = dto.name;
    pRating.textContent = dto.rating ? dto.rating.toFixed(1) : '0.0';
    pAddress.textContent = dto.address;
    pPhone.textContent = dto.phone;

    pHours.textContent = dto.weekdayText ? dto.weekdayText.join('\n') : "未提供";

    if (dto.photoUrl) {
        pHero.style.backgroundImage = `url("${dto.photoUrl}")`;
        pHero.textContent = "";
    }
    else {
        pHero.style.backgroundImage = "";
        pHero.textContent = "未提供圖片";
    }

    // marker 清理
    if (selectMarker) { selectMarker.setMap(null); selectMarker = null; }

    const pos = (dto.lat != null && dto.lng != null) ? { lat: dto.lat, lng: dto.lng } : null;
    if (pos) {
        selectMarker = new google.maps.Marker({
            map,
            position: pos,
            icon: ICON_SELECTED_PIN,
            zIndex: 9999,
        });

        if (window.matchMedia("(min-width: 881px)").matches) {
            panWithOffset(new google.maps.LatLng(pos.lat, pos.lng), -160, 0);
        }
        else {
            map.panTo(pos);
        }
    }

    panel.classList.add("open");
    // closeFab();
}

function openPlaceByPlaceId(placeId) {
    if (!placeId) return;

    api.getPlaceDetails(placeId, (err, place) => {
        // 可做loading畫面
        if (err) {
            console.warn('[getPlaceDetials error]', err);
            showToast(err.message || "讀取景點資訊失敗");
            return;
        }

        if (!place) {
            showToast("讀取景點資訊失敗: 無資料")
            return;
        }
        fillPanelFromPlaceDetails(place);
    });
}

let popularReqSeq = 0;
let popularTimer = null;

function refreshPopular() {
    if (!map) return;

    // debug 版本
    const bounds = map.getBounds();
    if (!bounds) {
        console.debug("[popular] bounds not ready");
        return;
    }

    // debounce : 控制拖曳結束後250ms再查
    clearTimeout(popularTimer);
    popularTimer = setTimeout(() => {
        const seq = ++popularReqSeq;

        const centerLL = bounds.getCenter();
        // debounce 用的計時器 id
        const neLL = bounds.getNorthEast();

        const center = { lat: centerLL.lat(), lng: centerLL.lng() };
        const ne = { lat: neLL.lat(), lng: neLL.lng() };

        // 查詢半徑 radius
        const radius = Math.min(
            5000,
            Math.max(700, Math.floor(distanceMeters(center, ne)))
        );

        const type = getNearbyTypeByTab();

        api.searchPopular({ center, radius, type }, (err, results) => {
            // 忽略過期回應
            // debug 版本
            if (seq !== popularReqSeq) {
                console.debug("[popular stale response ignored", { seq, lastest: popularReqSeq });
                return;
            }

            if (err) {
                console.warn("[searchPopular error]", err);
                showToast(err.message || "熱門景點讀取失敗");
                return;
            }

            // 確定 safe 是陣列
            const safe = Array.isArray(results) ? results.map(toPopularDTO) : [];
            // debug 版本
            console.debug("[popular] raw results count", safe.length);

            // debug 版本
            // 統計：每一層 filter 篩掉多少
            const withLatLng = safe.filter(p => p?.placeId && typeof p.lat === "number" && typeof p.lng === "number");
            console.debug("[popular] with placeId+latlng", withLatLng.length);

            const inBounds = withLatLng.filter(p => bounds.contains(new google.maps.LatLng(p.lat, p.lng)));
            console.debug("[popular] in bounds", inBounds.length);

            const passRating = inBounds.filter(p => (p.rating || 0) >= 4.0);
            console.debug("[popular] pass rating >= 3.7", passRating.length)


            const list = safe
                .filter(p => p?.placeId && typeof p.lat === "number" && typeof p.lng === "number")
                .filter(p => bounds.contains(new google.maps.LatLng(p.lat, p.lng)))
                .filter(p => (p.rating || 0) >= 4.0)
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                .slice(0, 12);
            // 排序 -> 篩選前12個

            renderPopularCards(list);
            renderPopularMarkers(list);
        });
    }, 250);
}

function renderPopularMarkers(list) {
    clearPopularMarkers();

    list.forEach(p => {
        const m = new google.maps.Marker({
            map,
            position: { lat: p.lat, lng: p.lng },
            icon: ICON_STAR,
            title: p.name,
        });
        m.addListener('click', () => openPlaceByPlaceId(p.placeId));
        popularMarkers.set(p.placeId, m);
    })
}

// 加熱門卡片
function renderPopularCards(list) {
    cardsRow.innerHTML = "";

    list.forEach(p => {
        const ratingText = typeof p.rating === "number" ? p.rating.toFixed(1) : "-";
        const el = document.createElement("div");
        el.className = "pCard";
        el.innerHTML = `
        <h4>${escapeHtml(p.name)}</h4>
        <div class="rate">評分: <b>${ratingText}</b> ⭐</div>
        <div class="thumb"></div>
        `;
        // 點卡片時的動作
        el.addEventListener('click', () => openPlaceByPlaceId(p.placeId));
        // 將卡片加入DOM
        cardsRow.appendChild(el);

        if (p.photoUrl) {
            el.querySelector('.thumb').style.backgroundImage = `url("${p.photoUrl}")`;
        }
    });
}

// ====== Search ======
function doSearch() {
    const q = (searchInput.value || "").trim();
    if (!q) return showToast("請輸入景點名稱");

    api.searchText(q, map.getBounds(), (err, place) => {
        if (err || !place) {
            showToast("找不到符合的景點");
            return;
        }
        openPlaceByPlaceId(place.place_id);
    });
}

// ====== Modal flows ======
// openTripPicker(mode) 取代原本的 makeTripList(mode)
// 同一支流程，用 mode 決定行為 -> trip or wishlist
async function openTripPicker(mode) {
    if (!currentPlace) return showToast("請先選擇景點");

    let trips = [];
    try {
        trips = await tripApi.listTrips(); // 後端化點
    }
    catch (err) {
        console.error(err);
        return showToast(err?.message || "讀取行程失敗");
    }

    // 沒行程
    if (!Array.isArray(trips) || trips.length === 0) {
        const items = [
            {
                text: "建立行程",
                chip: "NEW",
                onClick: () => {
                    closeModal(); // 先關掉 modal，避免疊一層 overlay
                    window.location.href = "/Spot/Index";
                }
            }
        ];
        openModal("目前沒有行程", items);
        return;
    }

    // 有行程
    const items = trips.map(t => ({
        text: t.name,
        chip: mode === "wishlist" ? "LIST" : null,
        onClick: async () => {
            if (!currentPlace) return showToast("請先選擇景點");

            try {
                if (mode == "wishlist") {
                    const r = await tripApi.addToWishlist({ place: currentPlace });
                    if (r?.ok) showToast(`已將「${currentPlace.name}」加入願望清單`);
                    else showToast(`加入失敗`);
                    closeModal();
                }
                else {
                    // 進入選天數
                    await openDayPicker(t);
                }
            }
            catch (err) {
                console.error(err);
                showToast(err?.message || "操作失敗");
            }
        }
    }));
    openModal("選擇行程", items);
}







// openDayPicker(trip) 取代 makeDayList(tripName)
async function openDayPicker(trip) {
    const days = await tripApi.listDays(trip.tripId, trip.daysCount);
    const items = days.map(d => ({
        text: d.label,
        chip: "DAY",
        onClick: async () => {
            if (!currentPlace) return showToast("請先選擇景點");

            const r = await tripApi.addToTripDay({
                tripId: trip.tripId,
                dayNo: d.dayNo,
                place: currentPlace
            });

            if (r?.ok) showToast(`已將「${currentPlace.name}」加入 ${trip.name} / ${d.label}`);
            else showToast('加入失敗');

            closeModal();
        }
    }));
    openModal(`選擇天數 - ${trip.name}`, items);
}

// 打開彈出視窗
function openModal(title, items) {
    mTitle.textContent = title;
    modalList.innerHTML = "";
    items.forEach(it => {
        const li = document.createElement("div");
        li.className = "listItem";
        li.innerHTML = `
        <span>${escapeHtml(it.text)}</span>
        ${it.chip ? `<span class="chip">${escapeHtml(it.chip)}</span>` : `<span style="opacity:.6"></span>`}
        `;
        li.addEventListener("click", it.onClick);
        modalList.appendChild(li);
    });
    overlay.classList.add("show");
}

// 關閉彈出視窗
function closeModal() {
    overlay.classList.remove("show");
}

// ====== Wire UI (events) ======
function wireUI() {
    //tabs
    document.querySelectorAll(".tab").forEach(t => {
        t.addEventListener('click', () => {
            document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
            t.classList.add("active");
            popularCat = t.dataset.cat;
            if (!popular.classList.contains("hidden")) refreshPopular();
        });
    });


    // popular close / reopen 綁定點擊事件
    popularClose.addEventListener('click', closePopular);
    popularReopen.addEventListener('click', openPopular);

    // panel close
    panelClose.addEventListener('click', closePanel);

    // fab
    fab.addEventListener('click', (e) => {
        // 阻止事件冒泡
        e.stopPropagation();
        if (!panel.classList.contains('open')) return;
        fabExpanded ? closeFab() : openFab();
    })

    // click outside -> close fab / close modal by clicking overlay
    document.addEventListener('click', (e) => {
        const withinPanel = panel.contains(e.target);
        if (panel.classList.contains("open") && !withinPanel) closeFab();
        if (overlay.classList.contains("show") && e.target === overlay) closeModal();
    });

    // 綁定 modal close btn
    modalClose.addEventListener('click', closeModal);

    // actions
    // 綁定 wishlist btn
    // btnWishlist.addEventListener('click', () => {
    //     if(!currentPlace) return;
    //     showToast(`已將「${currentPlace.name}」加入願望清單`);
    //     closeFab();
    // });

    btnWishlist.addEventListener('click', async () => {
        if (!currentPlace) return;
        try {
            const r = await tripApi.addToWishlist({ place: currentPlace });
            if (r?.ok) showToast(`已將「${currentPlace.name}」加入願望清單`);
            else showToast(r?.message || "加入失敗");
        } catch (e) {
            showToast(e.message || "加入失敗");
        }
        closeFab();
    });



    // 綁定 trip btn
    btnTrip.addEventListener('click', () => {
        if (!currentPlace) return;
        openTripPicker("trip");
        closeFab();
    });











    // search
    // 綁定 search btn
    searchBtn.addEventListener('click', doSearch);
    // 監聽鍵盤是否按下 Enter => 查詢
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === "Enter") doSearch();
    });

    // 綁定 userbtn
    // userBtn.addEventListener('click', () => showToast('使用者頁（示意）'));

    // 熱門卡片滾動行為
    // 只在桌機使用
    const isDesktop = window.matchMedia("(pointer: fine)").matches;

    if (isDesktop) {
        cardsRow.addEventListener("wheel", (e) => {
            if (popular.classList.contains("hidden")) return;
            // 阻止瀏覽器默認行為
            e.preventDefault();
            cardsRow.scrollLeft += e.deltaY;
        }, { passive: false });
    }
}

// ====== Google callback ======
function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 24.1867, lng: 120.6182 },
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullScreenControl: false,
        clickableIcons: true,
        gestureHandling: "greedy", // 滾輪直接縮放
    });

    placesService = new google.maps.places.PlacesService(map);

    // icons must be created AFTER google is ready
    ICON_SELECTED_PIN = {
        path: "",
        fillColor: "#E74C3C",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 2,
        scale: 1.4,
        anchor: new google.maps.Point(12, 22),
    };
    ICON_STAR = {
        path: "M12 2l2.9 6.4L22 9.3l-5 4.7 1.3 7L12 17.9 5.7 21 7 14 2 9.3l7.1-.9L12 2z",
        fillColor: "rgba(255,105,180,0.75)",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 2,
        scale: 1.4,
        anchor: new google.maps.Point(12, 12),
    };

    wireUI();
    openPopular();

    // map moved -> refresh popular when visible
    map.addListener('idle', () => {
        if (!popular.classList.contains("hidden")) refreshPopular();
    });

    // 點到原生 POI 才會有 placeId
    map.addListener("click", (e) => {
        if (e.placeId) {
            e.stop(); // 阻止 Google 跳出預設視窗
            openPlaceByPlaceId(e.placeId);
            return;
        }
    });
}

window.initMap = initMap;

