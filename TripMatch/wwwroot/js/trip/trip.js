document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = "/api/TripApi"
    const grid = document.querySelector(".grid");

        // function 關閉選單
        function closeAllMenus(exceptMenu) {
            document.querySelectorAll(".menu.open").forEach(m => {
                if (m !== exceptMenu) m.classList.remove("open");
            });
        }

        // click 點空白處關閉選單
        document.addEventListener('click', () => closeAllMenus(null));

        grid?.addEventListener('click', async (e) => {
            const card = e.target.closest(".card");
            if (!card) {
                grid.innerHTML = "<p>還沒有行程</p>"; // 還要調整
                return;
            }

            const menu = card.querySelector(".menu");
            const kebab = e.target.closest(".kebab-btn");
            const menuItem = e.target.closest(".menu-item");

            // 三點選單
            if (kebab) {
                // 防止冒泡到父層(卡片層)
                e.stopPropagation();
                // willOpen -> true -> menu 是 close
                const willOpen = !menu.classList.contains("open");
                closeAllMenus(menu);
                // willOpen true 時，加上 "open"，反之移除
                menu.classList.toggle("open", willOpen);
                return;
            }

            // 點選單內項目
            if (menuItem && menu.contains(menuItem)) {
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
                        const ok = confirm("確定刪除此行程? 此操作無法還原。");
                        if (!ok) return;

                        try {
                            const res = await fetch(`("${API_BASE}/${tripId}`, {
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
                            alert("退出失敗，請稍後再試。");
                        }
                    }
                    return;
                }
            }

            // 點卡片其他區域 -> 跳轉到行程頁

         
            const detailsUrl = card.dataset.detailsUrl;
            if (detailsUrl && detailsUrl !== "#") {
                window.location.href = detailsUrl;
            }
        });



        // Modal 控制
        const membersModal = document.getElementById("membersModal");
        const membersList = document.getElementById("membersList");

        // 開啟 members modal
        async function openMembersModal(tripId) {
            // fake data
            membersList.innerHTML = `
            <li>載入中...</li>
        `;

            membersModal.hidden = false;

            try {
                const res = await fetch(`${API_BASE}/${tripId}/members`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" }
                });
                if (!res.ok) throw new Error(`Http ${res.status}`);

                const members = await res.json();
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
            } catch (err) {
                console.error(err);
                membersList.innerHTML = `<li>載入失敗，請稍後再試</li>`;
            }
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