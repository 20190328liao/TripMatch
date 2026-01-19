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
                <h6 class="fw-bold m-0 text-primary"><i class="bi bi-airplane-engines me-2"></i>航班資訊</h6>
                <button class="btn btn-sm btn-outline-primary rounded-pill" id="btn-add-flight-trigger">
                    <i class="bi bi-plus-lg"></i> 新增
                </button>
            </div>
            <div class="flight-list">
        `;

        if (!flights || flights.length === 0) {
            html += `<div class="text-center py-3 text-muted small bg-light rounded border border-dashed">尚未安排航班</div>`;
        } else {
            flights.forEach(f => {
                html += `
                <div class="flight-card d-flex gap-3 mb-2 p-2 border rounded position-relative align-items-center">
                    <div class="bg-light rounded p-2 text-center" style="min-width: 60px;">
                        <i class="bi bi-airplane text-primary"></i>
                    </div>
                    <div class="flex-grow-1">
                        <div class="fw-bold text-dark">${f.flightNumber} <span class="text-muted small fw-normal">| ${f.airlineName}</span></div>
                        <div class="small mt-1 d-flex align-items-center gap-2">
                             <span class="badge bg-secondary bg-opacity-10 text-dark">${f.depIata} ${f.depTime}</span>
                             <i class="bi bi-arrow-right text-muted" style="font-size: 0.8rem;"></i>
                             <span class="badge bg-secondary bg-opacity-10 text-dark">${f.arrIata} ${f.arrTime}</span>
                        </div>
                        <div class="text-muted small mt-1"><i class="bi bi-calendar-event me-1"></i>${new Date(f.flightDate).toLocaleDateString()}</div>
                    </div>
                    <button class="btn btn-link text-danger p-0 position-absolute top-0 end-0 mt-1 me-2 delete-flight-btn" data-id="${f.id}">
                        <i class="bi bi-x-lg"></i>
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