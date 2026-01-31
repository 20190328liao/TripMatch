import { TripApi } from '../api/trip-api.js';

export class AddFlightModal {
    constructor() {
        this.renderHtml();
        this.modalEl = document.getElementById('flightFillModal');
        this.bsModal = new bootstrap.Modal(this.modalEl);
        this.tripId = null;
        this.onSuccess = null;
        this.storeDataList = []; // 改為陣列，儲存去程+回程
        this.autocompleteTimeout = null;
        this.bindEvents();
    }

    renderHtml() {
        if (document.getElementById('flightFillModal')) return;

        // ★ 新增：回程開關與輸入欄位 HTML
        const html = `
        <style>
            .autocomplete-results { list-style: none; padding: 0; margin-top: 2px; background: white; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); position: absolute; width: 100%; z-index: 1060; max-height: 250px; overflow-y: auto; }
            .autocomplete-results li { padding: 10px 15px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; align-items: center; justify-content: space-between; }
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

                            <hr />

                            <div class="mb-3">
                                <h6 class="text-primary fw-bold">去程資訊</h6>
                                <div class="row g-2">
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">去程日期</label>
                                        <input type="date" id="f-date" class="form-control">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">去程班號</label>
                                        <input type="text" id="f-no" class="form-control text-uppercase" placeholder="例: BR198">
                                    </div>
                                </div>
                            </div>

                            <div class="form-check form-switch mb-2 bg-light p-2 rounded ps-5">
                                <input class="form-check-input" type="checkbox" id="check-return">
                                <label class="form-check-label fw-bold" for="check-return">同時新增回程航班</label>
                            </div>

                            <div id="return-section" class="mb-4 d-none">
                                <h6 class="text-success fw-bold">回程資訊</h6>
                                <div class="row g-2">
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">回程日期</label>
                                        <input type="date" id="f-date-back" class="form-control">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">回程班號</label>
                                        <input type="text" id="f-no-back" class="form-control text-uppercase" placeholder="例: BR197">
                                    </div>
                                </div>
                            </div>

                            <button id="btn-search-flight" class="btn btn_light w-100 py-2">搜尋航班資訊</button>
                        </div>

                        <div id="flight-loading" class="text-center py-4 d-none">
                            <div class="spinner-border text-primary mb-2"></div>
                            <div class="text-muted small">同步 AirLabs 數據中...</div>
                        </div>

                        <div id="flight-preview-section" class="d-none border rounded p-3 mt-3 bg-light">
                            <div id="preview-list"></div> <div class="mt-3 pt-3 border-top gap-2 d-flex flex-column">
                                <button class="btn btn_light w-100" id="btn-save-flight">確認並存入行程</button>
                                <button class="btn btn_Gray w-100 btn-sm text-decoration-none" id="btn-back-search">重新輸入</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    bindEvents() {
        // 切換回程顯示
        document.getElementById('check-return').addEventListener('change', (e) => {
            const section = document.getElementById('return-section');
            if (e.target.checked) section.classList.remove('d-none');
            else section.classList.add('d-none');
        });

        document.getElementById('btn-search-flight').addEventListener('click', () => this.search());
        document.getElementById('btn-back-search').addEventListener('click', () => this.toggleView('input'));
        document.getElementById('btn-save-flight').addEventListener('click', () => this.save());

        // 自動補全
        const depInput = document.getElementById('f-dep');
        const arrInput = document.getElementById('f-arr');
        depInput.addEventListener('input', (e) => this.handleAutocomplete(e, 'f-dep-results'));
        arrInput.addEventListener('input', (e) => this.handleAutocomplete(e, 'f-arr-results'));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.position-relative')) {
                document.querySelectorAll('.autocomplete-results').forEach(el => el.classList.add('d-none'));
            }
        });

        this.modalEl.addEventListener('hidden.bs.modal', () => {
            this.toggleView('input');
            ['f-date', 'f-dep', 'f-arr', 'f-no', 'f-date-back', 'f-no-back'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('check-return').checked = false;
            document.getElementById('return-section').classList.add('d-none');
            document.querySelectorAll('.autocomplete-results').forEach(el => el.innerHTML = '');
        });
    }

    // (保留原本的 handleAutocomplete, renderAutocompleteResults, open, toggleView 方法，此處省略以節省篇幅)
    handleAutocomplete(event, resultListId) { /* ...請保持原樣... */
        const query = event.target.value.trim();
        const resultsList = document.getElementById(resultListId);
        clearTimeout(this.autocompleteTimeout);
        if (query.length < 2) { resultsList.classList.add('d-none'); return; }
        this.autocompleteTimeout = setTimeout(async () => {
            const url = `https://autocomplete.travelpayouts.com/places2?term=${encodeURIComponent(query)}&locale=en&types[]=city&types[]=airport`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                this.renderAutocompleteResults(data, resultsList, event.target);
            } catch (error) { console.error('Autocomplete API error:', error); }
        }, 300);
    }
    renderAutocompleteResults(data, resultsList, inputEl) { /* ...請保持原樣... */
        if (data.length === 0) { resultsList.innerHTML = '<li class="text-muted small">查無結果</li>'; resultsList.classList.remove('d-none'); return; }
        resultsList.innerHTML = data.map(item => `<li data-code="${item.code}"><div style="display: flex; align-items: center;"><span class="ac-iata">${item.code}</span><div class="ac-info"><span class="ac-name">${item.name}</span><span class="ac-country">${item.country_name || ''}</span></div></div><span class="ac-type">${item.type === 'city' ? '城市' : '機場'}</span></li>`).join('');
        resultsList.classList.remove('d-none');
        resultsList.querySelectorAll('li').forEach(li => { li.onclick = (e) => { e.stopPropagation(); inputEl.value = li.dataset.code; resultsList.classList.add('d-none'); }; });
    }
    open(tripId, callback) { this.tripId = tripId; this.onSuccess = callback; this.bsModal.show(); }
    toggleView(view) {
        const sections = ['flight-input-section', 'flight-loading', 'flight-preview-section'];
        sections.forEach(id => document.getElementById(id).classList.add('d-none'));
        if (view === 'input') document.getElementById('flight-input-section').classList.remove('d-none');
        if (view === 'loading') document.getElementById('flight-loading').classList.remove('d-none');
        if (view === 'preview') document.getElementById('flight-preview-section').classList.remove('d-none');
    }

    // ★ 修改：搜尋邏輯
    async search() {
        const dep = document.getElementById('f-dep').value.toUpperCase();
        const arr = document.getElementById('f-arr').value.toUpperCase();

        const dateGo = document.getElementById('f-date').value;
        const noGo = document.getElementById('f-no').value.toUpperCase().replace(/\s+/g, '');

        const hasReturn = document.getElementById('check-return').checked;
        const dateBack = document.getElementById('f-date-back').value;
        const noBack = document.getElementById('f-no-back').value.toUpperCase().replace(/\s+/g, '');

        if (!dep || !arr || !dateGo || !noGo) return alert("請填寫去程資訊");
        if (hasReturn && (!dateBack || !noBack)) return alert("請填寫回程資訊");

        this.toggleView('loading');
        this.storeDataList = [];

        try {
            // 1. 查去程
            const flightGo = await this.fetchSingleFlight(dep, arr, noGo, dateGo);
            this.storeDataList.push({ type: '去程', ...flightGo });

            // 2. 查回程 (機場互換)
            if (hasReturn) {
                const flightBack = await this.fetchSingleFlight(arr, dep, noBack, dateBack);
                this.storeDataList.push({ type: '回程', ...flightBack });
            }

            this.renderPreview(this.storeDataList);
            this.toggleView('preview');

        } catch (err) {
            alert(err.message || "查詢失敗");
            this.toggleView('input');
        }
    }

    // 抽離單筆查詢
    async fetchSingleFlight(depIata, arrIata, fNo, dateStr) {
        const routeRes = await TripApi.searchFlightRoute(depIata, arrIata);
        const matched = routeRes.response.find(r =>
            (r.airline_iata + r.flight_number) === fNo ||
            (r.airline_icao + r.flight_number) === fNo
        );

        if (!matched) throw new Error(`找不到航班 ${fNo} (${depIata}->${arrIata})`);

        const flightRes = await TripApi.searchFlightDetail(fNo);
        const d = flightRes.response || {};
        const actualDate = this.patchFlightData(matched, dateStr);

        return {
            tripId: parseInt(this.tripId),
            carrier: d.airline_name || matched.airline_name || "未知航空",
            flightNumber: fNo,
            depTimeLocal: actualDate.actualDepLocal,
            depTimeUtc: actualDate.actualDepUtc,
            arrTimeLocal: actualDate.actualArrLocal,
            arrTimeUtc: actualDate.actualArrUtc,
            fromAirport: depIata,
            toAirport: arrIata,
        };
    }

    // (保留原本的 patchFlightData, 內容不變)
    patchFlightData(apiData, userSelectedDate) { /* ...請複製您原本的方法內容... */
        const toYMD = (dateObj) => { const y = dateObj.getFullYear(); const m = String(dateObj.getMonth() + 1).padStart(2, '0'); const d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; };
        const safeDate = (str) => new Date(str.replace(/-/g, '/'));
        const parseMins = (timeStr) => { if (!timeStr) return 0; const [h, m] = timeStr.split(':').map(Number); return h * 60 + m; };
        const depTimeStr = apiData.dep_time || "00:00"; const arrTimeStr = apiData.arr_time || "00:00"; const depUtcStr = apiData.dep_time_utc || "00:00"; const arrUtcStr = apiData.arr_time_utc || "00:00";
        let dayDiff = 0; const depUtcMins = parseMins(depUtcStr); const arrUtcMins = parseMins(arrUtcStr); if (arrUtcMins < depUtcMins) { dayDiff = 1; }
        const actualDepLocal = `${userSelectedDate} ${depTimeStr}`; const arrivalDateObj = safeDate(userSelectedDate); arrivalDateObj.setDate(arrivalDateObj.getDate() + dayDiff); const actualArrLocal = `${toYMD(arrivalDateObj)} ${arrTimeStr}`;
        const refDate = "2000/01/01"; const refDepLocalObj = new Date(`${refDate} ${depTimeStr}`); const refDepUtcObj = new Date(`${refDate} ${depUtcStr}`); const depOffsetMs = refDepLocalObj - refDepUtcObj;
        const finalDepUtc = new Date(safeDate(actualDepLocal).getTime() - depOffsetMs); let finalArrUtc;
        if (apiData.duration) { finalArrUtc = new Date(finalDepUtc.getTime() + (apiData.duration * 60 * 1000)); } else { finalArrUtc = new Date(finalDepUtc.getTime() + (3600 * 1000)); }
        return { actualDepLocal, actualArrLocal, actualDepUtc: finalDepUtc.toISOString(), actualArrUtc: finalArrUtc.toISOString() };
    }

    // ★ 修改：渲染預覽 (支援多筆)
    renderPreview(dataList) {
        const container = document.getElementById('preview-list');
        container.innerHTML = '';

        dataList.forEach(data => {
            const badgeClass = data.type === '去程' ? 'bg-primary' : 'bg-success';
            const html = `
            <div class="card mb-3 border-0 shadow-sm">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="badge ${badgeClass}">${data.type}</span>
                        <span class="fw-bold">${data.carrier} ${data.flightNumber}</span>
                    </div>
                    <div class="row text-center align-items-center">
                        <div class="col-5">
                            <div class="h5 mb-0">${data.depTimeLocal.split(' ')[1]}</div>
                            <small class="text-muted">${data.fromAirport}</small>
                        </div>
                        <div class="col-2 text-muted">→</div>
                        <div class="col-5">
                            <div class="h5 mb-0">${data.arrTimeLocal.split(' ')[1]}</div>
                            <small class="text-muted">${data.toAirport}</small>
                        </div>
                    </div>
                </div>
            </div>`;
            container.insertAdjacentHTML('beforeend', html);
        });
    }

    // ★ 修改：儲存 (連續送出多筆)
    async save() {
        try {
            for (const data of this.storeDataList) {
                const { type, ...payload } = data;
                await TripApi.addFlight(payload);
            }
            this.bsModal.hide();
            if (this.onSuccess) this.onSuccess();
        } catch (msg) {
            alert("儲存失敗: " + msg);
        }
    }
}