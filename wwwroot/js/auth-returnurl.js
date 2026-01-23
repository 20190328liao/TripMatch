// 會自動注入一個 Bootstrap 5 modal 並顯示（僅在「首頁」顯示，且 returnUrl 為本域相對路徑）
(function () {
    function getCookie(name) {
        const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return v ? decodeURIComponent(v.pop()) : null;
    }
    function deleteCookie(name) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
    }
    function isLocalPath(url) {
        if (!url) return false;
        return url.startsWith('/') && !url.startsWith('//') && !/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url);
    }

    document.addEventListener('DOMContentLoaded', function () {
        // 只在首頁顯示 modal（避免在行程頁或登入頁重複彈窗）
        const currentPath = window.location.pathname || '/';
        const homePaths = ['/', '/Home', '/Home/Index', '/Index'];
        if (!homePaths.includes(currentPath)) return;

        // 如果 URL 本身帶有 ReturnUrl（例如剛從某處被導回），不要在此顯示 modal
        const qs = new URLSearchParams(window.location.search);
        if (qs.has('ReturnUrl') || qs.has('returnUrl')) return;

        // 取得 cookie（優先使用 InviteReturn helper）
        const cookieReturn = (window.InviteReturn && typeof window.InviteReturn.get === 'function')
            ? window.InviteReturn.get()
            : getCookie('invite_return');

        const returnUrl = cookieReturn;

        if (!returnUrl || !isLocalPath(returnUrl)) {
            // 若 cookie 不合法或不存在，確保刪除殘留
            try {
                if (window.InviteReturn && typeof window.InviteReturn.consume === 'function') {
                    window.InviteReturn.consume();
                } else if (cookieReturn) {
                    deleteCookie('invite_return');
                }
            } catch { }
            return;
        }

        // 建立並顯示 modal
        if (!document.getElementById('inviteReturnModal')) {
            const modalHtml = `
<div class="modal fade" id="inviteReturnModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">回到邀請的行程？</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="關閉"></button>
      </div>
      <div class="modal-body">
        我們偵測到您剛才有一個邀請連結，是否要回到該行程頁面？
      </div>
      <div class="modal-footer">
        <button type="button" id="inviteGotoTrip" class="btn btn-primary">回到該行程</button>
        <button type="button" id="inviteGotoHome" class="btn btn-secondary">回到首頁</button>
        <button type="button" id="inviteDismiss" class="btn btn-link" data-bs-dismiss="modal">稍後再說</button>
      </div>
    </div>
  </div>
</div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        const modalEl = document.getElementById('inviteReturnModal');
        const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
        bsModal.show();

        document.getElementById('inviteGotoTrip').addEventListener('click', function () {
            if (window.InviteReturn && typeof window.InviteReturn.safeRedirect === 'function') {
                window.InviteReturn.safeRedirect();
            } else {
                try { deleteCookie('invite_return'); } catch { }
                if (isLocalPath(returnUrl)) window.location.href = returnUrl;
            }
        });

        document.getElementById('inviteGotoHome').addEventListener('click', function () {
            if (window.InviteReturn && typeof window.InviteReturn.consume === 'function') {
                window.InviteReturn.consume();
            } else {
                try { deleteCookie('invite_return'); } catch { }
            }
            window.location.href = '/';
        });

        document.getElementById('inviteDismiss').addEventListener('click', function () {
            if (window.InviteReturn && typeof window.InviteReturn.consume === 'function') {
                window.InviteReturn.consume();
            } else {
                try { deleteCookie('invite_return'); } catch { }
            }
            bsModal.hide();
        });
    });
})();