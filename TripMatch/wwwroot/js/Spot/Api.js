// Api helper（正式登入版）
async function apiFetch(url, options = {}) {
    const opt = {
        method: options.method || "GET",
        credentials: "same-origin", // ★ 必加：帶 Cookie 給 [Authorize]
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    };

    const res = await fetch(url, opt);

    if (!res.ok) {
        if (res.status === 401) {
            throw new Error("尚未登入或登入已失效");
        }

        let msg = `${res.status} ${res.statusText}`;
        try {
            const data = await res.json();

            console.error("API error payload:", data);

            msg = data?.message || msg;
        } catch { }

        throw new Error(msg);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
}
