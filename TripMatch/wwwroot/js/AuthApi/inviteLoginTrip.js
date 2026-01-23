(function () {
    'use strict';

    function getCookie(name) {
        const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return match ? decodeURIComponent(match.pop()) : null;
    }

    function deleteCookie(name) {
        // 將 path=/ 與 max-age 清除，嘗試多種寫法以提高相容性
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }

    function isLocalPath(url) {
        if (!url) return false;
        // 必須以 '/' 開頭，且不能為 '//' 或帶有 schema (http://)
        if (!url.startsWith('/')) return false;
        if (url.startsWith('//')) return false;
        if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url)) return false;
        return true;
    }

    // 供其他腳本安全取用與導向
    window.InviteReturn = {
        get: function () {
            return getCookie('invite_return');
        },
        consume: function () {
            const val = getCookie('invite_return');
            try { deleteCookie('invite_return'); } catch { /* ignore */ }
            return val;
        },
        safeRedirect: function (fallback) {
            const raw = getCookie('invite_return');
            if (raw && isLocalPath(raw)) {
                try { deleteCookie('invite_return'); } catch { }
                window.location.href = raw;
                return;
            }
            if (fallback) window.location.href = fallback;
        },
        // 若需要把 login/register 連結補上 returnUrl，使用此 helper
        applyToLinks: function () {
            const raw = getCookie('invite_return');
            if (!raw || !isLocalPath(raw)) return;
            const encoded = encodeURIComponent(raw);
            // 更新常見的登入/註冊連結
            document.querySelectorAll('a[href*="/Auth/Login"], a[href*="/Auth/Signup"], a[href*="/Auth/Registrar"]').forEach(a => {
                try {
                    const href = a.getAttribute('href') || '';
                    const base = href.split('?')[0];
                    a.setAttribute('href', `${base}?ReturnUrl=${encoded}`);
                } catch { /* ignore */ }
            });
            // 若有 hidden input #returnUrl，設其值
            const returnInput = document.querySelector('#returnUrl, input[name="returnUrl"]');
            if (returnInput) {
                try { (returnInput).value = raw; } catch { /* ignore */ }
            }
        }
    };

    // 頁面載入時自動把 returnUrl 填到連結 / hidden input（但不自動跳轉）
    document.addEventListener('DOMContentLoaded', function () {
        try {
            window.InviteReturn.applyToLinks();
        } catch (e) {
            // 忽略前端錯誤，不影響主流程
            console.warn('InviteReturn.applyToLinks failed', e);
        }
    });

})();