

(function () {
  'use strict';

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('btn-confirm');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();

      // 只有當 calendar_check_pending flag 存在時才顯示「從 CalendarCheck 回來」的提示
      const raw = sessionStorage.getItem('calendar_check_pending');
      const payload = safeParse(raw);

      // 沒有 flag：直接觸發內部 .confirm 行為（若存在）
      if (!payload) {
        const inner = document.querySelector('.confirm');
        if (inner && typeof inner.click === 'function') {
          inner.click();
          return;
        }
        // 若沒有內部 handler，做簡單確認（保守處理）
        if (!confirm('確定要提交目前選擇的日期嗎？')) return;
        console.warn('已確認，但找不到內部提交處理器，請補上提交邏輯');
        return;
      }

      // 有 flag：優先使用 plugin 顯示可選 modal（會提供「繼續提交 / 匯入 / 前往行事曆」等選項）
      if (window.TripMatchCalendarPlugin && typeof window.TripMatchCalendarPlugin.showPendingModal === 'function') {
        try {
          window.TripMatchCalendarPlugin.showPendingModal(payload);
        } catch (ex) {
          console.warn('showPendingModal failed', ex);
          // fallback to simple redirect confirm below
          fallbackRedirect(payload);
        } finally {
          // 移除 flag，避免重複每次都跳（plugin 也會處理，但這裡做保險清理）
          try { sessionStorage.removeItem('calendar_check_pending'); } catch { }
        }
        return;
      }

      // plugin 不存在時使用簡單的確認框：要不要回到 CalendarCheck 繼續提交
      fallbackRedirect(payload);
    });

    function fallbackRedirect(payload) {
      const gid = payload && payload.groupId ? encodeURIComponent(payload.groupId) : '';
      const msg = gid
        ? '偵測到你剛從行事曆檢查回來，是否要回到提交頁繼續提交？'
        : '偵測到你剛從行事曆檢查回來，是否要回到提交頁繼續提交？（無 groupId）';

      if (!confirm(msg)) {
        try { sessionStorage.removeItem('calendar_check_pending'); } catch { }
        return;
      }

      // 導回 CalendarCheck（帶上 groupId 若有）
      const url = gid ? `/Match/CalendarCheck/${gid}` : `/Match/CalendarCheck/`;
      window.location.href = url;
    }
  });
})();