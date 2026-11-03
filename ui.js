/* PROPHUNT2 — visual-only helpers. Does not touch auctions, bids, auth or data. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* highlight active sidebar link */
  function markActive() {
    const hash = location.hash || '#home';
    $$('.main-links a').forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === hash));
  }
  window.addEventListener('hashchange', markActive);
  markActive();

  /* back / forward */
  $('#nav-back')?.addEventListener('click', () => history.back());
  $('#nav-forward')?.addEventListener('click', () => history.forward());

  /* genre tiles / chips -> use the EXISTING franchise dropdown */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-filter]');
    if (!el) return;
    const sel = $('#franchise-filter');
    if (!sel) return;
    setTimeout(() => {
      sel.value = el.dataset.filter;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, 0);
  });

  /* search: hides non-matching cards already rendered in the grid */
  const input = $('#global-search');
  const grid = $('#auction-grid');
  function applySearch() {
    const q = (input?.value || '').trim().toLowerCase();
    $$('.card', grid).forEach(c => {
      c.style.display = !q || c.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }
  input?.addEventListener('input', () => {
    if (input.value && (location.hash || '#home') !== '#catalog') location.hash = '#catalog';
    applySearch();
  });
  if (grid) new MutationObserver(applySearch).observe(grid, { childList: true });

  /* ---- winner overlay: mirrors the existing #winner-banner ---- */
  const banner = $('#winner-banner');
  const overlay = $('#win-overlay');
  let dismissed = false;

  function syncWinner() {
    if (!banner || !overlay) return;
    const isOn = getComputedStyle(banner).display !== 'none';
    if (!isOn) { overlay.classList.remove('show'); dismissed = false; return; }
    if (dismissed) return;

    const name = ($('#won-item-name')?.textContent || '').trim();
    if (!name) {
      overlay.classList.remove('show');
      return;
    }

    const winNameElem = $('#win-name');
    if (winNameElem) winNameElem.textContent = name;

    const card = $$('#auction-grid .card').find(c => name && c.textContent.includes(name));
    const m = card && card.textContent.match(/\$\s?[\d,]+/);
    const winPriceElem = $('#win-price');
    if (winPriceElem) winPriceElem.textContent = m ? `(${m[0].replace(/\s/g, '')})` : '';

    if (location.hash !== '#home') location.hash = '#home';
    overlay.classList.add('show');
  }

  if (banner) {
    new MutationObserver(syncWinner).observe(banner, {
      attributes: true, childList: true, subtree: true, characterData: true
    });
    syncWinner();
  }

  /* overlay button triggers your original checkout button */
  $('#win-checkout')?.addEventListener('click', () => $('#buy-now-btn')?.click());
  $('#win-close')?.addEventListener('click', () => { dismissed = true; overlay.classList.remove('show'); });

})();
