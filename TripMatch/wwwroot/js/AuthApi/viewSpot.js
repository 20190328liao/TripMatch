// 綁定 .btn-view-more：若有 google place id 則開 Google Maps，否則導到站內 Spot 詳情頁
(function () {
    'use strict';

    function openGooglePlace(placeId) {
        // 通用的 Google Maps place url（web）：
        const url = `https://www.google.com/maps/search/?api=1&query=place_id:${encodeURIComponent(placeId)}`;
        window.open(url, '_blank', 'noopener');
    }

    function openInternalSpot(spotId) {
        // 站內 fallback 詳細頁路徑，請依你專案實際路由修改（常見為 /Spot/Details/{id}）
        const url = `/Spot/Details/${encodeURIComponent(spotId)}`;
        window.open(url, '_blank', 'noopener');
    }

    document.addEventListener('click', function (e) {
        const btn = e.target.closest && e.target.closest('.btn-view-more');
        if (!btn) return;

        e.preventDefault();

        const googleId = btn.dataset.googlePlaceId || btn.dataset.externalPlaceId || '';
        const spotId = btn.dataset.spotId || '';

        if (googleId) {
            openGooglePlace(googleId);
            return;
        }

        if (spotId) {
            openInternalSpot(spotId);
            return;
        }

        // 如果兩者都沒有，提示使用者或記錄錯誤
        if (typeof window.showPopup === 'function') {
            window.showPopup({ title: '無法開啟', message: '找不到對應景點資料，請聯絡管理員或稍後再試。', type: 'error' });
        } else {
            alert('找不到對應景點資料，請聯絡管理員或稍後再試。');
        }
    });
})();