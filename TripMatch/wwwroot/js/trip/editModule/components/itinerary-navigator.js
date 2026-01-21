export class ItineraryNavigator {
    /**
     * @param {string} containerId - 放置導覽列的容器 ID
     * @param {string} scrollContainerId - 發生捲動的容器 ID (用於計算位置)
     * @param {function} onAddDay - 當使用者點擊「新增天數」時的回呼函式
     */
    constructor(containerId, scrollContainerId, onAddDay) {
        this.containerId = containerId;
        this.scrollContainerId = scrollContainerId;
        this.onAddDay = onAddDay;
        this.tripDates = [];

        // 初始化渲染基礎結構
        this.renderBase();
    }

    renderBase() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="d-flex gap-2 w-100">
                <!-- 1. 快速跳轉按鈕 -->
                <div class="dropdown flex-fill">
                    <button class="btn btn_light btn-sm w-100  fw-bold" type="button" data-bs-toggle="dropdown">
                        <i class="bi bi-lightning-charge-fill text-warning me-1"></i>快速跳轉
                    </button>
                    <ul class="dropdown-menu w-100 shadow-sm border-0">
                        <li><a class="dropdown-item" href="#" data-target="flight-wrapper"><i class="bi bi-airplane me-2 text-primary"></i>航班資訊</a></li>
                        <li><a class="dropdown-item" href="#" data-target="accommodation-wrapper"><i class="bi bi-building me-2 text-success"></i>住宿安排</a></li>
                        <li><a class="dropdown-item" href="#" data-target="restaurant-wrapper"><i class="bi bi-cup-hot me-2 text-danger"></i>美食總覽</a></li>
                    </ul>
                </div>

                <!-- 2. 行程導航按鈕 (內容動態生成) -->
                <div class="dropdown flex-fill">
                    <button class="btn btn_light btn-sm w-100  fw-bold" type="button" data-bs-toggle="dropdown" id="day-nav-btn">
                        <i class="bi bi-calendar-week me-1"></i>每日行程
                    </button>
                    <ul class="dropdown-menu w-100 shadow-sm border-0" id="day-nav-menu">
                        <!-- JS 動態填入 -->
                    </ul>
                </div>
            </div>
        `;

        // 綁定「快速跳轉」的點擊事件
        container.querySelectorAll('[data-target]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = e.currentTarget.dataset.target;
                this.scrollToElement(targetId);
            });
        });
    }

    /**
     * 更新天數下拉選單
     * @param {Array} dates - 日期字串陣列 ['2025-01-20', '2025-01-21']
     */
    updateDays(dates) {
        this.tripDates = dates || [];
        const menu = document.getElementById('day-nav-menu');
        if (!menu) return;

        let html = '';

        // 1. 生成每一天的選項
        this.tripDates.forEach((date, index) => {
            const dayNum = index + 1;
            // 格式化日期 MM/dd
            const dateShort = new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });

            html += `
                <li>
                    <a class="dropdown-item d-flex justify-content-between align-items-center" href="#" data-day-target="day-${dayNum}">
                        <span><span class="badge bg-light text-dark border me-2">Day ${dayNum}</span> ${dateShort}</span>
                        <i class="bi bi-chevron-right text-muted small"></i>
                    </a>
                </li>
            `;
        });

        // 2. 加入分隔線與新增按鈕
        html += `
            <li><hr class="dropdown-divider"></li>
            <li>
                <button class="dropdown-item text-primary fw-bold text-center py-2" id="nav-add-day-btn">
                    <i class="bi bi-plus-circle me-1"></i> 增加一天
                </button>
            </li>
        `;

        menu.innerHTML = html;

        // 綁定跳轉事件 (Day)
        menu.querySelectorAll('[data-day-target]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // 這裡我們需要找到對應 data-day="X" 的元素
                const targetId = e.currentTarget.dataset.dayTarget; // "day-1"
                this.scrollToElement(targetId);
            });
        });

        // 綁定新增天數事件
        const addBtn = document.getElementById('nav-add-day-btn');
        if (addBtn && this.onAddDay) {
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.onAddDay();
            });
        }
    }

    // 輔助：平滑捲動到指定元素
    scrollToElement(elementId) {
        const container = document.getElementById(this.scrollContainerId);
        const target = document.getElementById(elementId); // 嘗試找 ID

        // 如果找不到 ID，可能是 Day Block (因為我們之前是用 class 和 data-day)
        // 這裡需要配合修改 edit-trip-manager.js 給 Day Block 加上 ID

        if (container && target) {
            // 計算相對位置進行捲動
            const topPos = target.offsetTop - container.offsetTop;
            container.scrollTo({
                top: topPos - 10, // 留一點頭部緩衝
                behavior: 'smooth'
            });
        } else {
            console.warn(`找不到捲動目標: ${elementId}`);
        }
    }
}