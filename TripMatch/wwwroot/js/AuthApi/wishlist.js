// 讀取使用者願望清單並在 member center 產生卡片
(function () {
    const containerSelector = '#wishlistCardsContainer';
    const apiGet = window.Routes?.AuthApi?.GetWishlist ?? '/api/auth/Wishlist';
    const apiToggle = window.Routes?.AuthApi?.ToggleWishlist ?? '/api/auth/Wishlist/Toggle';

    function createCard(item) {
        // 如果 imageUrl 為 null 或為外部 placeholder，fallback 到本地假圖片
        const imageUrlRaw = item.imageUrl || '';
        const isPlaceholder = imageUrlRaw.toLowerCase().includes('placeholder');
        const img = (!imageUrlRaw || isPlaceholder) ? '/img/placeholder.png' : imageUrlRaw;

        // 如果後端回傳 tripId，導向 Trip/Edit/{tripId}；否則導向建立行程並帶 spotId
        const viewMoreUrl = item.tripId ? `/Trip/Edit/${item.tripId}` : `/Trip/Create?spotId=${item.spotId}`;

        return `
        <div class="col">
            <div class="wish_card" data-spotid="${item.spotId}" data-wishlistid="${item.wishlistItemId || ''}">
                <div class="card_image">
                    <img src="${img}" alt="${escapeHtml(item.spotTitle)}" class="img-fluid">
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
            const res = await fetch(apiGet, { credentials: 'include', headers: { 'Accept': 'application/json' } });
            if (!res.ok) {
                console.warn('GetWishlist 回傳非成功狀態', res.status);
                return;
            }
            const data = await res.json();
            // 如果 API 回傳物件包在 { items: [...] } 的話，取 items；否則直接使用回傳陣列
            const items = data && data.items ? data.items : data;
            render(items);
        } catch (ex) {
            console.error('載入願望清單失敗', ex);
        }
    }

    function render(items) {
        const $c = document.querySelector(containerSelector);
        if (!$c) return;
        if (!items || items.length === 0) {
            $c.innerHTML = '<p class="text-muted">none WishList</p>';
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
                    const res = await fetch(apiToggle, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ SpotId: spotId })
                    });
                    if (!res.ok) {
                        console.warn('ToggleWishlist 非成功回應', res.status);
                    }
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

    // 將 load 暴露給全域，方便其他按鈕（例如產生假資料後）重載願望清單
    window.reloadWishlist = load;
})();