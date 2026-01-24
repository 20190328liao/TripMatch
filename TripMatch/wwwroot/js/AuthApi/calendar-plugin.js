(() => {
  'use strict';

  const DEBUG = true;
  const ns = (window.TripMatchCalendarPlugin = window.TripMatchCalendarPlugin || {});
  const PENDING_KEY = 'calendar_check_pending';
  const DRAFT_KEY = 'calendar_draft_ranges';
  const BELL_FLAG = 'calendar_pending_bell_shown';
  const BELL_ID = 'tm-pending-bell';
  const MODAL_ID = 'tm-pending-modal';

  // debug helper
  window.__tripmatch_last_modal_error = window.__tripmatch_last_modal_error || null;
  ns.getLastModalError = () => window.__tripmatch_last_modal_error;

  const safeParse = (raw) => {
    try { return raw ? JSON.parse(raw) : null; }
    catch (e) { if (DEBUG) console.warn('safeParse failed', e, raw); return null; }
  };

  // combine single-day ISO dates -> ranges
  function datesToRanges(dates) {
    if (!Array.isArray(dates) || dates.length === 0) return [];
    const sorted = Array.from(new Set(dates.map(d => (typeof d === 'string' ? d.slice(0, 10) : ''))))
      .filter(Boolean).sort();
    const out = [];
    let start = sorted[0], prev = sorted[0];
    const nextIso = iso => {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      if (cur === nextIso(prev)) { prev = cur; continue; }
      out.push({ startAt: start + 'T00:00:00', endAt: prev + 'T23:59:59' });
      start = cur; prev = cur;
    }
    out.push({ startAt: start + 'T00:00:00', endAt: prev + 'T23:59:59' });
    return out;
  }

  async function fetchLeaves() {
    try {
      const res = await fetch('/api/auth/GetLeaves', { credentials: 'include' });
      if (!res.ok) throw new Error('無法取得行事曆');
      const json = await res.json();
      return json?.dates || [];
    } catch (e) {
      console.error('fetchLeaves error', e);
      window.__tripmatch_last_modal_error = e;
      return null;
    }
  }

  async function handleImport(actionContext) {
    try {
      if (DEBUG) console.debug('[calendar-plugin] handleImport', actionContext);
      const dates = await fetchLeaves();
      if (!Array.isArray(dates)) {
        showNotification('匯入失敗：無法讀取個人行事曆', 'error');
        return;
      }

      const groupId = actionContext?.groupId ?? null;
      if (groupId) {
        const ranges = datesToRanges(dates);
        const payload = { groupId, ranges, dates, savedAt: new Date().toISOString() };
        try {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
          sessionStorage.setItem(PENDING_KEY, JSON.stringify({ groupId }));
        } catch (e) { console.warn('sessionStorage write failed', e); window.__tripmatch_last_modal_error = e; }
        window.location.href = `/Match/CalendarCheck/${encodeURIComponent(groupId)}`;
        return;
      }

      // preview import on current page
      try { window.Calendar?.importDates?.(dates); } catch (e) { console.warn('Calendar.importDates failed', e); window.__tripmatch_last_modal_error = e; }
      showNotification(`已從個人行事曆匯入 ${dates.length} 筆`, 'info');
      sessionStorage.removeItem(PENDING_KEY);
      document.getElementById(BELL_ID)?.remove();
    } catch (e) {
      console.error('[calendar-plugin] handleImport error', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  function showNotification(msg, type = 'info') {
    try {
      const n = document.createElement('div');
      n.textContent = msg;
      n.style.cssText = 'position:fixed;right:18px;bottom:18px;padding:10px 14px;border-radius:8px;color:#fff;z-index:2100;font-weight:600;';
      n.style.background = type === 'error' ? '#ef4444' : '#155DFC';
      document.body.appendChild(n);
      setTimeout(() => { n.style.opacity = '0'; }, 2400);
      setTimeout(() => n.remove(), 3000);
    } catch (e) {
      console.error('[calendar-plugin] showNotification failed', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  // generic modal creator (overlay + box). id optional to allow reusing same modal DOM.
  function createModalContent(html, options = {}) {
    try {
      const existing = options.id ? document.getElementById(options.id) : null;
      if (existing) return { overlay: existing, box: existing.querySelector('.tm-modal-box') };

      const overlay = document.createElement('div');
      overlay.id = options.id || '';
      overlay.className = 'tm-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2350;';
      const box = document.createElement('div');
      box.className = 'tm-modal-box';
      box.style.cssText = 'max-width:420px;width:94%;background:#fff;border-radius:12px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,0.15);';
      box.innerHTML = html;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      return { overlay, box };
    } catch (e) {
      console.error('[calendar-plugin] createModalContent error', e);
      window.__tripmatch_last_modal_error = e;
      return { overlay: null, box: null };
    }
  }

  function createBellUI(payload) {
    try {
      const existing = document.getElementById(BELL_ID);
      if (existing) {
        if (existing.style.display === 'none') existing.style.display = 'flex';
        return;
      }
      try { sessionStorage.setItem(BELL_FLAG, '1'); } catch {}

      const bell = document.createElement('div');
      bell.id = BELL_ID;
      bell.title = '行事曆待處理（點此開啟）';
      bell.style.cssText = 'position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#10B981,#06B6D4);display:flex;align-items:center;justify-content:center;z-index:2200;cursor:pointer;box-shadow:0 8px 24px rgba(2,6,23,0.2);';
      bell.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z" fill="#fff"/><path d="M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 1 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="#fff"/></svg>`;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.title = '關閉提醒';
      closeBtn.style.cssText = 'position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;border:none;background:#fff;color:#333;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 12px rgba(0,0,0,0.12);cursor:pointer;';
      closeBtn.innerHTML = '×';
      closeBtn.addEventListener('click', (e) => { e.stopPropagation(); bell.style.display = 'none'; });
      bell.appendChild(closeBtn);

      bell.addEventListener('click', (e) => {
        e.stopPropagation();
        const raw = sessionStorage.getItem(PENDING_KEY);
        const payload = safeParse(raw) || payload || null;
        if (isMemberCenterCalendarPage()) {
          openPendingModal(payload);
          try { document.getElementById(BELL_ID)?.remove(); } catch {}
          return;
        }
        window.location.href = `/Auth/MemberCenter#calendar_section`;
      });

      document.body.appendChild(bell);
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
        if (payload?.groupId) window.location.href = `/Match/CalendarCheck/${encodeURIComponent(payload.groupId)}`;
        else window.location.href = `/Match/CalendarCheck`;
      }
    } catch (e) {
      console.error('transformModalToBell error', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  // builds and opens the modal with the custom content you requested
  function openPendingModal(payload = {}) {
    try {
      const html = `
        <div class="custom-modal">
          <div class="modal-top-icon">🔔</div>
          <h2 class="modal-title">匯入個人行事曆</h2>
          <p class="modal-subtitle">偵測到您有待處理的行事曆草稿，是否匯入並儲存至本次媒合？</p>
          <div class="d-grid" style="gap:8px;margin-top:12px;display:flex;justify-content:flex-end;">
            <button id="tm-import-save" style="background:#10B981;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;">匯入並儲存至媒合</button>
            <button id="tm-import-skip" style="background:#e5e7eb;color:#111;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;">關閉</button>
          </div>
        </div>
      `;
      const { overlay, box } = createModalContent(html, { id: MODAL_ID });
      if (!overlay) return;

      overlay.style.display = 'flex';

      // bind buttons once
      if (!overlay._tmBound) {
        overlay.querySelector('#tm-import-save')?.addEventListener('click', async () => {
          overlay.querySelector('#tm-import-save').disabled = true;
          try {
            await importAndSavePending(payload);
          } finally {
            closePendingModal();
          }
        });
        overlay.querySelector('#tm-import-skip')?.addEventListener('click', () => {
          closePendingModal();
          createBellUI(payload);
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closePendingModal(); });
        overlay._tmBound = true;
      }
    } catch (e) {
      console.error('[calendar-plugin] openPendingModal error', e);
      window.__tripmatch_last_modal_error = e;
    }
  }

  function closePendingModal() {
    const el = document.getElementById(MODAL_ID);
    if (!el) return;
    el.style.display = 'none';
  }

  async function importAndSavePending(payloadFromOpen) {
    let draft = null;
    try { draft = safeParse(sessionStorage.getItem(DRAFT_KEY)); } catch {}
    let ranges = [];
    let groupId = payloadFromOpen?.groupId ?? null;

    if (draft?.ranges?.length) {
      ranges = draft.ranges;
      groupId = groupId || draft.groupId || null;
    } else {
      const leaves = await fetchLeaves();
      const dates = Array.isArray(leaves) ? leaves : [];
      ranges = datesToRanges(dates);
      try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        const p = safeParse(raw);
        if (p?.groupId) groupId = groupId || p.groupId;
      } catch {}
    }

    if (!groupId) { console.warn('importAndSavePending: groupId not found'); return; }
    if (!ranges.length) { alert('沒有可匯入的時段。'); return; }

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
        console.warn('timewindow save failed', await resp.text().catch(() => ''));
        alert('儲存至媒合時段失敗，請稍後再試。');
      }
    } catch (e) {
      console.error('importAndSavePending error', e);
      window.__tripmatch_last_modal_error = e;
      alert('匯入儲存發生錯誤');
    }
  }

  function isMemberCenterCalendarPage() {
    try {
      return location.pathname.startsWith('/Auth/MemberCenter') &&
        (location.hash === '#calendar_section' || document.querySelector('.member_center_wrap') !== null);
    } catch (e) { window.__tripmatch_last_modal_error = e; return false; }
  }

  // try show pending modal when appropriate
  function tryShowIfPending() {
    try {
      // read both keys and merge preference: prefer explicit pending key, fallback to draft key
      const rawPending = sessionStorage.getItem(PENDING_KEY);
      const rawDraft = sessionStorage.getItem(DRAFT_KEY);

      if (!rawPending && !rawDraft) { if (DEBUG) console.debug('[calendar-plugin] no pending/draft'); return; }

      // prefer pending payload but fall back to draft content
      const pendingPayload = safeParse(rawPending);
      const draftPayload = safeParse(rawDraft);

      // merge minimal useful fields
      const payload = pendingPayload || draftPayload || {};

      // short delay to allow SPA/hash navigation to settle
      setTimeout(() => {
        try {
          if (isMemberCenterCalendarPage()) {
            // on member center, open modal immediately so user can act inline
            openPendingModal(payload);
            return;
          }

          // on other pages, show the bell UI to avoid intrusive modal
          createBellUI(payload);
        } catch (e) { window.__tripmatch_last_modal_error = e; }
      }, 150);
    } catch (e) { window.__tripmatch_last_modal_error = e; }
  }

  // initialization: on DOMContentLoaded and on hashchange (for #calendar_section)
  function init() {
    tryShowIfPending();
    window.addEventListener('hashchange', () => {
      // only act when hash becomes calendar_section or when user returns to MemberCenter
      if (location.hash === '#calendar_section') tryShowIfPending();
    });
    // expose small API
    ns.showPendingModal = openPendingModal;
    ns.fetchLeaves = fetchLeaves;
    window.calendarPending = { openPendingModal, closePendingModal, createBellUI };
    // capture global errors
    window.addEventListener('error', (ev) => { try { window.__tripmatch_last_modal_error = ev.error || ev.message || ev; } catch {} });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 20);
})();