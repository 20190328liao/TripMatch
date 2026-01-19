//Api helper
const DEMO_USER_ID = 1; // 暫時用假登入

async function apiFetch(url, options = {}) {
    const opt = {
        headers: {
            "Content-Type": "application/json",
            "X-Demo-UserId": String(DEMO_USER_ID),
            ...(options.headers || {})
        },
        ...options
    };

    const res = await fetch(url, opt);

    // 統一處理非 2xx
    if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try {
            const data = await res.json();
            msg = data?.message || data?.error || msg;
        }
        catch { }

        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    // Api 可能回空
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}