// 讀取使用者願望清單並在 member center 產生卡片
document.addEventListener('DOMContentLoaded', () => {
    const wishlistContainer = document.getElementById('wishlist_cards');

    const apiToggle = window.Routes?.AuthApi?.ToggleWishlist ?? '/api/auth/Wishlist/Toggle';
    let undoTimers = {};

    if (wishlistContainer) {
        // 事件委派監聽點擊
        wishlistContainer.addEventListener('click', async (e) => {
            //View More 點擊
            const viewMoreBtn = e.target.closest('.btn-view-more');
            if(viewMoreBtn) {
                const spotId = viewMoreBtn.getAttribute('data-id');
                if (spotId) {
                    window.location.href = `/Spot/Detail?id=${spotId}`;
                }
                return
            }

            //愛心取消收藏點擊
            const heartBtn = e.target.closest('.wish_heart') || e.target.closest('.btn_remove_wish');
            if(heartBtn) {
                e.preventDefault();
                const spotId = heartBtn.getAttribute('data-spotid');
                if (!spotId) return;

                // 1. 先執行視覺上的「假刪除」
                cardCol.style.transition = 'all 0.4s ease';
                cardCol.style.opacity = '0';
                cardCol.style.pointerEvents = 'none'; // 防止重複點擊

                // 2. 顯示 Undo 提示 (這裡使用簡單的自定義 UI 或 Alert)
                showUndoToast(spotId, () => {
                    // 如果點擊了復原 (Undo 回呼)
                    cardCol.style.opacity = '1';
                    cardCol.style.pointerEvents = 'auto';
                    clearTimeout(undoTimers[spotId]); // 取消定時刪除
                    delete undoTimers[spotId];
                });

                // 3. 設定 5 秒後真正執行 API
                undoTimers[spotId] = setTimeout(async () => {
                    try {
                        const response = await fetch(apiToggle, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ spotId: parseInt(spotId) })
                        });

                        if (response.ok) {
                            cardCol.remove(); // 真正移除 DOM
                            checkEmpty();
                        }
                    } catch (error) {
                        console.error('API Error:', error);
                    }
                    delete undoTimers[spotId];
                }, 5000); // 5秒緩衝
            }
        });
    }

    //檢查清單
    function checkEmpty() {
        if (wishlistContainer.querySelectorAll('.col').length == 0) {
            wishlistContainer.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">清單已清空</p></div>';
        }
    }

    //顯示 Undo 提示
    function showUndoToast(spotId, onUndo) {
        const toast = document.createElement('div');
        toast.id = 'undo_toast_' + spotId;
        toast.className = 'undo-toast';
        toast.innerHTML = `
        <span>已從清單移除</span>
            <button class="btn btn-sm btn-warning ms-3" id="undo_btn_${spotId}">復原</button>
        `;
        document.body.appendChild(toast);
        //綁定復原按鈕
        document.getElementById(`undo_btn_${spotId}`).addEventListener('click', () => {
            onUndo();
            toast.remove();
        });
        //自動消失
        setTimeout(() => { if (toast) toast.remove(); }, 5000);
    }
});