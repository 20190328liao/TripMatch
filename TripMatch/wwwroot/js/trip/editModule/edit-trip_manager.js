let map, placesService, autocomplete;
const tripId = document.querySelector('input[name="__Model"]').value; // 獲取 Razor 傳入的 Model (tripId)

export async function initEditPage() {
    initMap();
    await loadItinerary(); // 初始化加載行程
}

// 獲取並渲染行程
async function loadItinerary() {
    try {
        const response = await fetch(`/api/TripApi/GetTripDetails/${tripId}`);
        const data = await response.json();
        renderTimeline(data.days);
    } catch (err) { console.error("加載失敗", err); }
}

function renderTimeline(days) {
    const container = document.getElementById('place-list');
    container.innerHTML = days.map(day => `
        <div class="day-section">
            <div class="day-title">${day.weekDay}, ${day.dateStr}</div>
            <div class="timeline-container">
                ${day.items.map(item => `
                    <div class="itinerary-card">
                        <div class="timeline-dot" style="border-color: ${getCatColor(item.categoryId)}">
                            <i class="bi bi-geo-alt-fill" style="color: ${getCatColor(item.categoryId)}"></i>
                        </div>
                        <div class="d-flex justify-content-between">
                            <div>
                                <div class="small text-primary fw-bold">${item.time || '未定時'}</div>
                                <div class="fw-bold">${item.name}</div>
                            </div>
                            ${item.imageUrl ? `<img src="${item.imageUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:5px;">` : ''}
                        </div>
                    </div>
                `).join('')}
                <button class="btn btn-sm btn-outline-secondary w-100" onclick="focusSearch(${day.dayNumber})">
                    + 添加地點
                </button>
            </div>
        </div>
    `).join('');
}

// 分類顏色映射
function getCatColor(id) {
    const colors = { 1: '#FF5722', 2: '#4CAF50', 3: '#9C27B0', 4: '#2196F3' };
    return colors[id] || '#6c757d';
}

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 25.0339, lng: 121.5644 },
        zoom: 13,
        mapTypeControl: false
    });

    const input = document.getElementById("place-search-input");
    autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.addListener("place_changed", onPlaceSelected);
}

// 當搜尋到地點後執行儲存
async function onPlaceSelected() {
    const place = autocomplete.getPlace();
    if (!place.place_id) return;

    const dto = {
        TripId: tripId,
        DayNumber: 1, // 預設第一天，實務上可透過全域變數記錄點擊的按鈕
        GooglePlaceId: place.place_id,
        Name: place.name,
        ImageUrl: place.photos ? place.photos[0].getUrl() : null
    };

    const res = await fetch('/api/TripApi/AddItem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto)
    });

    if (res.ok) await loadItinerary(); // 儲存成功後刷新左側面板
}

window.onload = initPage;