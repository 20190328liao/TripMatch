// 讀取使用者願望清單並在 member center 產生卡片
(function () {
    const containerSelector = '#wishlistCardsContainer';
    const apiBase = '/api/Wishlist';

    function createCard(item) {
        const img = item.imageUrl || '/img/Logo/Part12.png';
        // 如果後端回傳 tripId，導向 Trip/Edit/{tripId}；否則導向建立行程並帶 spotId
        const viewMoreUrl = item.tripId ? `/Trip/Edit/${item.tripId}` : `/Trip/Create?spotId=${item.spotId}`;

        return `
        <div class="wish_card" data-spotid="${item.spotId}" data-wishlistid="${item.wishlistItemId || ''}">
            <div class="card_image">
                <img src="${img}" alt="${escapeHtml(item.spotTitle)}">
                <button type="button" class="wish_heart ${item.wishlistItemId ? 'active' : ''}" data-spotid="${item.spotId}">
                    <i class="bi ${item.wishlistItemId ? 'bi-heart-fill' : 'bi-heart'}"></i>
                </button>
            </div>
            <div class="card_content">
                <h4 class="card_title">${escapeHtml(item.spotTitle)}</h4>
                <p class="card_date">${formatDate(item.createdAt)}</p>
                <div class="card_footer">
                    <a class="view_more_link" href="${viewMoreUrl}">View more...</a>
                </div>
            </div>
        </div>`;
    }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, function (m) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
        });
    }

    function formatDate(dt) {
        if (!dt) return '';
        try {
            const d = new Date(dt);
            return d.toLocaleDateString();
        } catch { return ''; }
    }

    async function load() {
        try {
            const res = await fetch(apiBase, { credentials: 'same-origin' });
            if (!res.ok) return;
            const data = await res.json();
            render(data);
        } catch (ex) {
            console.error('載入願望清單失敗', ex);
        }
    }

    function render(items) {
        const $c = document.querySelector(containerSelector);
        if (!$c) return;
        if (!items || items.length === 0) {
            $c.innerHTML = '<p class="text-muted">尚無願望清單項目</p>';
            return;
        }
        $c.innerHTML = items.map(createCard).join('');
        bindEvents();
    }

    function bindEvents() {
        document.querySelectorAll('.wish_heart').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const spotId = parseInt(btn.getAttribute('data-spotid'), 10);
                if (!spotId) return;
                try {
                    const res = await fetch(`${apiBase}/Toggle`, {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ spotId })
                    });
                    const json = await res.json();
                    // 重新載入列表簡單可靠
                    load();
                } catch (ex) {
                    console.error('切換願望清單失敗', ex);
                }
            });
        });
    }

    // 初始化：在會員中心頁面載入時呼叫
    document.addEventListener('DOMContentLoaded', () => {
        // 只在有 container 的頁面執行
        if (document.querySelector(containerSelector)) {
            load();
        }
    });
})();