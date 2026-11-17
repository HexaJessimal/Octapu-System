// Collapsing and reordering the milestone cards on the Overview tab.
(function (global) {
  'use strict';
  const { status, editing } = global.PMS;

  const root = document.getElementById('content');
  const folder = new URLSearchParams(location.search).get('folder') || '';
  const STORAGE_KEY = 'pms.collapsed.' + folder;

  function loadCollapsed() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return new Set(Array.isArray(saved) ? saved : []);
    } catch (_) {
      return new Set();
    }
  }

  const collapsed = loadCollapsed();
  // Finished milestones start closed on each page load. This isn't saved, so one that's
  // reopened stays open only until the page is next loaded.
  const closedOnLoad = new Set();

  function saveCollapsed() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
    } catch (_) {
      /* storage unavailable: milestones just reopen on the next visit */
    }
  }

  const cards = () => Array.from(root.querySelectorAll('.milestone'));
  let moving = false;

  async function move(from, to) {
    if (moving || from === to || editing.isOpen()) return false;
    moving = true;
    try {
      const result = await editing.post('api/milestone-move', { titles: cards().map((c) => c.dataset.title), from, to });
      if (!result.ok) status.toast(result.error || 'Could not move that milestone.');
      await status.refresh();
      return result.ok;
    } catch (_) {
      status.toast('Could not reach the dashboard server.');
      return false;
    } finally {
      moving = false;
    }
  }

  root.addEventListener('click', (e) => {
    const button = e.target.closest('[data-collapse]');
    if (!button) return;
    const card = button.closest('.milestone');
    const nowCollapsed = card.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded', String(!nowCollapsed));
    if (nowCollapsed) collapsed.add(card.dataset.title);
    else {
      collapsed.delete(card.dataset.title);
      closedOnLoad.delete(card.dataset.title);
    }
    saveCollapsed();
  });

  // Arrow keys on the handle do the same job as dragging.
  root.addEventListener('keydown', async (e) => {
    const handle = e.target.closest('[data-drag]');
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const from = Number(handle.closest('.milestone').dataset.index);
    const to = from + (e.key === 'ArrowDown' ? 1 : -1);
    if (to < 0 || to >= cards().length) return;
    if (await move(from, to)) {
      const moved = root.querySelector('.milestone[data-index="' + to + '"] [data-drag]');
      if (moved) moved.focus();
    }
  });

  let drag = null; // { from, over, after } while a milestone is being dragged

  function clearMarkers() {
    cards().forEach((c) => c.classList.remove('drop-before', 'drop-after'));
  }

  root.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-drag]');
    if (!handle || editing.isOpen()) return;
    const card = handle.closest('.milestone');
    drag = { from: Number(card.dataset.index), over: null, after: false };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.title); // Firefox needs some data to drag
    e.dataTransfer.setDragImage(card, 16, 16);
    card.classList.add('is-dragging');
  });

  root.addEventListener('dragover', (e) => {
    if (!drag) return;
    const card = e.target.closest('.milestone');
    if (!card) return;
    e.preventDefault();
    const box = card.getBoundingClientRect();
    drag.over = Number(card.dataset.index);
    drag.after = e.clientY > box.top + box.height / 2;
    clearMarkers();
    card.classList.add(drag.after ? 'drop-after' : 'drop-before');
  });

  root.addEventListener('drop', (e) => {
    if (!drag || drag.over === null) return;
    e.preventDefault();
    const slot = drag.over + (drag.after ? 1 : 0);
    move(drag.from, slot > drag.from ? slot - 1 : slot); // removing it first shifts later cards up
  });

  root.addEventListener('dragend', () => {
    drag = null;
    clearMarkers();
    cards().forEach((c) => c.classList.remove('is-dragging'));
  });

  global.PMS.milestoneControls = {
    isCollapsed: (title) => collapsed.has(title) || closedOnLoad.has(title),
    closeFinished: (milestones) => milestones.filter((m) => m.state === 'done').forEach((m) => closedOnLoad.add(m.title)),
  };
})(window);
