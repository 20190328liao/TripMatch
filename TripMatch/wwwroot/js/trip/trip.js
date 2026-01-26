document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = "/api/TripApi"
    const grids = document.querySelectorAll(".grid");

        // function 關閉選單
        function closeAllMenus(exceptMenu) {
            document.querySelectorAll(".menu.open").forEach(m => {
                if (m !== exceptMenu) m.classList.remove("open");
            });
        }

        // click 點空白處關閉選單
        document.addEventListener('click', () => closeAllMenus(null));

    grids.forEach(grid => {
        grid?.addEventListener('click', async (e) =>
        {
            const card = e.target.closest(".card");
            if (!card) {
                return;
            }

            const menu = card.querySelector(".menu");
            const kebab = e.target.closest(".kebab-btn");
            const menuItem = e.target.closest(".menu-item");

            // 三點選單 (只處理有menu的卡片)
            if (kebab && menu) {
                // 防止冒泡到父層(卡片層)
                e.stopPropagation();
                // willOpen -> true -> menu 是 close
                const willOpen = !menu.classList.contains("open");
                closeAllMenus(menu);
                // willOpen true 時，加上 "open"，反之移除
                menu.classList.toggle("open", willOpen);
                return;
            }

            // 點選單內項目 (只處理有menu的卡片)
            if (menu && menuItem && menu.contains(menuItem)) {
                e.stopPropagation();
                closeAllMenus(null);

                const action = menuItem.dataset.action;
                const tripId = card.dataset.tripId;
                const isOwner = card.dataset.isOwner === "1"; // 先寫死1
                const membersUrl = card.dataset.membersUrl;

                if (action == "members") {
                    openMembersModal(card.dataset.tripId);
                    return;
                }

                if (action === "danger") {

                    if (isOwner) {
                        // 團主 => 刪除
                        const ok = confirm("分帳紀錄將一併刪除，確定刪除此行程? 此操作無法還原。");
                        if (!ok) return;

                        try {
                            const res = await fetch(`${API_BASE}/${tripId}`, {
                                method: "DELETE",
                                headers: { "X-Requested-With": "XMLHttpRequest" }
                            });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            card.remove();
                        } catch (err) {
                            console.error(err);
                            alert("刪除失敗，請稍後再試。");
                        }
                    }
                    else {
                        // 團員: 退出
                        const ok = confirm("確定退出此行程?");
                        if (!ok) return;

                        try {
                            const res = await fetch(`${API_BASE}/${tripId}/leave`, {
                                method: "POST",
                                headers: { "X-Requested-With": "XMLHttpRequest" }
                            });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            card.remove();
                        } catch (err) {
                            console.error(err);
                            alert("退出失敗 : 您在此行程仍有分帳或結算紀錄，請先刪除相關記帳紀錄後再試一次。");
                        }
                    }
                    return;
                }
            }

            // 如果選單開著，點卡片先不跳
            if (menu && menu.classList.contains("open")) {
                return;
            }

            // 點卡片其他區域 -> 跳轉到行程頁
            const detailsUrl = card.dataset.detailsUrl;
            if (detailsUrl && detailsUrl !== "#") {
                window.location.href = detailsUrl;
            }
        });
    });



    // Modal 控制
    const membersModal = document.getElementById("membersModal");
    const membersList = document.getElementById("membersList");
    const inviteCodeText = document.getElementById("inviteCodetext");
    const btnCopyIntive = document.getElementById("btnCopyInvite");
    const inviteHint = document.getElementById("inviteHint");

    // 開啟 members modal
    async function openMembersModal(tripId) {
        
        membersList.innerHTML = `<li>載入中...</li>`;
        inviteCodeText.textContent = "載入中...";
        inviteHint.textContent = "";
        btnCopyIntive.disabled = true;

        membersModal.hidden = false;

        try {
            const [membersRes, inviteRes] = await Promise.all([
                fetch(`${API_BASE}/${tripId}/members`, { headers: { "X-Requested-With": "XMLHttpRequest" } }),
                fetch(`${API_BASE}/${tripId}/invite-code`, { headers: { "X-Requested-With": "XMLHttpRequest" } }),
            ]);
            if (!membersRes.ok) throw new Error(`Members Http ${membersRes.status}`);
            if (!inviteRes.ok) throw new Error(`InviteCode Http ${inviteRes.status}`);

            const members = await membersRes.json();
            const inviteData = await inviteRes.json();

                // TripMember => 1:團主 2.成員
                membersList.innerHTML = members
                    .map(m => {
                        const roleText = (m.roleType === 1) ? "團主" : "成員";
                        const name = m.displayName ?? `User#${m.userId}`;
                        return `<li>${roleText}:${escapeHtml(name)}</li>`;
                    })
                    .join("");

                if (!members.length) {
                    membersList.innerHTML = `<li>尚無成員</li>`;
                }

            const code = inviteData?.inviteCode ?? "";
            const fullUrl = `${window.location.origin}/Trip/Join/${code}`;
            inviteCodeText.textContent = fullUrl || "(無)";
            btnCopyIntive.disabled = !code;

            btnCopyIntive.onclick = async () => {
                await copyTextToClipboard(fullUrl);
                inviteHint.textContent = "已複製邀請連結";
                setTimeout(() => { inviteHint.textContent = ""; }, 1500);
            }
        } catch (err) {
            console.error(err);
            membersList.innerHTML = `<li>載入失敗，請稍後再試</li>`;
            inviteCodeText.textContent = "載入失敗";
            btnCopyIntive.disabled = true;
        }

    }

    async function copyTextToClipboard(text) {
        // 優先使用 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        // fallback : textarea + execCommand
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.body.execCommand("copy");
        document.body.removeChild(ta);
    }

    function closeMembersModal() {
        membersModal.hidden = true;
        membersList.innerHTML = "";
    }

        // 綁定 關閉modal事件
    membersModal.addEventListener('click', (e) => {
        if (e.target.classList.contains("modal-backdrop") ||
            e.target.classList.contains("modal-close") ||
            e.target.classList.contains("btn-close")
        ) {
            closeMembersModal();
        }
    });

    // 防 XSS：把名字當純文字
    function escapeHtml(s) {
        return String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

});