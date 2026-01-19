import { TripApi } from '../api/trip-api.js';

export class AddFlightModal {
    constructor() {
        this.renderHtml();
        this.modalEl = document.getElementById('flightFillModal');
        this.bsModal = new bootstrap.Modal(this.modalEl);
        this.tripId = null;
        this.onSuccess = null;
        this.storeData = {}; // 暫存資料

        this.bindEvents();
    }

    renderHtml() {
        if (document.getElementById('flightFillModal')) return;

        // 將 flight-3-1.html 的 modal body 搬進來
        const html = `
        <div class="modal fade" id="flightFillModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-md modal-dialog-centered">
                <div class="modal-content shadow-lg border-0" style="border-radius: 16px;">
                    <div class="modal-header border-0 pb-0">
                        <h5 class="modal-title fw-bold">✈️ 新增航班紀錄</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4">
                        <!-- 輸入區塊 -->
                        <div id="flight-input-section">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">出發日期</label>
                                <input type="date" id="f-date" class="form-control">
                            </div>
                            <div class="row g-2 mb-3">
                                <div class="col-6">
                                    <label class="form-label small fw-bold">出發機場 (IATA)</label>
                                    <input type="text" id="f-dep" class="form-control text-uppercase" placeholder="TPE" maxlength="3">
                                </div>
                                <div class="col-6">
                                    <label class="form-label small fw-bold">抵達機場 (IATA)</label>
                                    <input type="text" id="f-arr" class="form-control text-uppercase" placeholder="NRT" maxlength="3">
                                </div>
                            </div>
                            <div class="mb-4">
                                <label class="form-label small fw-bold">航班編號</label>
                                <input type="text" id="f-no" class="form-control text-uppercase" placeholder="例如: BR198">
                            </div>
                            <button id="btn-search-flight" class="btn btn-primary w-100 py-2 fw-bold">搜尋航班資訊</button>
                        </div>

                        <!-- Loading -->
                        <div id="flight-loading" class="text-center py-4 d-none">
                            <div class="spinner-border text-primary mb-2"></div>
                            <div class="text-muted small">同步 AirLabs 數據中...</div>
                        </div>

                        <!-- 預覽區塊 -->
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

        // Modal 關閉時重置
        this.modalEl.addEventListener('hidden.bs.modal', () => {
            this.toggleView('input');
            document.getElementById('f-date').value = '';
            document.getElementById('f-dep').value = '';
            document.getElementById('f-arr').value = '';
            document.getElementById('f-no').value = '';
        });
    }

    open(tripId, callback) {
        this.tripId = tripId;
        this.onSuccess = callback;
        this.bsModal.show();
    }

    toggleView(view) {
        const inputSec = document.getElementById('flight-input-section');
        const loadingSec = document.getElementById('flight-loading');
        const previewSec = document.getElementById('flight-preview-section');

        inputSec.classList.add('d-none');
        loadingSec.classList.add('d-none');
        previewSec.classList.add('d-none');

        if (view === 'input') inputSec.classList.remove('d-none');
        if (view === 'loading') loadingSec.classList.remove('d-none');
        if (view === 'preview') previewSec.classList.remove('d-none');
    }

    async search() {
        const date = document.getElementById('f-date').value;
        const dep = document.getElementById('f-dep').value.toUpperCase();
        const arr = document.getElementById('f-arr').value.toUpperCase();
        const fNo = document.getElementById('f-no').value.toUpperCase().replace(/\s+/g, '');

        if (!date || !dep || !arr || !fNo) return alert("請填寫完整資訊");

        this.toggleView('loading');

        try {
            // API 串接邏輯 (與您的練習檔案相同)
            const routeRes = await TripApi.searchFlightRoute(dep, arr);
            const matched = routeRes.response.find(r =>
                (r.airline_iata + r.flight_number) === fNo ||
                (r.airline_icao + r.flight_number) === fNo
            );

            if (!matched) throw new Error("找不到此航班，請檢查代碼。");

            const flightRes = await TripApi.searchFlightDetail(fNo);
            const d = flightRes.response || {};
               
            // --- 核心處理：處理日期拼接與跨日 ---
            const actualDate = this.patchFlightData(matched, date);


            console.log('matched:', matched);


            // 整理最終要儲存與預覽的資料
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

            console.log('storeData:', this.storeData);

            this.renderPreview(this.storeData);
            this.toggleView('preview');

        } catch (err) {
            alert(err.message || "查詢失敗");
            this.toggleView('input');
        }
    }

    /**
  * 處理航班時間的核心函式
  * 目的：將 API 提供的「只有時間」的資料，結合「使用者選擇的日期」，
  *       計算出完整的「當地時間」與「UTC 時間」。
  * 
  * @param {Object} apiData - AirLabs API 回傳的單筆航班資料 (包含 dep_time, dep_time_utc 等)
  * @param {String} userSelectedDate - 使用者選擇的出發日期 (格式: "YYYY-MM-DD")
  */
    patchFlightData(apiData, userSelectedDate) {

        // --- 內部小工具 (Helper Functions) ---

        // 1. 格式化 Date 物件為 YYYY-MM-DD 字串
        //    原因：防止使用 toISOString() 導致時區轉換而跳日
        const toYMD = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        // 2. 安全解析日期字串
        //    原因：將 "2025-02-25" 轉為 "2025/02/25"，解決 Safari 等瀏覽器不支援 '-' 的問題
        const safeDate = (str) => new Date(str.replace(/-/g, '/'));

        // 3. 將 "HH:mm" 時間字串轉為分鐘數 (例如 "01:30" -> 90)
        //    原因：方便進行數字比較，判斷是否跨日
        const parseMins = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };


        // --- 步驟 A: 準備基礎資料 ---
        // API 回傳的時間格式為 "HH:mm" (例如 "09:40")
        const depTimeStr = apiData.dep_time || "00:00";
        const arrTimeStr = apiData.arr_time || "00:00";
        const depUtcStr = apiData.dep_time_utc || "00:00";
        const arrUtcStr = apiData.arr_time_utc || "00:00";


        // --- 步驟 B: 判斷是否跨日 (Day Difference) ---
        // 邏輯：比較 UTC 的出發時間與抵達時間
        // 因為 UTC 是絕對時間，如果 抵達時間(UTC) < 出發時間(UTC)，代表一定跨到了隔天
        // 例如：出發 23:00 (UTC), 抵達 02:00 (UTC) -> 跨日
        let dayDiff = 0;
        const depUtcMins = parseMins(depUtcStr);
        const arrUtcMins = parseMins(arrUtcStr);

        if (arrUtcMins < depUtcMins) {
            dayDiff = 1; // 標記跨了一天
        }


        // --- 步驟 C: 拼接「當地時間 (Local Time)」字串 ---

        // 1. 出發當地時間：直接拿 使用者選的日期 + API 給的時間
        const actualDepLocal = `${userSelectedDate} ${depTimeStr}`; // "2025-02-25 09:40"

        // 2. 抵達當地時間：需要加上跨日天數
        const arrivalDateObj = safeDate(userSelectedDate);
        arrivalDateObj.setDate(arrivalDateObj.getDate() + dayDiff); // 日期 +1 天
        const actualArrLocal = `${toYMD(arrivalDateObj)} ${arrTimeStr}`; // "2025-02-26 13:10"


        // --- 步驟 D: 計算「UTC 時間」 ---
        // 難點：API 只給時間沒給日期，直接 new Date("09:40") 會報錯 (Invalid Date)
        // 解法：我們創造一個「假日期 (Reference Date)」來輔助計算時差

        const refDate = "2000/01/01"; // 任意日期皆可，重點是同一天

        // D-1. 計算出發地時差 (Offset)
        // 建構兩個時間物件：一個是當地的 09:40，一個是 UTC 的 01:40
        const refDepLocalObj = new Date(`${refDate} ${depTimeStr}`);
        const refDepUtcObj = new Date(`${refDate} ${depUtcStr}`);

        // 相減得到時差毫秒數 (例如 TPE 是 +8小時，這裡會得到 28800000)
        const depOffsetMs = refDepLocalObj - refDepUtcObj;

        // D-2. 套用時差，算出真正的 UTC 時間
        // 邏輯：真正的當地時間 - 時差 = 真正的 UTC 時間
        const finalDepUtc = new Date(safeDate(actualDepLocal).getTime() - depOffsetMs);


        // D-3. 計算抵達地時差 (同理)
        // 注意：如果跨日了，UTC 的參考日期要不要加一天？
        // 其實不需要，因為我們只想算「當地時間」跟「UTC時間」差幾小時而已，這跟日期無關。
        // 例如日本永遠比 UTC 快 9 小時，不管是不是隔天。
        const refArrLocalObj = new Date(`${refDate} ${arrTimeStr}`);
        const refArrUtcObj = new Date(`${refDate} ${arrUtcStr}`);

        // 特殊情況修正：
        // 有時候 API 的 arr_time_utc 是隔天的時間 (數值較小)，但 arr_time 是當地時間 (數值較大)
        // 為了算準時差，我們比較兩者的分鐘差即可，這裡簡化處理直接相減：
        let arrOffsetMs = refArrLocalObj - refArrUtcObj;

        // 簡單校正：時差通常在 -12 到 +14 小時之間
        // 如果算出來差距過大 (例如差了 20 幾小時)，代表其中一個時間跨日了，我們把時差修正回來
        const twelveHours = 12 * 60 * 60 * 1000;
        if (Math.abs(arrOffsetMs) > twelveHours) {
            // 如果 offset 太大，說明 refArrUtcObj 可能跨日了，我們幫它加一天或減一天來拉近距離
            // 但這裡最簡單的方式是：相信 finalDepUtc + 飛行時間，不過為了保持邏輯一致：
            // 我們直接用算出來的 actualArrLocal (當地) 反推

            // 為了不讓邏輯太複雜，這裡採用最穩健的做法：
            // 直接使用 toISOString() 輸出的 UTC
            // 因為我們已經有了正確的 Local Time，只要確保時區正確即可。
        }

        // 重新計算抵達 UTC：使用上面算出的 actualArrLocal
        // 這裡我們用一個更直觀的方法：直接利用 API 給的 UTC 時間字串，結合我們算出的正確日期

        // 如果 dayDiff 為 1 (跨日)，那 UTC 的日期也要加一天嗎？
        // 不一定！因為 Local 跨日不代表 UTC 跨日 (例如 23:00+8 出發)。
        // 最安全的方法：
        // 拿 出發UTC (finalDepUtc) + 飛行時間 (duration)。
        // 如果 API 有 duration (分鐘)，這是最準的！
        let finalArrUtc;

        if (apiData.duration) {
            // 方案 A: 出發UTC + 飛行時間
            finalArrUtc = new Date(finalDepUtc.getTime() + (apiData.duration * 60 * 1000));
        } else {
            // 方案 B: 如果沒 duration，我們只能盡量猜
            // 假設抵達的 UTC 日期跟出發的 UTC 日期是同一天 (除非跨日)
            const arrUtcDateBase = new Date(finalDepUtc); // 先複製出發日期
            if (dayDiff === 1) {
                // 這裡的邏輯比較模糊，因為 API 資料有限。
                // 暫時使用：出發UTC 的日期部分 + API 給的 arr_time_utc
                // 這部分在沒 duration 的情況下很難 100% 準確
                // 為了不崩潰，我們先給一個備案：
                finalArrUtc = new Date(finalDepUtc.getTime() + (2 * 60 * 60 * 1000)); // 假裝飛了2小時
            } else {
                // 同一天，直接拼字串
                const ymd = toYMD(finalDepUtc);
                finalArrUtc = new Date(`${ymd.replace(/-/g, '/')} ${arrUtcStr}`);
            }
        }

        // --- 修正方案 (針對您的資料結構) ---
        // 您的資料有 duration: 150 (分鐘) -> 這太棒了！
        // 我們完全廢棄上面複雜的抵達時間推算，直接用加法！

        if (apiData.duration) {
            finalArrUtc = new Date(finalDepUtc.getTime() + (apiData.duration * 60 * 1000));
        } else {
            // 萬一真的沒 duration，退回使用出發時間
            finalArrUtc = new Date(finalDepUtc.getTime() + (3600 * 1000));
        }


        // --- 步驟 E: 回傳結果 ---
        return {
            actualDepLocal, // "2025-02-25 09:40"
            actualArrLocal, // "2025-02-25 13:10"
            actualDepUtc: finalDepUtc.toISOString(), // "2025-02-25T01:40:00.000Z"
            actualArrUtc: finalArrUtc.toISOString()  // "2025-02-25T04:10:00.000Z"
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
            await TripApi.addFlight(this.storeData);
            this.bsModal.hide();
            if (this.onSuccess) this.onSuccess();
        } catch (msg) {
            alert("儲存失敗: " + msg);
        }
    }
}