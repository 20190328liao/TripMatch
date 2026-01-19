// 輕量 JS：模擬 navbar 行為 + 處理登出（不依賴 Bootstrap）
// 強化：從 form 抓 __RequestVerificationToken 作為 fallback，並加上除錯輸出
(function () {
  'use strict';

  function debug(...args) {
    if (window && window.console && console.debug) console.debug('[navbar]', ...args);
  }

  function getRequestVerificationToken(form) {
    if (!form) return (window.csrfToken || '');
    // 先嘗試全域 token
    if (window.csrfToken) return window.csrfToken;
    // 再嘗試 form 內 hidden input
    const tokenInput = form.querySelector('input[name="__RequestVerificationToken"]');
    if (tokenInput) return tokenInput.value;
    // 最後 fallback undefined/empty
    return '';
  }

  function toggleMenu(menu, toggleBtn) {
    if (!menu) return;
    const isShown = menu.classList.toggle('show');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', isShown ? 'true' : 'false');
  }

  function initNavbar(root) {
    if (!root) return;

    // navbar collapse toggler
    root.querySelectorAll('.navbar-toggler').forEach(toggler => {
      toggler.addEventListener('click', (e) => {
        // 防止被全域 click handler 視為「外部點擊」而立即關閉
        e.stopPropagation();
        try {
          const targetSelector = toggler.getAttribute('data-bs-target') || toggler.getAttribute('data-target') || '.navbar-collapse';
          let collapseEl = null;
          if (targetSelector && (targetSelector.startsWith('.') || targetSelector.startsWith('#'))) {
            // 優先在當前 navbar 範圍內尋找（避免多個 navbar 干擾）
            collapseEl = root.querySelector(targetSelector) || document.querySelector(targetSelector);
          } else {
            collapseEl = document.querySelector(targetSelector) || root.querySelector('.navbar-collapse');
          }
          collapseEl = collapseEl || root.querySelector('.navbar-collapse');
          if (!collapseEl) {
            debug('collapse target not found', targetSelector, root);
            return;
          }

          // 在切換前關閉同一 navbar 中其他 dropdowns（避免重疊）
          root.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
          root.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));

          // 若頁面有載入 Bootstrap 的 Collapse，使用官方 API 切換，避免狀態不同步
          if (window.bootstrap && bootstrap.Collapse) {
            try {
              const bsGet = bootstrap.Collapse.getInstance(collapseEl);
              const bsInstance = bsGet || new bootstrap.Collapse(collapseEl, { toggle: false });
              bsInstance.toggle();
              // 更新 aria-expanded（Bootstrap 會在切換後更新 class，延遲一次讀取比較可靠）
              setTimeout(() => {
                const isShown = collapseEl.classList.contains('show');
                toggler.setAttribute('aria-expanded', isShown ? 'true' : 'false');
              }, 50);
              return;
            } catch (bsErr) {
              debug('bootstrap collapse toggle failed, fallback to manual', bsErr);
            }
          }

          // fallback: 手動切換 class（無 bootstrap 時）
          const isShown = collapseEl.classList.toggle('show');
          toggler.setAttribute('aria-expanded', isShown ? 'true' : 'false');
        } catch (err) {
          console.error('navbar toggle error', err);
        }
      });
    });

    // 當在手機/小尺寸下點選選單內的連結或 logout 按鈕，讓 collapse 自動收回
    root.querySelectorAll('.navbar-collapse a, .navbar-collapse .btn-logout').forEach(el => {
      el.addEventListener('click', (e) => {
        // 若為 dropdown toggle 則不關閉
        const hasToggle = el.getAttribute('data-bs-toggle') || el.classList.contains('dropdown-toggle');
        if (hasToggle) return;
        const collapseEl = root.querySelector('.navbar-collapse');
        if (collapseEl && collapseEl.classList.contains('show') && window.innerWidth < 992) {
          // 如果使用 Bootstrap API，呼叫其 hide；否則移除 class
          if (window.bootstrap && bootstrap.Collapse) {
            const inst = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
            try {
              inst.hide();
            } catch (err) {
              collapseEl.classList.remove('show');
            }
          } else {
            collapseEl.classList.remove('show');
          }
          root.querySelectorAll('.navbar-toggler').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
        }
      });
    });

    // dropdown toggles (arrow button)
    root.querySelectorAll('.dropdown-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = toggle.closest('.nav-avatar, .dropdown, .nav-item.dropdown');
        if (!dropdown) return;
        const menu = dropdown.querySelector('.dropdown-menu');
        if (!menu) return;

        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        // close other open menus in this navbar
        root.querySelectorAll('.dropdown-menu.show').forEach(m => { if (m !== menu) m.classList.remove('show'); });
        root.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(t => { if (t !== toggle) t.setAttribute('aria-expanded', 'false'); });

        menu.classList.toggle('show');
        toggle.setAttribute('aria-expanded', !expanded ? 'true' : 'false');
      });
    });

    // avatar click: 允許預設導向（點頭貼會前往 MemberCenter）
    // 單純把 avatar 的 click handler 改為不阻止預設行為，桌機若要開下拉請點旁邊的 .dropdown-toggle
    root.querySelectorAll('.avatar-link').forEach(avatar => {
      avatar.addEventListener('click', (e) => {
        // 不呼叫 e.preventDefault()，保留 a 標籤的導向行為
        // 如果你想在桌機點 avatar 也開 dropdown，可改為偵測按鍵或改成雙擊等特殊行為
      });
    });
  }

  function postLogoutAndRedirect(form) {
    if (!form) return;
    // tag-helper 會輸出 action 屬性；若沒有則用預設路徑
    const action = form.getAttribute('action') || form.action || '/AuthApi/Logout';
    const returnUrl = (form.dataset && form.dataset.returnUrl) ? form.dataset.returnUrl : '/';
    const token = getRequestVerificationToken(form);
    debug('logout: action=', action, 'returnUrl=', returnUrl, 'token present=', !!token);

    fetch(action, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'RequestVerificationToken': token || '',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: '' // server 端只需 POST 觸發 logout
    })
    .then(response => {
      debug('logout response', response.status, response.ok);
      window.location.href = returnUrl;
    })
    .catch(err => {
      console.error('Logout failed', err);
      window.location.href = returnUrl;
    });
  }

  function initLogoutButtons() {
    document.querySelectorAll('.btn-logout').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const form = btn.closest('form.logout-form') || btn.closest('form');
        if (form) {
          postLogoutAndRedirect(form);
        } else {
          console.warn('Logout: no form found for btn', btn);
          window.location.href = '/';
        }
      });
    });
  }

  // 初始化所有 navbar 與 logout
  function initAll() {
    document.querySelectorAll('nav.navbar').forEach(initNavbar);
    initLogoutButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // global handlers: 點擊外側關閉、Esc
  document.addEventListener('click', (e) => {
    document.querySelectorAll('nav.navbar').forEach(root => {
      if (!e.target.closest('nav.navbar')) {
        root.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
        root.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));
        const collapse = root.querySelector('.navbar-collapse');
        if (collapse && collapse.classList.contains('show') && window.innerWidth < 992) {
          // 使用 bootstrap API 隱藏（若可用）
          if (window.bootstrap && bootstrap.Collapse) {
            const inst = bootstrap.Collapse.getInstance(collapse) || new bootstrap.Collapse(collapse, { toggle: false });
            try { inst.hide(); } catch (err) { collapse.classList.remove('show'); }
          } else {
            collapse.classList.remove('show');
          }
          root.querySelectorAll('.navbar-toggler').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
        }
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('nav.navbar').forEach(root => {
        root.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
        root.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));
        const collapse = root.querySelector('.navbar-collapse');
        if (collapse && collapse.classList.contains('show') && window.innerWidth < 992) {
          if (window.bootstrap && bootstrap.Collapse) {
            const inst = bootstrap.Collapse.getInstance(collapse) || new bootstrap.Collapse(collapse, { toggle: false });
            try { inst.hide(); } catch (err) { collapse.classList.remove('show'); }
          } else {
            collapse.classList.remove('show');
          }
          root.querySelectorAll('.navbar-toggler').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
        }
      });
    }
  });

})();