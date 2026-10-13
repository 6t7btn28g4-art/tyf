/* SAIJO V72: concise controls and screen-reader/keyboard support. */
(function () {
  'use strict';

  function addSkipLink() {
    const body = document.body;
    if (!body || body.querySelector('.saijo-skip-link, .v64-skip')) return;
    const main = document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

    const link = document.createElement('a');
    link.className = 'saijo-skip-link';
    link.href = '#' + main.id;
    link.textContent = '本文へ移動';
    link.addEventListener('click', function () {
      window.setTimeout(function () {
        main.focus({ preventScroll: true });
      }, 0);
    });
    body.insertBefore(link, body.firstChild);
  }

  function groupMapActions() {
    if (!document.body.classList.contains('map-page')) return;
    const controls = document.getElementById('mainControls');
    if (!controls || controls.dataset.compactControls === 'true') return;

    const byId = (id) => controls.querySelector('#' + id);
    const current = byId('locationButton');
    const places = byId('placesButton');
    const route = byId('routePlannerButton');
    const overview = byId('overviewButton');
    const station = byId('stationButton');
    const ud = byId('udButton');
    if (![current, places, route, overview, station, ud].every(Boolean)) return;

    const more = document.createElement('details');
    more.className = 'map-more-actions';
    more.innerHTML = '<summary aria-label="その他の地図操作"><span class="control-icon" aria-hidden="true">＋</span><span>その他</span></summary><div class="map-more-actions-panel" role="group" aria-label="その他の地図操作"></div>';
    const panel = more.querySelector('.map-more-actions-panel');

    panel.append(overview, station, ud);
    controls.replaceChildren(current, places, route, more);
    controls.dataset.compactControls = 'true';

    const summary = more.querySelector('summary');
    const syncExpanded = () => summary.setAttribute('aria-expanded', String(more.open));
    more.addEventListener('toggle', syncExpanded);
    syncExpanded();

    // Close the popover after an action or an outside click.
    panel.addEventListener('click', function (event) {
      if (event.target.closest('button')) {
        more.open = false;
        syncExpanded();
      }
    });
    document.addEventListener('click', function (event) {
      if (more.open && !more.contains(event.target)) { more.open = false; syncExpanded(); }
    });
    more.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && more.open) {
        event.preventDefault();
        more.open = false;
        syncExpanded();
        more.querySelector('summary').focus();
      }
    });
  }

  function enhanceControls() {
    addSkipLink();
    groupMapActions();

    // Put the settings action near the top of the menu so it is easy to discover.
    const siteMenu = document.getElementById('siteMenu');
    const menuTop = siteMenu && siteMenu.querySelector('.site-menu-top');
    const settingsButton = siteMenu && siteMenu.querySelector('.menu-settings');
    if (menuTop && settingsButton && menuTop.nextElementSibling !== settingsButton) {
      menuTop.insertAdjacentElement('afterend', settingsButton);
    }

    // Name map controls explicitly, even if a compact visual state hides a text label.
    document.querySelectorAll('.map-controls button').forEach(function (button) {
      if (!button.hasAttribute('aria-label')) {
        const visibleName = button.textContent.replace(/\s+/g, ' ').trim();
        if (visibleName) button.setAttribute('aria-label', visibleName);
      }
    });

    // Ensure decorative icons don't create duplicate names for assistive technology.
    document.querySelectorAll('.v69-mobile-nav svg, .v64-menu-icon, .control-icon').forEach(function (icon) {
      if (!icon.hasAttribute('aria-hidden')) icon.setAttribute('aria-hidden', 'true');
    });

    // Keep modal-style navigation menus clearly named and accurately expanded.
    document.querySelectorAll('[data-menu-open]').forEach(function (button) {
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'メニューを開く');
      button.addEventListener('click', function () {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-label', expanded ? 'メニューを開く' : 'メニューを閉じる');
      });
    });

    // A control must remain visible and usable when the user asks for larger text.
    document.querySelectorAll('button, [role="button"], input, select, textarea').forEach(function (control) {
      if (!control.style.minHeight) control.style.minHeight = '44px';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceControls, { once: true });
  } else {
    enhanceControls();
  }
})();
