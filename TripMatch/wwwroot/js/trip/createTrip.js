// 1. 全域變數定義
let autocompleteService, placesService, sessionToken, debounceTimer;
let selectedPlaceIds = new Set();
let firstPrediction = null;
let btnSave, searchInput, inputWrapper, suggestionsBox;

// 2. Google API 載入後的進入點 (由 HTML loader 的 callback 呼叫)
async function initMap() {
    try {
        // A. 初始化 DOM 元素
        btnSave = document.querySelector("#btnSave");
        searchInput = document.getElementById('search-input');
        inputWrapper = document.getElementById('input-wrapper');
        suggestionsBox = document.getElementById('suggestions');

        // B. 初始化 Google 服務庫
        const { AutocompleteService, AutocompleteSessionToken } = await google.maps.importLibrary("places");

        autocompleteService = new AutocompleteService();
        sessionToken = new AutocompleteSessionToken();

        // PlacesService 需要一個 HTML 元素來初始化（在 places library 之後）
        if (google?.maps?.places?.PlacesService) {
            placesService = new google.maps.places.PlacesService(document.createElement('div'));
        }

        // C. 綁定 UI 事件
        initEvents();

        console.log("Google API 初始化成功");
    } catch (e) {
        console.error("Google API 初始化失敗:", e);
        alert("Google 地圖服務載入失敗，請稍後再試或聯絡管理員。");
    }
}

// 確保 callback 能被呼叫（若 script 使用 callback=initMap）
window.initMap = initMap;

// 3. 集中管理所有事件綁定
function initEvents() {
    if (btnSave) btnSave.addEventListener('click', SaveDataToFile);

    if (inputWrapper) inputWrapper.onclick = () => searchInput?.focus();

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value;
            clearTimeout(debounceTimer);
            if (!query.trim()) return hideSuggestions();
            debounceTimer = setTimeout(() => fetchBestMatch(query), 300);
        });

        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                searchInput.value = "";
                hideSuggestions();
            }, 250);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && firstPrediction) {
                e.preventDefault();
                selectItem(firstPrediction);
            }
        });
    }
}

// 4. 搜尋功能邏輯
function fetchBestMatch(input) {
    if (!autocompleteService || !sessionToken) {
        console.warn("Autocomplete 尚未初始化");
        return;
    }

    const request = {
        input: input,
        sessionToken: sessionToken,
        types: ['(regions)'],
        language: 'zh-TW'
    };

    autocompleteService.getPlacePredictions(request, (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions?.length > 0) {
            const filtered = predictions.filter(p =>
                p.types?.includes('country') ||
                p.types?.includes('administrative_area_level_1') ||
                p.types?.includes('locality')
            );

            if (filtered.length > 0) {
                firstPrediction = filtered[0];
                renderSuggestions(filtered.slice(0, 5));
            } else {
                hideSuggestions();
            }
        } else {
            // 顯示常見錯誤訊息
            if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
                console.warn("Places API 超過配額限制");
            } else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
                console.warn("請求被拒絕（可能是 API Key 限制或未啟用 Places API）");
            }
            hideSuggestions();
        }
    });
}

function renderSuggestions(items) {
    suggestionsBox.innerHTML = items.map((item) => `
        <div class="suggestion-item list-group-item list-group-item-action d-flex align-items-center justify-content-between" style="cursor:pointer;">
            <div class="text-content">
                <div class="main-text fw-bold">${item.structured_formatting?.main_text ?? ''}</div>
                <div class="secondary-text small text-muted">${item.structured_formatting?.secondary_text ?? ''}</div>
            </div>
            <span class="badge bg-light text-dark border">${getBadgeText(item.types ?? [])}</span>
        </div>
    `).join('');

    document.querySelectorAll('.suggestion-item').forEach((el, idx) => {
        el.onmousedown = () => selectItem(items[idx]);
    });
    suggestionsBox.style.display = 'block';
}

function getBadgeText(types) {
    if (types.includes('country')) return '國家';
    if (types.includes('administrative_area_level_1')) return '省份/州';
    return '城市';
}

function selectItem(item) {
    if (!item || !item.place_id) return;

    if (selectedPlaceIds.has(item.place_id)) {
        searchInput.value = "";
        return hideSuggestions();
    }

    addChip(item.place_id, item.structured_formatting?.main_text ?? '');
    selectedPlaceIds.add(item.place_id);
    searchInput.value = "";
    hideSuggestions();

    // 更新 Session Token：完成一次選取後重建
    if (google?.maps?.places?.AutocompleteSessionToken) {
        sessionToken = new google.maps.places.AutocompleteSessionToken();
    }
}

function addChip(id, name) {
    const chip = document.createElement('div');
    chip.className = 'chip bg-primary text-white p-1 px-2 rounded d-flex align-items-center gap-1';
    chip.innerHTML = `<span>${name}</span><span class="close-btn" style="cursor:pointer;">&times;</span>`;

    chip.querySelector('.close-btn').onclick = (e) => {
        e.stopPropagation();
        chip.remove();
        selectedPlaceIds.delete(id);
    };

    inputWrapper.insertBefore(chip, searchInput);
}

function hideSuggestions() {
    if (suggestionsBox) suggestionsBox.style.display = 'none';
    firstPrediction = null;
}

// 5. 儲存功能
function SaveDataToFile() {
    if (!btnSave) return;
    btnSave.disabled = true;
    const originalText = btnSave.innerText;
    btnSave.innerText = "儲存中...";

    const tripData = {
        title: document.querySelector('#title')?.value?.trim(),
        placeIds: Array.from(selectedPlaceIds),
        startDate: document.querySelector('#startDate')?.value,
        endDate: document.querySelector('#endDate')?.value
    };

    if (!tripData.title || tripData.placeIds.length === 0) {
        alert("請輸入行程名稱並選擇目的地");
        btnSave.disabled = false;
        btnSave.innerText = originalText;
        return;
    }

    if(new Date(tripData.startDate) > new Date(tripData.endDate)) {
        alert("結束日期必須在開始日期之後");
        btnSave.disabled = false;
        btnSave.innerText = originalText;
        return;
    }

    $.ajax({
        url: '/api/TripApi/Create',
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify(tripData),
        success: function (res) {
            alert('行程建立成功');
            window.location.href = `/Trip/Edit/${res.id}`;
        },
        error: function (xhr) {
            btnSave.disabled = false;
            btnSave.innerText = originalText;
            const msg = xhr.responseJSON ? xhr.responseJSON.message : "建立失敗";
            alert(msg);
        }
    });
}