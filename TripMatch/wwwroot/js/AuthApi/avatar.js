// 加快 avatar 顯示：優先從 JWT cookie / localStorage 快取取出立即顯示，背景非同步再向 API 驗證更新
(function () {
    const CACHE_KEY = 'tm_avatar';
    const CACHE_TTL_MS = 60 * 60 * 1000; // 快取 1 小時
    const FETCH_TIMEOUT_MS = 2000; // API 等待上限 2s

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^|;\\s*)' + name.replace(/([.*+?^=!:${}()|[\]\\/\\])/g, '\\$1') + '=([^;]*)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function base64UrlDecodeToString(base64Url) {
        let s = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4;
        if (pad) s += '='.repeat(4 - pad);
        const binary = atob(s);
        if (typeof TextDecoder !== 'undefined') {
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder().decode(bytes);
        }
        let percentEncoded = '';
        for (let i = 0; i < binary.length; i++) {
            percentEncoded += '%' + ('00' + binary.charCodeAt(i).toString(16)).slice(-2);
        }
        return decodeURIComponent(percentEncoded);
    }

    function parseJwt(token) {
        try {
            const payload = token.split('.')[1];
            if (!payload) return null;
            return JSON.parse(base64UrlDecodeToString(payload));
        } catch {
            return null;
        }
    }

    function setImgSrcSafe(el, url) {
        try {
            if (!el) return;
            if (el.src !== url) el.src = url;
        } catch { /* ignore */ }
    }

    function setAvatars(url) {
        if (!url) return;
        // preload image to avoid broken src flash
        preloadImage(url).then(() => {
            setImgSrcSafe(document.getElementById('navAvatar'), url);
            setImgSrcSafe(document.getElementById('memberAvatar'), url);
        }).catch(() => {
            // 若 preload 失敗，不做任何事（保留預設）
        });
    }

    function preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => reject(new Error('image load failed'));
            img.src = url;
        });
    }

    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || !obj.url || !obj.ts) return null;
            if ((Date.now() - obj.ts) > CACHE_TTL_MS) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return obj.url;
        } catch {
            return null;
        }
    }

    function writeCache(url) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ url, ts: Date.now() }));
        } catch { /* ignore */ }
    }

    // fetch wrapper：預設帶上 credentials，並支援 timeout
    async function fetchWithTimeout(url, options = {}, timeout = 5000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        // 確保會攜帶 cookie（包含 cross-origin 或不同 port 的情況）
        options = {
            credentials: 'include',
            signal: controller.signal,
            ...options
        };

        try {
            const resp = await fetch(url, options);
            return resp;
        } finally {
            clearTimeout(id);
        }
    }

    // 直接向 API 請求會員資料（若頁面上沒有 avatar 元素則不呼叫）
    async function fetchProfile() {
        // 如果頁面沒有任何 avatar img 元素，跳過呼叫以避免不必要的 401
        if (!document.getElementById('navAvatar') && !document.getElementById('memberAvatar')) {
            return null;
        }

        try {
            const res = await fetchWithTimeout('/api/auth/GetMemberProfile', {}, FETCH_TIMEOUT_MS);
            if (!res) return null;
            if (res.status === 401) return null; // 未授權：靜默處理
            if (!res.ok) return null;
            const data = await res.json();
            return data?.avatar ?? null;
        } catch {
            return null;
        }
    }

    async function init() {
        // 0. 立刻顯示：優先從 JWT 的 avatar claim（若可讀），否則從 localStorage 快取（最快）
        const token = getCookie('AuthToken') ?? getCookie('authToken') ?? getCookie('Auth');
        if (token) {
            const payload = parseJwt(token);
            if (payload && payload.avatar) {
                setAvatars(payload.avatar);
                writeCache(payload.avatar);
            }
        }

        const cached = readCache();
        if (cached) {
            setAvatars(cached);
        }

        // 背景嘗試呼叫 API 以取得最新 avatar（重要：不要以是否能讀 cookie 作為是否呼叫 API 的條件，
        // 因為 AuthToken cookie 在伺服器端通常為 HttpOnly，client 讀不到但 fetch 仍可帶 cookie）
        fetchProfile().then(apiAvatar => {
            if (apiAvatar && apiAvatar.length > 0) {
                // 若尚未顯示或與現有不同，更新並快取
                if (apiAvatar !== cached) {
                    setAvatars(apiAvatar);
                    writeCache(apiAvatar);
                }
            }
        }).catch(() => { /* 忽略背景錯誤 */ });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

(function () {
    const STYLE_ID = "avatar-global-style";

    function ensureAvatarStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
.avatarImg {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border: 1px solid #ddd;
}
@media (max-width: 576px) {
  .avatarImg { width: 32px; height: 32px; }
}
`;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function applyAvatarClass() {
        // 可能出現 avatar 的常見 selector，必要時可擴充
        const selectors = [
            "img#navAvatar",
            "img.avatarImg",
            "img.avatar",
            "img[data-avatar]",
            "img[id^='avatar']"
        ];
        selectors.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
                if (el.tagName === "IMG") el.classList.add("avatarImg");
            });
        });
    }

    // 初始化
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            ensureAvatarStyle();
            applyAvatarClass();
        });
    } else {
        ensureAvatarStyle();
        applyAvatarClass();
    }

    // 對外提供 API，若 avatar 是動態更新可呼叫 applyAvatarClass()
    window.AvatarHelper = {
        ensureAvatarStyle,
        applyAvatarClass
    };
})();