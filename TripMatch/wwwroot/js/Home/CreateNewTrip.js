// --- Google Places Autocomplete Logic for Home Page ---

let autocompleteService, placesService, sessionToken, debounceTimer;
let selectedPlaceIds = new Set(); // 儲存選中的 ID
let searchInput, inputWrapper, suggestionsBox;

// 初始化 Google Map (由 API callback 呼叫)
function initMap() {
    try {
        searchInput = document.getElementById('search-input');
        inputWrapper = document.getElementById('input-wrapper');
        suggestionsBox = document.getElementById('suggestions');

        if (!searchInput || !suggestionsBox) return; // 防止找不到元素報錯

        // 初始化 Service
        const { AutocompleteService, AutocompleteSessionToken } = google.maps.places;
        autocompleteService = new AutocompleteService();
        sessionToken = new AutocompleteSessionToken();

        initSearchEvents();
        console.log("Google API initialized on Home");
    } catch (e) {
        console.error("Google API Init Error:", e);
    }
}
// 確保全域可訪問
window.initMap = initMap;

function initSearchEvents() {
    // 點擊 wrapper 聚焦 input
    inputWrapper.onclick = () => searchInput?.focus();

    // 輸入監聽
    searchInput.addEventListener('input', () => {
        const query = searchInput.value;
        clearTimeout(debounceTimer);
        if (!query.trim()) return hideSuggestions();
        debounceTimer = setTimeout(() => fetchBestMatch(query), 300);
    });

    // 失去焦點 (延遲以允許點擊選單)
    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            // 注意：這裡不一定要清空 value，看你想保留文字還是強制變成 chip
            if (!selectedPlaceIds.size && searchInput.value) {
                // 如果沒選 chip 但有字，可以保留或清空，視需求而定
            }
            hideSuggestions();
        }, 250);
    });
}

function fetchBestMatch(input) {
    if (!autocompleteService) return;

    const request = {
        input: input,
        sessionToken: sessionToken,
        types: ['(regions)'], // 限制搜尋範圍為地區
        language: 'zh-TW'
    };

    autocompleteService.getPlacePredictions(request, (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions?.length > 0) {
            // 過濾並顯示前 5 筆
            const filtered = predictions.filter(p =>
                p.types?.includes('country') ||
                p.types?.includes('administrative_area_level_1') ||
                p.types?.includes('locality')
            );
            renderSuggestions(filtered.slice(0, 5));
        } else {
            hideSuggestions();
        }
    });
}

function renderSuggestions(items) {
    if (!items.length) return hideSuggestions();

    suggestionsBox.innerHTML = items.map((item, index) => `
        <div class="suggestion-item list-group-item list-group-item-action" 
             style="cursor:pointer; padding: 10px;"
             onclick="selectItemAtIndex(${index})"> <strong>${item.structured_formatting?.main_text}</strong>
            <small class="text-muted d-block">
                ${item.structured_formatting?.secondary_text ? item.structured_formatting.secondary_text : ""}
            </small>
        </div>
    `).join('');

    // 將 items 暫存到 DOM 元素上以便點擊時讀取，或使用閉包
    suggestionsBox.currentItems = items;
    suggestionsBox.style.display = 'block';
}

// 輔助函式：讓 HTML onclick 呼叫
window.selectItemAtIndex = function (index) {
    const items = document.getElementById('suggestions').currentItems;
    if (items && items[index]) {
        selectItem(items[index]);
    }
};

function selectItem(item) {
    if (!item || !item.place_id) return;

    if (selectedPlaceIds.has(item.place_id)) {
        searchInput.value = "";
        hideSuggestions();
        return;
    }

    addChip(item.place_id, item.structured_formatting?.main_text);
    selectedPlaceIds.add(item.place_id);

    searchInput.value = ""; // 清空輸入框
    hideSuggestions();

    // 更新 Session Token
    sessionToken = new google.maps.places.AutocompleteSessionToken();
}

function addChip(id, name) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    // 移除可能干擾的 cssText，改用 class 或是更簡潔的 inline style
    chip.style.cssText = 'background: #e0f7fa; color: #006064; padding: 2px 8px; border-radius: 12px; font-size: 14px; display: flex; align-items: center; white-space: nowrap; margin: 2px 0;';

    chip.innerHTML = `<span>${name}</span><span style="cursor:pointer; margin-left:5px; font-weight:bold;">&times;</span>`;

    chip.querySelector('span:last-child').onclick = (e) => {
        e.stopPropagation();
        chip.remove();
        selectedPlaceIds.delete(id);
    };

    // ✨ 關鍵：這裡一定要抓 chip-container
    const chipContainer = document.getElementById('chip-container');
    if (chipContainer && searchInput) {
        // 插入在 input 之前
        chipContainer.insertBefore(chip, searchInput);
    }
}

function hideSuggestions() {
    suggestionsBox.style.display = 'none';
}

// 修改點擊事件，傳入事件參數 e
document.getElementById('mainActionButton')?.addEventListener('click', function (e) {
    // ✨ 關鍵：阻止 <a> 標籤直接跳轉到 Match/Index
    e.preventDefault();
    saveHomeTrip();
});

function saveHomeTrip() {
    const btn = document.getElementById('mainActionButton');
    // 先備份原始文字與屬性
    const originalText = btn.innerText;
    const isAnchor = btn.tagName === 'A';

    // 1. 蒐集資料 (保持不變)
    const tripData = {
        title: document.getElementById('title')?.value?.trim(),
        placeIds: Array.from(selectedPlaceIds),
        startDate: document.getElementById('startDate')?.value,
        endDate: document.getElementById('endDate')?.value
    };

    // 2. 基本驗證 (保持不變)
    if (!tripData.title) { alert("請輸入行程名稱"); return; }
    if (tripData.placeIds.length === 0) { alert("請至少選擇一個目的地"); return; }

    // 3. 發送 AJAX
    // 注意：<a> 標籤沒有 disabled 屬性，我們用 pointer-events 模擬
    btn.style.pointerEvents = 'none';
    btn.innerText = "處理中...";

    $.ajax({
        url: '/api/TripApi/Create',
        type: 'post',
        contentType: 'application/json',
        dataType: 'json', // 強制解析 JSON
        data: JSON.stringify(tripData),
        success: function (res) {
            console.log("主頁行程建立成功，準備跳轉 ID:", res.id);
            // 這裡會成功跳轉，因為預設行為已被阻止
            window.location.href = `/Trip/Edit/${res.id}`;
        },
        error: function (xhr, status, errorThrown) {
            // 修正：將 btnSave 改回 btn
            btn.style.pointerEvents = 'auto';
            btn.innerText = originalText;

            console.error("--- 建立行程失敗 ---");
            console.log("回傳內容:", xhr.responseText);

            const msg = xhr.responseJSON ? xhr.responseJSON.message : "建立失敗";
            alert("建立失敗：" + msg);
        }
    });
}