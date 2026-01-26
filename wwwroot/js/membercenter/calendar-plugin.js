(() => {
  'use strict';

  // 不污染全域命名空間：掛在 window.TripMatchCalendarPlugin 下（可選）
  const ns = (window.TripMatchCalendarPlugin = window.TripMatchCalendarPlugin || {});

  // 讀取 sessionStorage key（由 CalendarCheck 在提交時設定）
  const PENDING_KEY = 'calendar_check_pending';

  function createModal(html) {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal-overlay';
    overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2000;';
    const box = document.createElement('div');
    box.className = 'tm-modal-box';
    box.style = 'width:420px;max-width:94%;background:#fff;border-radius:12px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,0.15);';
    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return { overlay, box };
  }

  function showNotification(msg, type = 'info') {
    // 簡單 toast（不依賴其他 code）
    const t = document.createElement('div');
    t.textContent = msg;
    t.style = 'position:fixed;right:18px;bottom:18px;padding:10px 14px;border-radius:8px;color:#fff;z-index:2100;font-weight:600;';
    t.style.background = type === 'error' ? '#ef4444' : '#155DFC';
    document.body.appendChild(t);
    setTimeout(() => t.style.opacity = '0', 2400);
    setTimeout(() => t.remove(), 3000);
  }

  async function fetchLeaves() {
    try {
      const res = await fetch('/api/auth/GetLeaves', { method: 'GET', credentials: 'include' });
      if (!res.ok) throw new Error('無法取得行事曆');
      const json = await res.json();
      return json?.dates || [];
    } catch (e) {
      console.error('fetchLeaves error', e);
      return null;
    }
  }

  function dispatchImportedEvent(dates) {
    try {
      const ev = new CustomEvent('tripmatch:leavesImported', { detail: { dates } });
      window.dispatchEvent(ev);
    } catch (e) { console.warn(e); }
  }

  // handleImport 支援 redirectAfter 參數（匯入完成後是否導回 CalendarCheck/{groupId}）
  async function handleImport(actionContext = { groupId: null, redirectAfter: false }) {
    const dates = await fetchLeaves();
    if (!Array.isArray(dates)) {
      showNotification('匯入失敗：無法讀取個人行事曆', 'error');
      return false;
    }

    // 將原始日期陣列發送給頁面中的 Calendar 元件或其他 listener
    dispatchImportedEvent(dates);

    // 如果頁面有 window.Calendar 且支援 import 類方法，嘗試呼叫
    try {
      if (window.Calendar && typeof window.Calendar.importDates === 'function') {
        window.Calendar.importDates(dates);
      }
    } catch (e) {
      console.warn('Calendar.importDates failed', e);
    }

    showNotification('已從個人行事曆匯入 ' + dates.length + ' 筆', 'info');

    // 清除 pending flag（使用者已處理）
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }

    // 若要求匯入後導回 CalendarCheck/{groupId}
    if (actionContext && actionContext.redirectAfter && actionContext.groupId) {
      // 小延遲讓 UI 有短暫反饋
      setTimeout(() => {
        window.location.href = `/Match/CalendarCheck/${encodeURIComponent(actionContext.groupId)}`;
      }, 400);
    }

    return true;
  }

  function showPendingModal(payload) {
    const groupId = payload?.groupId;
    const html = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="font-size:18px;font-weight:700;">您剛剛從行程時間檢查返回</div>
        <div style="color:#6b7280;font-size:14px;">您可以選擇「繼續提交」保留在會員中心繼續操作，或「從個人行事曆匯入」直接匯入資料並回到媒合頁面。</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button id="tm-btn-import" style="background:#10B981;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;">從個人行事曆匯入</button>
          <button id="tm-btn-continue" style="background:#155DFC;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;">繼續提交</button>
          <button id="tm-btn-gocal" style="background:#e5e7eb;color:#111;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;">前往會員中心行事曆</button>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:6px;">
          <button id="tm-btn-cancel" style="background:transparent;border:0;color:#6b7280;cursor:pointer;">取消</button>
        </div>
      </div>
    `;
    const { overlay } = createModal(html);

    const btnImport = overlay.querySelector('#tm-btn-import');
    const btnContinue = overlay.querySelector('#tm-btn-continue');
    const btnGoCal = overlay.querySelector('#tm-btn-gocal');
    const btnCancel = overlay.querySelector('#tm-btn-cancel');

    btnImport.addEventListener('click', async () => {
      btnImport.disabled = true;
      await handleImport({ groupId, redirectAfter: true });
      // modal 交由 handleImport 的 redirect 處理；若沒有 redirect 則移除 modal
      try { overlay.remove(); } catch (e) { }
    });

    btnContinue.addEventListener('click', () => {
      // 留在會員中心，關閉 modal，但不移除浮動通知（允許再次開啟）
      try { overlay.remove(); } catch (e) { }
    });

    btnGoCal.addEventListener('click', () => {
      // 與「繼續提交」行為相同：留在會員中心（依你要求）
      try { overlay.remove(); } catch (e) { }
    });

    btnCancel.addEventListener('click', () => {
      // 取消：清除 flag 並移除所有 UI（modal + 浮動 badge）
      try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { }
      try { overlay.remove(); } catch (e) { }
      removeFloatingBadge();
    });

    // 點 overlay 空白處也只關閉 modal但保留 pending key（如需求）
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // 建立靠右上圓形浮動通知 badge（縮放動畫、可點開）
  const FLOAT_ID = 'tm-floating-badge';
  function createFloatingBadge(payload) {
    // 若已存在則回傳
    if (document.getElementById(FLOAT_ID)) return;

    const badge = document.createElement('div');
    badge.id = FLOAT_ID;
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-label', '行程時間已提交提醒');
    badge.style.position = 'fixed';
    badge.style.top = '18px';
    badge.style.right = '18px';
    badge.style.width = '56px';
    badge.style.height = '56px';
    badge.style.borderRadius = '50%';
    badge.style.background = '#155DFC';
    badge.style.color = '#fff';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
    badge.style.zIndex = '2200';
    badge.style.cursor = 'pointer';
    badge.style.transform = 'scale(0)';
    badge.style.transition = 'transform 260ms cubic-bezier(.2,.9,.3,1)';

    // 內部圖示（簡單 tick）
    badge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" stroke="#fff"/></svg>`;

    // 小的取消按鈕（放在 badge 的右下角）
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.title = '關閉提醒';
    cancel.style.position = 'absolute';
    cancel.style.width = '18px';
    cancel.style.height = '18px';
    cancel.style.borderRadius = '50%';
    cancel.style.border = 'none';
    cancel.style.right = '-6px';
    cancel.style.bottom = '-6px';
    cancel.style.background = '#fff';
    cancel.style.color = '#111';
    cancel.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
    cancel.style.cursor = 'pointer';
    cancel.style.padding = '0';
    cancel.style.display = 'flex';
    cancel.style.alignItems = 'center';
    cancel.style.justifyContent = 'center';
    cancel.style.fontSize = '12px';
    cancel.innerText = '×';

    // 點擊 badge 開 modal；點擊 cancel 移除 badge
    badge.addEventListener('click', (e) => {
      // 若點到 cancel，事件會先在 cancel 處理，避免觸發此處（stopPropagation）
      if (e.target === cancel) return;
      showPendingModal(payload || {});
    });

    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      // 移除 flag 並移除 badge
      try { sessionStorage.removeItem(PENDING_KEY); } catch (err) { }
      removeFloatingBadge();
    });

    badge.appendChild(cancel);
    document.body.appendChild(badge);

    // 進場動畫
    requestAnimationFrame(() => {
      badge.style.transform = 'scale(1)';
    });
  }

  function removeFloatingBadge() {
    const el = document.getElementById(FLOAT_ID);
    if (!el) return;
    try {
      el.style.transform = 'scale(0)';
      setTimeout(() => { try { el.remove(); } catch { } }, 260);
    } catch (e) { try { el.remove(); } catch { } }
  }

  // 新增：後端檢查，確認該 user 在該 group 是否已儲存 MemberTimeSlots
  async function userHasTimeSlots(groupId) {
    if (!groupId) return false;
    try {
      const res = await fetch(`/api/timewindow/${encodeURIComponent(groupId)}/me`, { credentials: 'include' });
      if (!res.ok) return false;
      const json = await res.json();
      // 使用 TimeWindowApiController.GetMyStatus 回傳的 hasSelectedTimeRange 欄位
      return !!json.hasSelectedTimeRange;
    } catch (e) {
      console.warn('userHasTimeSlots failed', e);
      return false;
    }
  }

  function tryShowIfPending() {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);

      // payload 必須存在且包含 groupId
      if (!payload || !payload.groupId) return;

      // 嚴格檢查：require that the user came from Match/CalendarCheck/{groupId}
      try {
        const expectedPath = `/Match/CalendarCheck/${encodeURIComponent(payload.groupId)}`;
        const ref = document.referrer || '';
        const originAndPath = ref.startsWith(location.origin) ? ref.substring(location.origin.length) : ref;
        if (!ref || !originAndPath.startsWith(expectedPath)) {
          // 如果 referrer 沒有匹配，則不自動彈出（避免打擾）
          return;
        }
      } catch (e) {
        console.warn('referrer check failed', e);
        return;
      }

      // 進一步向後端確認使用者是否真的有儲存 MemberTimeSlots（避免無用提醒）
      userHasTimeSlots(payload.groupId).then(hasSlots => {
        if (hasSlots) {
          // 小幅延遲，等 MemberCenter DOM 載入完畢，再顯示浮動 badge
          setTimeout(() => createFloatingBadge(payload), 250);
        } else {
          // 若 DB 查不到資料，就清除 pending flag，避免反覆提醒
          try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { }
        }
      }).catch(err => {
        console.warn('userHasTimeSlots check error', err);
      });
    } catch (e) {
      console.warn('tryShowIfPending parse failed', e);
    }
  }

  // 對外 API（若別的模組想主動觸發）
  ns.showPendingModal = showPendingModal;
  ns.fetchLeaves = fetchLeaves;
  ns.handleImport = handleImport;

  // 新增：在其它頁面（例如 CalendarCheck）呼叫此方法來設定 flag 並導回會員中心
  ns.markPending = function markPending(groupId) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ groupId: groupId ?? null }));
    } catch (e) {
      /* ignore storage errors */
      console.warn('markPending storage failed', e);
    }
  };

  // 新增：標記後直接導回會員中心（簡單封裝）
  ns.markPendingAndRedirectToMemberCenter = function markPendingAndRedirectToMemberCenter(groupId) {
    ns.markPending(groupId);
    // 導回會員中心 anchor（讓 plugin 在 MemberCenter 頁面顯示浮動通知）
    window.location.href = '/Auth/MemberCenter#calendar_section';
  };

  // 初始化（當在會員中心頁面載入時）
  document.addEventListener('DOMContentLoaded', () => {
    tryShowIfPending();

    // 允許其他模組用事件接收匯入結果
    // window.addEventListener('tripmatch:leavesImported', e => console.log('dates imported', e.detail.dates));
  });

})();

// 為 #btn-confirm 綁定點擊，顯示 calendar-plugin 提供的 modal（或 fallback）
(function () {
    'use strict';

    function safeJsonParse(s) {
        try { return JSON.parse(s); } catch { return null; }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const btn = document.getElementById('btn-confirm');
        if (!btn) return;

        btn.addEventListener('click', function (e) {
            e.preventDefault();

            // 嘗試使用已存在的 plugin API 顯示提示 modal
            if (window.TripMatchCalendarPlugin && typeof window.TripMatchCalendarPlugin.showPendingModal === 'function') {
                // 若你有 groupId，可以傳入 { groupId: '...' }，此處嘗試從 DOM dataset 或 sessionStorage 讀取
                let payload = null;
                // 1) 如果頁面有隱藏 input 或 data 屬性，可在此取得
                const el = document.querySelector('[data-group-id]');
                if (el) payload = { groupId: el.getAttribute('data-group-id') };

                // 2) 如果 sessionStorage 有先前紀錄，也可以讀
                if (!payload) {
                    const raw = sessionStorage.getItem('calendar_check_pending');
                    if (raw) payload = safeJsonParse(raw) || null;
                }

                try {
                    window.TripMatchCalendarPlugin.showPendingModal(payload || {});
                } catch (ex) {
                    console.warn('showPendingModal failed', ex);
                    fallbackConfirmSubmit();
                }
                return;
            }

            // fallback: 原生確認對話框；若確定，執行提交（呼叫原本 submit handler 或導頁）
            fallbackConfirmSubmit();
        });

        function fallbackConfirmSubmit() {
            if (!confirm('確定要提交目前選擇的日期嗎？確定後系統會儲存並開始媒合流程。')) return;
            // 範例：若你要呼叫 Calendar 的提交按鈕邏輯（原本綁在 .confirm 上），可觸發其 click
            const calendarConfirm = document.querySelector('.confirm');
            if (calendarConfirm && typeof calendarConfirm.click === 'function') {
                calendarConfirm.click();
                return;
            }
            // 否則依照你的流程導向或呼叫 API（必要時改成你專案的實作）
            // window.location.href = '/Match/CalendarCheck/yourGroupId';
            console.warn('已確認，但找不到內部提交處理器，請補上提交邏輯');
        }
    });
})();