(function () {
    'use strict';

    function getCookie(name) {
        const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return v ? decodeURIComponent(v.pop()) : null;
    }
    function deleteCookie(name) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    }
    function isLocalPath(url) {
        if (!url) return false;
        return url.startsWith('/') && !url.startsWith('//') && !/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url);
    }

    function showFallbackConfirm(returnUrl) {
        try { deleteCookie('invite_return'); } catch { }
        const ok = window.confirm('我們偵測到邀請連結，是否要回到該行程？');
        if (ok) window.location.href = returnUrl;
    }

    function showBootstrapModal(returnUrl) {
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

        if (typeof window.bootstrap === 'undefined' || typeof window.bootstrap.Modal === 'undefined') {
            showFallbackConfirm(returnUrl);
            return;
        }

        const modalEl = document.getElementById('inviteReturnModal');
        const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
        bsModal.show();

        document.getElementById('inviteGotoTrip').addEventListener('click', function () {
            if (window.InviteReturn && typeof window.InviteReturn.safeRedirect === 'function') {
                window.InviteReturn.safeRedirect();
            } else {
                try { deleteCookie('invite_return'); } catch { }
                window.location.href = returnUrl;
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
    }

    document.addEventListener('DOMContentLoaded', function () {
        // 讀取登入狀態（支援 boolean 或字串 "true"）
        let rawAuth = typeof window.isAuthenticated !== 'undefined' ? window.isAuthenticated : null;
        if (rawAuth === null && window.user && typeof window.user.isAuthenticated !== 'undefined') rawAuth = window.user.isAuthenticated;
        const isAuth = (rawAuth === true) || String(rawAuth).toLowerCase() === 'true';

        // 寬鬆判斷是否為首頁
        const path = (window.location.pathname || '/').replace(/\/+$/, '').toLowerCase();
        const isHome = path === '' || path === '/' || path === '/home' || path === '/home/index' || path === '/index';
        if (!isAuth) {
            try { if (getCookie('invite_return')) deleteCookie('invite_return'); } catch { }
            return;
        }
        if (!isHome) return;

        // 若 URL 已帶 ReturnUrl，跳過（不在首頁詢問）
        const qs = new URLSearchParams(window.location.search);
        if (qs.has('ReturnUrl') || qs.has('returnUrl')) return;

        // 以 Cookie 為主取得 returnUrl（InviteReturn helper 優先）
        const cookieReturn = (window.InviteReturn && typeof window.InviteReturn.get === 'function')
            ? window.InviteReturn.get()
            : getCookie('invite_return');

        if (!cookieReturn || !isLocalPath(cookieReturn)) {
            try { if (cookieReturn) deleteCookie('invite_return'); } catch { }
            return;
        }

        showBootstrapModal(cookieReturn);
    });
})();