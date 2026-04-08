/**
 * mobile-filters.js
 *
 * Moves filter-dock slots into the mobile offcanvas when it opens,
 * and returns them to the dock when it closes.
 *
 * This keeps Tom Select instances untouched (no re-init needed) and
 * leaves the desktop popover system working exactly as before.
 */
(function () {
  const SLOT_IDS = [
    'filter-slot-topics',
    'filter-slot-category',
    'filter-slot-channel',
    'filter-slot-author',
    'filter-slot-contributors',
    'filter-slot-language',
    'filter-slot-date-range',
  ];

  const offcanvasEl = document.getElementById('mobile-filters-offcanvas');
  const bodyEl = document.getElementById('mobile-filters-body');
  const dockEl = document.getElementById('filter-dock');

  if (!offcanvasEl || !bodyEl || !dockEl) return;

  // Move all filter slots to the given parent element.
  function moveSlots(targetParent) {
    SLOT_IDS.forEach((id) => {
      const slot = document.getElementById(id);
      if (slot) targetParent.appendChild(slot);
    });
  }

  offcanvasEl.addEventListener('show.bs.offcanvas', () => {
    moveSlots(bodyEl);
  });

  offcanvasEl.addEventListener('hidden.bs.offcanvas', () => {
    moveSlots(dockEl);
  });
})();
