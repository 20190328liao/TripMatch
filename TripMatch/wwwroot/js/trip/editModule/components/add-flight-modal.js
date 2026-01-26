import { TripApi } from '../api/trip-api.js';
export class AddFlightModal {
    constructor() {
        this.renderHtml();
        this.modalEl = document.getElementById('flightFillModal');
        this.bsModal = new bootstrap.Modal(this.modalEl);
        this.tripId = null;
        this.onSuccess = null;
        this.storeData = {}; // 暫存資料

        // 自動補全用的防抖定時器
        this.autocompleteTimeout = null;

        this.bindEvents();
    }

    renderHtml() {
        if (document.getElementById('flightFillModal')) return;

        // 整合 flight-3-2.html 的樣式與自動補全容器
        const html = `
        <style>
            .autocomplete-results { 
                list-style: none; padding: 0; margin-top: 2px; 
                background: white; border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                position: absolute; width: 100%; z-index: 1060;
                max-height: 250px; overflow-y: auto;
            }
            .autocomplete-results li { 
                padding: 10px 15px; cursor: pointer; border-bottom: 1px solid #eee; 
                display: flex; align-items: center; justify-content: space-between; 
            }
            .autocomplete-results li:hover { background-color: #f8f9fa; }
            .ac-iata { font-weight: bold; color: #eb6123; font-family: monospace; margin-right: 10px; }
            .ac-info { display: flex; flex-direction: column; line-height: 1.2; }
            .ac-name { font-size: 0.9em; color: #333; font-weight: 500; }
            .ac-country { font-size: 0.75em; color: #777; }
            .ac-type { font-size: 0.7em; padding: 2px 5px; background: #eee; border-radius: 4px; color: #666; }
        </style>

        <div class="modal fade" id="flightFillModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content shadow-lg border-0" style="border-radius: 16px;">
                    <div class="modal-header border-0 pb-0">
                        <h5 class="modal-title fw-bold">✈️ 新增航班紀錄</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4">
                        <div id="flight-input-section">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">出發日期</label>
                                <input type="date" id="f-date" class="form-control">
                            </div>
                            <div class="row g-2 mb-3">
                                <div class="col-6 position-relative">
                                    <label class="form-label small fw-bold">出發機場 (IATA)</label>
                                    <input type="text" id="f-dep" class="form-control text-uppercase" placeholder="TPE" maxlength="3" autocomplete="off">
                                    <ul id="f-dep-results" class="autocomplete-results d-none"></ul>
                                </div>
                                <div class="col-6 position-relative">
                                    <label class="form-label small fw-bold">抵達機場 (IATA)</label>
                                    <input type="text" id="f-arr" class="form-control text-uppercase" placeholder="NRT" maxlength="3" autocomplete="off">
                                    <ul id="f-arr-results" class="autocomplete-results d-none"></ul>
                                </div>
                            </div>
                            <div class="mb-4">
                                <label class="form-label small fw-bold">航班編號</label>
                                <input type="text" id="f-no" class="form-control text-uppercase" placeholder="例如: BR198">
                            </div>
                            <button id="btn-search-flight" class="btn btn-primary w-100 py-2 fw-bold">搜尋航班資訊</button>
                        </div>

                        <div id="flight-loading" class="text-center py-4 d-none">
                            <div class="spinner-border text-primary mb-2"></div>
                            <div class="text-muted small">同步 AirLabs 數據中...</div>
                        </div>

                        <div id="flight-preview-section" class="d-none border rounded p-3 mt-3 bg-light">
                            <div class="d-flex justify-content-between mb-3">
                                <span class="badge bg-primary" id="p-airline">--</span>
                                <span class="fw-bold" id="p-flightNo">--</span>
                            </div>
                            <div class="row text-center align-items-center">
                                <div class="col-5">
                                    <div class="h4 mb-0" id="p-depTime">--:--</div>
                                    <div class="text-primary fw-bold" id="p-depIata">--</div>
                                </div>
                                <div class="col-2 text-muted">→</div>
                                <div class="col-5">
                                    <div class="h4 mb-0" id="p-arrTime">--:--</div>
                                    <div class="text-primary fw-bold" id="p-arrIata">--</div>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-top gap-2 d-flex flex-column">
                                <button class="btn btn-success w-100" id="btn-save-flight">確認並存入行程</button>
                                <button class="btn btn-link w-100 btn-sm text-decoration-none" id="btn-back-search">重新輸入</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    bindEvents() {
        // 搜尋按鈕
        document.getElementById('btn-search-flight').addEventListener('click', () => this.search());

        // 重新輸入
        document.getElementById('btn-back-search').addEventListener('click', () => {
            this.toggleView('input');
        });

        // 儲存
        document.getElementById('btn-save-flight').addEventListener('click', () => this.save());

        // 機場自動補全事件
        const depInput = document.getElementById('f-dep');
        const arrInput = document.getElementById('f-arr');

        depInput.addEventListener('input', (e) => this.handleAutocomplete(e, 'f-dep-results'));
        arrInput.addEventListener('input', (e) => this.handleAutocomplete(e, 'f-arr-results'));

        // 點擊外部關閉選單
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.position-relative')) {
                document.querySelectorAll('.autocomplete-results').forEach(el => el.classList.add('d-none'));
            }
        });

        // Modal 關閉時重置
        this.modalEl.addEventListener('hidden.bs.modal', () => {
            this.toggleView('input');
            ['f-date', 'f-dep', 'f-arr', 'f-no'].forEach(id => {
                document.getElementById(id).value = '';
            });
            document.querySelectorAll('.autocomplete-results').forEach(el => el.innerHTML = '');
        });
    }

    // 自動補全邏輯處理 (擷取自 flight-3-2.html 並優化)
    handleAutocomplete(event, resultListId) {
        const query = event.target.value.trim();
        const resultsList = document.getElementById(resultListId);

        clearTimeout(this.autocompleteTimeout);

        if (query.length < 2) {
            resultsList.classList.add('d-none');
            return;
        }

        this.autocompleteTimeout = setTimeout(async () => {
            // 使用 Travelpayouts API
            const url = `https://autocomplete.travelpayouts.com/places2?term=${encodeURIComponent(query)}&locale=en&types[]=city&types[]=airport`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                this.renderAutocompleteResults(data, resultsList, event.target);
            } catch (error) {
                console.error('Autocomplete API error:', error);
            }
        }, 300);
    }

    renderAutocompleteResults(data, resultsList, inputEl) {
        if (data.length === 0) {
            resultsList.innerHTML = '<li class="text-muted small">查無結果</li>';
            resultsList.classList.remove('d-none');
            return;
        }

        resultsList.innerHTML = data.map(item => {
            const typeLabel = item.type === 'city' ? '城市' : '機場';
            return `
                <li data-code="${item.code}">
                    <div style="display: flex; align-items: center;">
                        <span class="ac-iata">${item.code}</span>
                        <div class="ac-info">
                            <span class="ac-name">${item.name}</span>
                            <span class="ac-country">${item.country_name || ''}</span>
                        </div>
                    </div>
                    <span class="ac-type">${typeLabel}</span>
                </li>
            `;
        }).join('');

        resultsList.classList.remove('d-none');

        // 監聽選取事件
        resultsList.querySelectorAll('li').forEach(li => {
            li.onclick = (e) => {
                e.stopPropagation();
                inputEl.value = li.dataset.code;
                resultsList.classList.add('d-none');
            };
        });
    }

    open(tripId, callback) {
        this.tripId = tripId;
        this.onSuccess = callback;
        this.bsModal.show();
    }

    toggleView(view) {
        const sections = ['flight-input-section', 'flight-loading', 'flight-preview-section'];
        sections.forEach(id => document.getElementById(id).classList.add('d-none'));

        if (view === 'input') document.getElementById('flight-input-section').classList.remove('d-none');
        if (view === 'loading') document.getElementById('flight-loading').classList.remove('d-none');
        if (view === 'preview') document.getElementById('flight-preview-section').classList.remove('d-none');
    }

    async search() {
        const date = document.getElementById('f-date').value;
        const dep = document.getElementById('f-dep').value.toUpperCase();
        const arr = document.getElementById('f-arr').value.toUpperCase();
        const fNo = document.getElementById('f-no').value.toUpperCase().replace(/\s+/g, '');

        if (!date || !dep || !arr || !fNo) return alert("請填寫完整資訊");

        this.toggleView('loading');

        try {
            const routeRes = await TripApi.searchFlightRoute(dep, arr);
            const matched = routeRes.response.find(r =>
                (r.airline_iata + r.flight_number) === fNo ||
                (r.airline_icao + r.flight_number) === fNo
            );

            if (!matched) throw new Error("找不到此航班，請檢查代碼。");

            const flightRes = await TripApi.searchFlightDetail(fNo);
            const d = flightRes.response || {};

            const actualDate = this.patchFlightData(matched, date);

            this.storeData = {
                tripId: parseInt(this.tripId),
                carrier: d.airline_name || matched.airline_name || "未知航空",
                flightNumber: fNo,
                depTimeLocal: actualDate.actualDepLocal,
                depTimeUtc: actualDate.actualDepUtc,
                arrTimeLocal: actualDate.actualArrLocal,
                arrTimeUtc: actualDate.actualArrUtc,
                fromAirport: dep,
                toAirport: arr,
            };

            this.renderPreview(this.storeData);
            this.toggleView('preview');

        } catch (err) {
            alert(err.message || "查詢失敗");
            this.toggleView('input');
        }
    }

    patchFlightData(apiData, userSelectedDate) {
        const toYMD = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const safeDate = (str) => new Date(str.replace(/-/g, '/'));

        const parseMins = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const depTimeStr = apiData.dep_time || "00:00";
        const arrTimeStr = apiData.arr_time || "00:00";
        const depUtcStr = apiData.dep_time_utc || "00:00";
        const arrUtcStr = apiData.arr_time_utc || "00:00";

        let dayDiff = 0;
        const depUtcMins = parseMins(depUtcStr);
        const arrUtcMins = parseMins(arrUtcStr);

        if (arrUtcMins < depUtcMins) {
            dayDiff = 1;
        }

        const actualDepLocal = `${userSelectedDate} ${depTimeStr}`;
        const arrivalDateObj = safeDate(userSelectedDate);
        arrivalDateObj.setDate(arrivalDateObj.getDate() + dayDiff);
        const actualArrLocal = `${toYMD(arrivalDateObj)} ${arrTimeStr}`;

        const refDate = "2000/01/01";
        const refDepLocalObj = new Date(`${refDate} ${depTimeStr}`);
        const refDepUtcObj = new Date(`${refDate} ${depUtcStr}`);
        const depOffsetMs = refDepLocalObj - refDepUtcObj;

        const finalDepUtc = new Date(safeDate(actualDepLocal).getTime() - depOffsetMs);
        let finalArrUtc;

        if (apiData.duration) {
            finalArrUtc = new Date(finalDepUtc.getTime() + (apiData.duration * 60 * 1000));
        } else {
            finalArrUtc = new Date(finalDepUtc.getTime() + (3600 * 1000));
        }

        return {
            actualDepLocal,
            actualArrLocal,
            actualDepUtc: finalDepUtc.toISOString(),
            actualArrUtc: finalArrUtc.toISOString()
        };
    }

    renderPreview(data) {
        document.getElementById('p-airline').innerText = data.carrier;
        document.getElementById('p-flightNo').innerText = data.flightNumber;
        document.getElementById('p-depTime').innerText = data.depTimeLocal;
        document.getElementById('p-arrTime').innerText = data.arrTimeLocal;
        document.getElementById('p-depIata').innerText = data.fromAirport;
        document.getElementById('p-arrIata').innerText = data.toAirport;
    }

    async save() {
        try {
            // 這裡會等待 API 完成
            await TripApi.addFlight(this.storeData);

            // 走到這一行代表成功了
            this.bsModal.hide();
            if (this.onSuccess) this.onSuccess();

        } catch (msg) {
            // 這裡統一處理「要怎麼讓使用者知道失敗了」
            alert("儲存失敗: " + msg);
        }
    }
}