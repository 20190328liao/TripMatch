(() => {
  'use strict';

  const DEBUG = true;
  const ns = (window.TripMatchCalendarPlugin = window.TripMatchCalendarPlugin || {});
  const PENDING_KEY = 'calendar_check_pending';
  const BELL_FLAG = 'calendar_pending_bell_shown';

  // keep last error for easier diagnostics
  window.__tripmatch_last_modal_error = window.__tripmatch_last_modal_error || null;
  ns.getLastModalError = () => window.__tripmatch_last_modal_error;

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (e) { if (DEBUG) console.warn('safeParse failed', e, raw); return null; }
  }

  // Local helper: 將單日 ISO 陣列合併為 ranges {startAt,endAt}
  function datesToRangesLocal(dates) {
    if (!Array.isArray(dates) || dates.length === 0) return [];
    const sorted = Array.from(new Set(dates.map(d => (typeof d === 'string' ? d.slice(0, 10) : '')))).filter(Boolean).sort();
    const out = [];
    let segStart = sorted[0], prev = sorted[0];
    const nextIso = (iso) => {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      if (cur === nextIso(prev)) { prev = cur; continue; }
      out.push({ startAt: segStart + 'T00:00:00', endAt: prev + 'T23:59:59' });
      segStart = cur; prev = cur;
    }
    out.push({ startAt: segStart + 'T00:00:00', endAt: prev + 'T23:59:59' });
    return out;
  }

  function createModal(html) {
    try {
      if (DEBUG) console.debug('[calendar-plugin] createModal()');
      const overlay = document.createElement('div');
      overlay.className = 'tm-modal-overlay';
      overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2000;';
      const box = document.createElement('div');
      box.className = 'tm-modal-box';
      box.style = 'width:420px;max-width:94%;background:#fff;border-radius:12px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,0.15);';
      box.innerHTML = html;
      overlay.appendChild(box);
      // ensure body exists
      if (!document.body) {
        if (DEBUG) console.warn('[calendar-plugin] document.body not ready, appending later');
        setTimeout(() => {
          try { document.body.appendChild(overlay); } catch (e) { console.error('[calendar-plugin] append overlay failed', e); window.__tripmatch_last_modal_error = e; }
        }, 50);
      } else {
        document.body.appendChild(overlay);
      }
      return { overlay, box };
    } catch (e) {
      console.error('[calendar-plugin] createModal exception', e);
      window.__tripmatch_last_modal_error = e;
      return { overlay: null, box: null };
    }
  }

  function showNotification(msg, type = 'info') {
    try {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style = 'position:fixed;right:18px;bottom:18px;padding:10px 14px;border-radius:8px;color:#fff;z-index:2100;font-weight:600;';
      t.style.background = type === 'error' ? '#ef4444' : '#155DFC';
      document.body.appendChild(t);
      setTimeout(() => t.style.opacity = '0', 2400);
      setTimeout(() => t.remove(), 3000);
    } catch (e) {
      console.error('[calendar-plugin] showNotification failed', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  async function fetchLeaves() {
    try {
      const res = await fetch('/api/auth/GetLeaves', { method: 'GET', credentials: 'include' });
      if (!res.ok) throw new Error('無法取得行事曆');
      const json = await res.json();
      return json?.dates || [];
    } catch (e) {
      console.error('fetchLeaves error', e);
      window.__tripmatch_last_modal_error = e;
      return null;
    }
  }

  function dispatchImportedEvent(dates) {
    try {
      const ev = new CustomEvent('tripmatch:leavesImported', { detail: { dates } });
      window.dispatchEvent(ev);
    } catch (e) { console.warn(e); window.__tripmatch_last_modal_error = e; }
  }

  /**
   * handleImport
   * - 若 actionContext.groupId 存在：將個人行事曆轉為 draft ranges，寫入 sessionStorage，並導回 /Match/CalendarCheck/{groupId}
   * - 否則：只在當前頁面匯入到 window.Calendar 作預覽（原本行為）
   */
  async function handleImport(actionContext) {
    try {
      if (DEBUG) console.debug('[calendar-plugin] handleImport', actionContext);
      const dates = await fetchLeaves();
      if (!Array.isArray(dates)) {
        showNotification('匯入失敗：無法讀取個人行事曆', 'error');
        return;
      }

      // 如果 caller 傳入 groupId，我們要把資料儲存為 draft 並導回 CalendarCheck（匯入並儲存至媒合由 CalendarCheck / import flow 處理）
      const groupId = actionContext && actionContext.groupId ? actionContext.groupId : null;
      if (groupId) {
        try {
          const ranges = datesToRangesLocal(dates);
          const payload = { groupId: groupId, ranges: ranges, dates: dates, savedAt: new Date().toISOString() };
          sessionStorage.setItem('calendar_draft_ranges', JSON.stringify(payload));
          // 也放一個 pending key 讓 CalendarCheck 或 plugin 知道有待處理
          sessionStorage.setItem(PENDING_KEY, JSON.stringify({ groupId: groupId }));
        } catch (e) {
          console.warn('[calendar-plugin] write draft failed', e);
          window.__tripmatch_last_modal_error = e;
        }

        // 導回 CalendarCheck 讓使用者在媒合頁面繼續操作（符合你的需求）
        window.location.href = `/Match/CalendarCheck/${encodeURIComponent(groupId)}`;
        return;
      }

      // 否則保留原先行為：在當前頁直接匯入 Calendar UI 作預覽
      dispatchImportedEvent(dates);
      try {
        if (window.Calendar && typeof window.Calendar.importDates === 'function') {
          window.Calendar.importDates(dates);
        }
      } catch (e) { console.warn('Calendar.importDates failed', e); window.__tripmatch_last_modal_error = e; }
      showNotification('已從個人行事曆匯入 ' + dates.length + ' 筆', 'info');
      // keep pending key removed since user handled import on-page
      sessionStorage.removeItem(PENDING_KEY);
      // keep bell flag as-is (if present) — do not force-remove here
      try { document.getElementById('tm-pending-bell')?.remove(); } catch {}
    } catch (e) {
      console.error('[calendar-plugin] handleImport error', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  function isMemberCenterCalendarPage() {
    try {
      const r = location.pathname.startsWith('/Auth/MemberCenter') &&
        (location.hash === '#calendar_section' || document.querySelector('.member_center_wrap') !== null);
      if (DEBUG) console.debug('[calendar-plugin] isMemberCenterCalendarPage ->', r, location.pathname, location.hash, !!document.querySelector('.member_center_wrap'));
      return r;
    } catch (e) {
      console.warn('isMemberCenterCalendarPage error', e);
      window.__tripmatch_last_modal_error = e;
      return false;
    }
  }

  function createBellUI(payload) {
    try {
      const existingBell = document.getElementById('tm-pending-bell');
      if (existingBell) {
        // 如果之前被隱藏，重顯；若已存在且可見，直接返回
        if (existingBell.style && existingBell.style.display === 'none') existingBell.style.display = 'flex';
        if (DEBUG) console.debug('[calendar-plugin] bell exists, ensure visible');
        return;
      }

      try { sessionStorage.setItem(BELL_FLAG, '1'); } catch {}
      const bell = document.createElement('div');
      bell.id = 'tm-pending-bell';
      bell.setAttribute('role', 'button');
      bell.setAttribute('aria-label', '行事曆提醒，點擊打開設定');
      bell.style = [
        'position:fixed',
        'right:18px',
        'bottom:18px',
        'width:56px',
        'height:56px',
        'border-radius:50%',
        'background:linear-gradient(135deg,#10B981,#06B6D4)',
        'box-shadow:0 8px 24px rgba(2,6,23,0.2)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'z-index:2200',
        'cursor:pointer'
      ].join(';');

      bell.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 22c1.1046 0 2-.8954 2-2H10c0 1.1046.8954 2 2 2Z" fill="#fff"/>
          <path d="M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 1 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="#fff"/>
        </svg>
      `;

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.title = '關閉提醒';
      closeBtn.setAttribute('aria-label', '關閉提醒');
      closeBtn.style = 'position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;border:none;background:#fff;color:#333;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 12px rgba(0,0,0,0.12);cursor:pointer;';
      closeBtn.innerHTML = '×';
      // IMPORTANT: 隱藏 bell DOM，但保留 BELL_FLAG 以便下次進入 /Auth/MemberCenter#calendar_section 可再次初始化（使用者希望下次仍看到 modal/鈴鐺）
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          const el = document.getElementById('tm-pending-bell');
          if (el) el.style.display = 'none';
          // 不移除 sessionStorage 的 BELL_FLAG
        } catch (ex) { console.warn(ex); window.__tripmatch_last_modal_error = ex; }
      });

      bell.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const raw = sessionStorage.getItem(PENDING_KEY);
          const p = safeParse(raw) || payload;
          if (isMemberCenterCalendarPage()) {
            showPendingModal(p);
            try { document.getElementById('tm-pending-bell')?.remove(); } catch {}
            return;
          }
          // 跳回 MemberCenter calendar 區塊
          window.location.href = `/Auth/MemberCenter#calendar_section`;
        } catch (err) {
          console.warn('open pending modal from bell failed', err);
          window.__tripmatch_last_modal_error = err;
        }
      });

      bell.appendChild(closeBtn);
      document.body.appendChild(bell);
      if (DEBUG) console.debug('[calendar-plugin] bell created');
    } catch (e) {
      console.error('[calendar-plugin] createBellUI error', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  function transformModalToBell(payload) {
    try {
      if (isMemberCenterCalendarPage()) {
        try { sessionStorage.setItem(BELL_FLAG, '1'); } catch {}
        createBellUI(payload);
      } else {
        if (payload && payload.groupId) {
          window.location.href = `/Match/CalendarCheck/${encodeURIComponent(payload.groupId)}`;
        } else {
          window.location.href = `/Match/CalendarCheck`;
        }
      }
    } catch (e) {
      console.error('transformModalToBell error', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  function showPendingModal(payload) {
    try {
      if (DEBUG) console.debug('[calendar-plugin] showPendingModal payload', payload);
      const groupId = payload?.groupId;
      const html = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:18px;font-weight:700;">行事曆時間編輯</div>
          <div style="color:#6b7280;font-size:14px;">您可以選擇「匯入行事曆」回到提交時間頁面，或「繼續編輯」（會縮為鈴鐺）</div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
            <button id="tm-btn-import" style="background:#10B981;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;">匯入行事曆</button>
            <button id="tm-btn-gocal" style="background:#e5e7eb;color:#111;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;">繼續編輯</button>
          </div>
        </div>
      `;
      const { overlay } = createModal(html);
      if (!overlay) { if (DEBUG) console.warn('[calendar-plugin] overlay not created'); return; }

      const btnImport = overlay.querySelector('#tm-btn-import');
      const btnGoCal = overlay.querySelector('#tm-btn-gocal');

      if (btnImport) {
        btnImport.addEventListener('click', async () => {
          // 若有 groupId，呼叫 handleImport 並以 groupId 轉到 CalendarCheck（handleImport 會把 draft 放進 sessionStorage）
          btnImport.disabled = true;
          try {
            await handleImport({ groupId: groupId });
          } finally {
            try { overlay.remove(); } catch {}
          }
        });
      }

      if (btnGoCal) {
        // 修改：按「繼續編輯」時，直接收合為鈴鐺（不導航）
        btnGoCal.addEventListener('click', () => {
          try {
            transformModalToBell(payload);
          } finally {
            try { overlay.remove(); } catch {}
          }
        });
      }

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });

      if (DEBUG) console.debug('[calendar-plugin] modal shown');
    } catch (e) {
      console.error('[calendar-plugin] showPendingModal failed', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  ns.showPendingModal = showPendingModal;
  ns.fetchLeaves = fetchLeaves;

  // Initialize: tryShowIfPending + member-center hash handler
  document.addEventListener('DOMContentLoaded', () => {
    tryShowIfPending();

    // ensure modal/bell initialize when user lands on /Auth/MemberCenter#calendar_section
    function handleMemberCenterEntry() {
      try {
        if (!location.pathname.startsWith('/Auth/MemberCenter')) return;
        if (location.hash !== '#calendar_section') return;

        // If bell flag present, ensure bell exists (re-show even if previously hidden)
        const bellFlag = sessionStorage.getItem(BELL_FLAG);
        const raw = sessionStorage.getItem(PENDING_KEY) || sessionStorage.getItem('calendar_draft_ranges');
        const payload = safeParse(raw);

        if (bellFlag) {
          try { createBellUI(payload); } catch (e) { console.warn('createBellUI failed', e); window.__tripmatch_last_modal_error = e; }
        }

        // If there is pending, show modal
        if (raw) {
          try { showPendingModal(payload || {}); } catch (e) { console.warn('showPendingModal failed', e); window.__tripmatch_last_modal_error = e; }
        }
      } catch (e) {
        console.warn('handleMemberCenterEntry error', e);
        window.__tripmatch_last_modal_error = e;
      }
    }

    // run now and on hashchange
    handleMemberCenterEntry();
    window.addEventListener('hashchange', handleMemberCenterEntry);

    // capture global errors to help diagnose why modal may not show
    window.addEventListener('error', (ev) => {
      try { window.__tripmatch_last_modal_error = ev.error || ev.message || ev; } catch {}
    });
  });

  function tryShowIfPending() {
    try {
      if (DEBUG) console.debug('[calendar-plugin] tryShowIfPending start');
      let raw = sessionStorage.getItem(PENDING_KEY);
      let payload = null;

      if (raw) {
        payload = safeParse(raw);
      } else {
        const draftRaw = sessionStorage.getItem('calendar_draft_ranges');
        if (draftRaw) {
          const d = safeParse(draftRaw);
          if (d) payload = { groupId: (d.groupId || (d.groupId === 0 ? d.groupId : null)), draft: d.ranges || d, dates: d.dates || [] };
        }
      }

      if (!payload) {
        if (DEBUG) console.debug('[calendar-plugin] no payload found, aborting');
        return;
      }

      if (DEBUG) console.debug('[calendar-plugin] pending payload', payload);

      setTimeout(() => {
        try {
          if (isMemberCenterCalendarPage()) {
            if (DEBUG) console.debug('[calendar-plugin] on MemberCenter => showPendingModal');
            showPendingModal(payload);
            return;
          }

          const bellShown = sessionStorage.getItem(BELL_FLAG);
          if (bellShown && isMemberCenterCalendarPage()) {
            createBellUI(payload);
          } else {
            showPendingModal(payload);
          }
        } catch (e) {
          console.warn('tryShowIfPending inner error', e);
          window.__tripmatch_last_modal_error = e;
        }
      }, 250);
    } catch (e) {
      console.warn('tryShowIfPending parse failed', e);
      window.__tripmatch_last_modal_error = e;
    }
  }
})();

// 新增：MemberCenter pending modal + 鈴鐺行為 (合併到 calendar-plugin.js 檔尾或適當位置)
(function () {
    'use strict';

    const PENDING_KEY = 'calendar_check_pending';
    const DRAFT_KEY = 'calendar_draft_ranges';
    const BELL_FLAG = 'calendar_pending_bell_shown';
    const BELL_ID = 'tm-pending-bell';

    // local safeParse (first IIFE's safeParse is not reachable inside this closure)
    function safeParse(raw) {
        try { return raw ? JSON.parse(raw) : null; } catch (e) { console.warn('safeParse failed', e, raw); return null; }
    }

    function isMemberCenter() {
        try {
            const r = location.pathname.startsWith('/Auth/MemberCenter') || document.querySelector('.member_center_wrap') !== null;
            if (window && window.console && console.debug) console.debug('[calendar-plugin] isMemberCenter ->', r);
            return r;
        } catch (e) { console.warn(e); return false; }
    }

    function createPendingModal() {
        let modal = document.getElementById('tm-pending-modal');
        if (modal) return modal;

        const existing = document.getElementById('calendarModal') || document.getElementById('askCalendarModal');
        if (existing) {
            modal = existing;
            modal.id = modal.id || 'tm-pending-modal';
        } else {
            modal = document.createElement('div');
            modal.id = 'tm-pending-modal';
            modal.className = 'modal-overlay active';
            modal.style.display = 'none';
            // ensure modal is on top and covers viewport so it is visible
            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.zIndex = '2350';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="custom-modal" style="background:#fff;border-radius:12px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,0.15);max-width:420px;width:94%;">
                    <div class="modal-top-icon">🔔</div>
                    <h2 class="modal-title">匯入個人行事曆</h2>
                    <p class="modal-subtitle">偵測到您有待處理的行事曆草稿，是否匯入並儲存至本次媒合？</p>
                    <div class="d-grid" style="gap:8px; margin-top:12px;">
                        <button id="tm-import-save" class="btn btn-primary-mint">匯入並儲存至媒合</button>
                        <button id="tm-import-skip" class="btn btn-secondary-light">關閉</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        if (!modal._tmBound) {
            const btnSave = modal.querySelector('#tm-import-save');
            const btnSkip = modal.querySelector('#tm-import-skip');

            if (btnSave) {
                btnSave.addEventListener('click', async () => {
                    try {
                        await importAndSavePending();
                    } finally {
                        closePendingModal();
                    }
                });
            }
            if (btnSkip) {
                btnSkip.addEventListener('click', () => {
                    closePendingModal();
                    createBell();
                });
            }
            modal._tmBound = true;
        }

        return modal;
    }

    function openPendingModal() {
        try {
            const modal = createPendingModal();
            modal.style.display = 'flex';
            modal.classList.add('active');
        } catch (e) { console.error('openPendingModal error', e); window.__tripmatch_last_modal_error = e; }
    }

    function closePendingModal() {
        const modal = document.getElementById('tm-pending-modal') || document.getElementById('calendarModal') || document.getElementById('askCalendarModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    function createBell() {
        const existingBell = document.getElementById(BELL_ID);
        if (existingBell) {
            if (existingBell.style && existingBell.style.display === 'none') existingBell.style.display = 'flex';
            return;
        }
        try { sessionStorage.setItem(BELL_FLAG, '1'); } catch {}
        const bell = document.createElement('div');
        bell.id = BELL_ID;
        bell.title = '行事曆待處理（點此開啟）';
        bell.style = 'position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#10B981,#06B6D4);display:flex;align-items:center;justify-content:center;z-index:2200;cursor:pointer;box-shadow:0 8px 24px rgba(2,6,23,0.2);';
        bell.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z" fill="#fff"/><path d="M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 1 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="#fff"/></svg>`;
        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            openPendingModal();
        });
        document.body.appendChild(bell);
    }

    async function fetchLeaves() {
        try {
            const res = await fetch('/api/auth/GetLeaves', { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            console.error('fetchLeaves failed', e);
            window.__tripmatch_last_modal_error = e;
            return null;
        }
    }

    // keep existing importAndSavePending in this scope (unchanged)
    function datesToRanges(dates) {
        if (!Array.isArray(dates) || dates.length === 0) return [];
        const sorted = Array.from(new Set(dates)).sort();
        const out = [];
        let segStart = sorted[0], prev = sorted[0];
        const nextIso = (iso) => {
            const d = new Date(iso + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + 1);
            return d.toISOString().slice(0, 10);
        };
        for (let i = 1; i < sorted.length; i++) {
            const cur = sorted[i];
            if (cur === nextIso(prev)) { prev = cur; continue; }
            out.push({ startAt: segStart + 'T00:00:00', endAt: prev + 'T23:59:59' });
            segStart = cur; prev = cur;
        }
        out.push({ startAt: segStart + 'T00:00:00', endAt: prev + 'T23:59:59' });
        return out;
    }

    async function importAndSavePending() {
        let draft = null;
        try {
            const raw = sessionStorage.getItem(DRAFT_KEY);
            if (raw) draft = safeParse(raw);
        } catch { draft = null; }

        let ranges = [];
        let groupId = null;

        if (draft && Array.isArray(draft.ranges) && draft.ranges.length) {
            ranges = draft.ranges;
            groupId = draft.groupId || null;
        } else {
            const data = await fetchLeaves();
            const dates = data && Array.isArray(data.dates) ? data.dates : [];
            ranges = datesToRanges(dates);
            try {
                const raw = sessionStorage.getItem(PENDING_KEY);
                if (raw) {
                    const p = safeParse(raw);
                    if (p && p.groupId) groupId = p.groupId;
                }
            } catch {}
        }

        if (!groupId) {
            console.warn('importAndSavePending: groupId not found');
            return;
        }
        if (!ranges.length) {
            alert('沒有可匯入的時段。');
            return;
        }

        try {
            const resp = await fetch(`/api/timewindow/${encodeURIComponent(groupId)}/available`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(ranges)
            });
            if (resp.ok) {
                try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ groupId })); } catch {}
                window.location.href = `/Match/CalendarCheck/${encodeURIComponent(groupId)}`;
            } else {
                const txt = await resp.text().catch(() => '');
                console.warn('timewindow save failed', txt);
                alert('儲存至媒合時段失敗，請稍後再試。');
            }
        } catch (e) {
            console.error('importAndSavePending error', e);
            window.__tripmatch_last_modal_error = e;
            alert('匯入儲存發生錯誤');
        }
    }

    function initPendingFlow() {
        if (!isMemberCenter()) return;
        try {
            // check both PENDING_KEY and DRAFT_KEY (calendar_draft_ranges) — previous logic only checked PENDING_KEY
            const raw = sessionStorage.getItem(PENDING_KEY) || sessionStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            openPendingModal();
        } catch (e) { console.warn(e); window.__tripmatch_last_modal_error = e; }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPendingFlow);
    } else {
        setTimeout(initPendingFlow, 50);
    }

    // also init when hash changes to #calendar_section after page load
    window.addEventListener('hashchange', initPendingFlow);

    window.calendarPending = { openPendingModal, closePendingModal, createBell };
})();