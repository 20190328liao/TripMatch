export class FlightRenderer {
    constructor(containerId) {
        this.containerId = containerId; // 預期這是一個空的 <div id="flight-list-container">
    }

    render(flights) {
        // 先建立外層結構 (Header + Add Button)
        // 這裡我們直接產生整個航班區塊 HTML
        let html = `
        <div class="flight-section mb-3 p-3 bg-white rounded shadow-sm border">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="fw-bold m-0 text-success"><i class="bi bi-airplane-engines me-2"></i>航班資訊</h6>
                <button class="btn btn-sm btn-outline-mint rounded-pill" id="btn-add-flight-trigger">
                    <i class="bi bi-plus-lg"></i> 新增
                </button>
            </div>
            <div class="flight-list">
        `;

        if (!flights || flights.length === 0) {
            html += `<div class="text-center py-3 text-muted small bg-light rounded border border-dashed">尚未安排航班</div>`;
        } else {
            flights.forEach(f => {

                // 在生成 HTML 之前先處理日期格式
                const dateObj = new Date(f.depTimeLocal);
                // 格式範例：2月25日 (週二)
                const dateStr = dateObj.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });

                // 1. 處理時間顯示 (只取 HH:mm)
                // 假設 f.depTimeLocal 格式為 "2025-02-25 09:40"
                const depTime = f.depTimeLocal.split(' ')[1].substring(0, 5);
                const arrTime = f.arrTimeLocal.split(' ')[1].substring(0, 5);

                // 2. 計算飛行時間 (Duration)
                let durationStr = "計算中...";
                if (f.depTimeUtc && f.arrTimeUtc) {
                    const start = new Date(f.depTimeUtc);
                    const end = new Date(f.arrTimeUtc);
                    const diffMs = end - start;
                    // 算出小時與分鐘
                    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    durationStr = `${hrs}小時 ${mins}分鐘`;
                }

                // 3. 生成 HTML (模仿圖片樣式)
                html += `
                <div class="flight-card">
                    <div class="flight-date-header">
                        ${dateStr}
                    </div>
                    <div class="d-flex align-items-center flex-wrap justify-content-center justify-content-md-start">
            
                        <!-- 左側：航空公司 -->
                        <div class="flight-airline-box">
                            <div class="flight-airline-name">${f.carrier}</div>
                            <span class="flight-number-badge">${f.flightNumber}</span>
                        </div>

                        <!-- 中間：航程資訊容器 -->
                        <div class="d-flex flex-grow-1 align-items-center justify-content-center gap-3 gap-md-4">
                
                            <!-- 出發地 -->
                            <div class="flight-time-group">
                                <div class="flight-time-large">${depTime}</div>
                                <div class="flight-airport-code">${f.fromAirport}</div>
                            </div>

                            <!-- 中間裝飾：時間 + 線條 + 直飛 -->
                            <div class="flight-route-info">
                                <!-- 上方：飛行時間 -->
                                <div class="flight-duration-text">${durationStr}</div>
                    
                                <!-- 中間：線條與飛機 -->
                                <div class="flight-line-container">
                                    <div class="flight-line-bar"></div>
                                    <i class="bi bi-airplane-fill flight-icon-plane"></i>
                                </div>

                                <!-- 下方：直飛 -->
                                <div class="flight-direct-text">直飛</div>
                            </div>

                            <!-- 抵達地 -->
                            <div class="flight-time-group">
                                <div class="flight-time-large">${arrTime}</div>
                                <div class="flight-airport-code">${f.toAirport}</div>
                            </div>
                        </div>

                    </div>

                    <!-- 刪除按鈕 -->
                    <button class="flight-delete-btn delete-flight-btn" data-id="${f.id}" data-version="${f.rowVersion}" title="移除航班">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>`;
            });
        }

        html += `</div></div>`; // 結束標籤

        // 插入 HTML 到指定容器
        // 注意：這裡假設我們會在外層容器中預留一個 <div id="flight-wrapper"></div>
        const wrapper = document.getElementById(this.containerId);
        if (wrapper) wrapper.innerHTML = html;
    }
}