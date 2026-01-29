/**
 * TripMatch 自動化註冊腳本
 * 用途：自動產生 3 組帶有頭像與真實姓名的假帳號
 * 執行方式：node create_users.js
 */

// ================= 設定區 =================
const BASE_URL = "https://localhost:5223"; // 請確認您的 Port
const PASSWORD = "P@ssword123!";
const COUNT = 3; // 要建立的帳號數量
// ==========================================

// 忽略自簽憑證錯誤 (給 Localhost 開發用)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. 取得假身分 (RandomUser)
async function getRandomIdentity() {
    try {
        const res = await fetch("https://randomuser.me/api/?nat=us");
        const data = await res.json();
        const user = data.results[0];
        return {
            first: user.name.first,
            last: user.name.last,
            avatarUrl: user.picture.large
        };
    } catch (e) {
        console.error("❌ 取得假身分失敗:", e.message);
        return null;
    }
}

// 2. 產生 1secmail 信箱
function getTempEmail() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let username = '';
    for (let i = 0; i < 10; i++) {
        username += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const domain = "1secmail.com";
    return { email: `${username}@${domain}`, login: username, domain };
}

// 3. 輪詢收信
async function waitForEmail(login, domain) {
    console.log(`   ⏳ 等待驗證信 (${login}@${domain})...`);
    for (let i = 0; i < 20; i++) { // 嘗試 20 次
        try {
            const res = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
            const messages = await res.json();
            if (messages.length > 0) return messages[0].id;
        } catch (e) {}
        await delay(3000); // 等 3 秒
    }
    return null;
}

// 4. 提取驗證連結
async function getVerifyLink(login, domain, id) {
    const res = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${id}`);
    const data = await res.json();
    const body = data.body || "";
    
    // Regex 抓取 TripMatch 驗證連結
    const match = body.match(/(https?:\/\/[^"\s>]*ConfirmEmail[^"\s<]*)/);
    return match ? match[1].replace(/&amp;/g, '&') : null;
}

// === 主流程 ===
async function createAccount(index) {
    console.log(`\n🚀 [第 ${index + 1} 組] 開始建立...`);
    
    // Step A: 準備資料
    const identity = await getRandomIdentity();
    const { email, login, domain } = getTempEmail();
    console.log(`   👤 身分: ${identity.first} ${identity.last}`);
    console.log(`   📧 信箱: ${email}`);

    // Cookie 容器 (模擬瀏覽器 Session)
    let cookies = "";

    // Step B: 發送驗證信
    // 注意：fetch 預設不存 cookie，我們需要手動抓 header
    const sendRes = await fetch(`${BASE_URL}/api/auth/SendConfirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email)
    });

    if (!sendRes.ok) {
        console.log(`   ❌ 發送驗證信失敗: ${sendRes.status}`);
        return;
    }
    
    // 抓取 Set-Cookie (重要：PendingEmail 需要這個)
    const setCookie = sendRes.headers.get('set-cookie');
    if (setCookie) cookies = setCookie;

    // Step C: 收信 & 驗證
    const msgId = await waitForEmail(login, domain);
    if (!msgId) { console.log("   ❌ 收不到信，跳過。"); return; }

    const link = await getVerifyLink(login, domain, msgId);
    if (!link) { console.log("   ❌ 找不到連結，跳過。"); return; }

    // 點擊驗證連結 (這裡通常不回傳 cookie，或是會更新 cookie)
    await fetch(link);
    console.log("   ✅ Email 驗證成功");

    // Step D: 完成註冊 (設定密碼)
    // 這裡必須帶上之前的 cookies (PendingEmail)
    const regRes = await fetch(`${BASE_URL}/api/auth/Register`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Cookie": cookies 
        },
        body: JSON.stringify({ Email: email, Password: PASSWORD, ConfirmPassword: PASSWORD })
    });

    if (!regRes.ok) { console.log(`   ❌ 註冊失敗: ${await regRes.text()}`); return; }
    console.log("   ✅ 帳號註冊完成");

    // Step E: 登入 (為了拿 AuthToken 上傳頭像)
    const loginRes = await fetch(`${BASE_URL}/api/auth/Signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Email: email, Password: PASSWORD })
    });
    
    // 更新 Cookie (拿到 AuthToken)
    const loginCookies = loginRes.headers.get('set-cookie');
    if (loginCookies) cookies = loginCookies; // 覆蓋或合併

    // Step F: 上傳頭像 & 更新姓名
    if (loginRes.ok) {
        // 下載頭像圖片轉 Blob
        const imgRes = await fetch(identity.avatarUrl);
        const imgBuffer = await imgRes.arrayBuffer();
        const formData = new FormData();
        // Node.js 的 fetch FormData 需要一點技巧，或是用 Blob
        const blob = new Blob([imgBuffer], { type: 'image/jpeg' });
        formData.append('avatarFile', blob, 'avatar.jpg');

        const uploadRes = await fetch(`${BASE_URL}/api/auth/UploadAvatar`, {
            method: "POST",
            headers: { "Cookie": cookies }, // 帶入 AuthToken
            body: formData
        });

        const nameRes = await fetch(`${BASE_URL}/api/auth/UpdateFullName`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Cookie": cookies 
            },
            body: JSON.stringify({ FullName: `${identity.first} ${identity.last}` })
        });

        if (uploadRes.ok && nameRes.ok) console.log("   ✅ 頭像與姓名更新成功！");
    }
}

// 執行 3 次
(async () => {
    console.log("=== 自動化帳號建立開始 ===");
    for (let i = 0; i < COUNT; i++) {
        await createAccount(i);
    }
    console.log("\n=== 全部完成！請檢查資料庫 ===");
})();