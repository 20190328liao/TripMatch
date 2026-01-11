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

    async function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT_MS) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url, Object.assign({}, opts, { signal: controller.signal }));
            return res;
        } finally {
            clearTimeout(id);
        }
    }

    async function fetchProfile() {
        try {
            const res = await fetchWithTimeout('/api/auth/GetMemberProfile', { credentials: 'same-origin' }, FETCH_TIMEOUT_MS);
            if (!res || !res.ok) return null;
            const data = await res.json();
            return data?.avatar ?? null;
        } catch {
            return null;
        }
    }

    async function init() {
        // 0. 立刻顯示：優先從 JWT 的 avatar claim（最即時），否則從 localStorage 快取（最快）
        const token = getCookie('AuthToken') ?? getCookie('authToken') ?? getCookie('Auth');
        if (token) {
            const payload = parseJwt(token);
            if (payload && payload.avatar) {
                setAvatars(payload.avatar);
                writeCache(payload.avatar);
                // 仍在背景去 API 驗證更新，但不要等待
                fetchProfile().then(apiAvatar => {
                    if (apiAvatar && apiAvatar !== payload.avatar) {
                        setAvatars(apiAvatar);
                        writeCache(apiAvatar);
                    }
                });
                return;
            }
        }

        const cached = readCache();
        if (cached) {
            setAvatars(cached);
            // 背景更新
            fetchProfile().then(apiAvatar => {
                if (apiAvatar && apiAvatar !== cached) {
                    setAvatars(apiAvatar);
                    writeCache(apiAvatar);
                }
            });
            return;
        }

        // 只有在沒有任何快取或 claim 時，顯示預設並嘗試 fetch（fetch 有 timeout）
        // 預設由伺服器或 img 標籤已設定；背景取得後更新
        const apiAvatar = await fetchProfile();
        if (apiAvatar) {
            setAvatars(apiAvatar);
            writeCache(apiAvatar);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();