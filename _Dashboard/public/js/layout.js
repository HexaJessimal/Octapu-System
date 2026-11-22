// The two sidebars' widths and whether each is collapsed, kept in the browser. Each sidebar has
// a handle on its inner edge to drag it wider or narrower, and a button to collapse it to a thin
// rail or open it again. The menu and the Todos redraw their own contents, so the handles and
// buttons sit beside them in the shell rather than inside, where a redraw would remove them.
(function () {
  'use strict';
  const { component } = window.PMS;

  const shell = document.querySelector('.shell');
  if (!shell) return;

  const STORAGE_KEY = 'pms.layout';
  // Each side's sidebar, the CSS variable holding its width, and how wide it can be dragged.
  const SIDES = {
    nav: { el: shell.querySelector('.nav-sidebar'), variable: '--nav-width', min: 160, max: 400, fallback: 220, name: 'Menu', label: 'menu' },
    todos: { el: shell.querySelector('.sidebar'), variable: '--todo-width', min: 260, max: 600, fallback: 340, name: 'Todos', label: 'todos' },
  };
  const STEP = 16; // how far an arrow key moves a handle

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (_) {
    /* storage unavailable: start from the default layout */
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (_) {
      /* storage unavailable: the layout just won't be remembered */
    }
  }

  const clamp = (side, width) => Math.round(Math.min(SIDES[side].max, Math.max(SIDES[side].min, width)));

  // The Timeline sizes itself from the space it has, and listens for this.
  let pending = false;
  function announce() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      window.dispatchEvent(new Event('resize'));
    });
  }

  function setWidth(side, width) {
    const value = width === null ? null : clamp(side, width);
    saved[side + 'Width'] = value;
    if (value === null) shell.style.removeProperty(SIDES[side].variable);
    else shell.style.setProperty(SIDES[side].variable, value + 'px');
    announce();
  }

  function setCollapsed(side, collapsed) {
    saved[side + 'Collapsed'] = collapsed;
    shell.classList.toggle(side + '-collapsed', collapsed);
    const button = shell.querySelector('[data-toggle-sidebar="' + side + '"]');
    if (button) {
      const action = (collapsed ? 'Show ' : 'Hide ') + SIDES[side].label;
      button.setAttribute('aria-expanded', String(!collapsed));
      button.title = action;
      button.setAttribute('aria-label', action);
    }
    announce();
  }

  Object.entries(SIDES).forEach(([side, { el, name, label }]) => {
    if (!el) return;
    if (!el.id) el.id = 'sidebar-' + side;
    // The button goes just before its sidebar, so on a narrow screen, where the sidebars are
    // stacked, it's a bar above it.
    el.insertAdjacentHTML('beforebegin', component('sidebar-toggle', { side, name, controls: el.id }));
    el.insertAdjacentHTML('afterend', component('sidebar-resizer', { side, label: 'Resize the ' + label }));
    if (typeof saved[side + 'Width'] === 'number') setWidth(side, saved[side + 'Width']);
    setCollapsed(side, saved[side + 'Collapsed'] === true);
  });

  shell.addEventListener('click', (e) => {
    const button = e.target.closest('[data-toggle-sidebar]');
    if (!button) return;
    const side = button.dataset.toggleSidebar;
    setCollapsed(side, !shell.classList.contains(side + '-collapsed'));
    save();
  });

  // Dragging a handle: the menu's width is the pointer's distance from the left of the
  // window, and the Todos' its distance from the right.
  shell.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-resize]');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    const side = handle.dataset.resize;
    handle.setPointerCapture(e.pointerId);
    shell.classList.add('is-resizing');
    const move = (ev) => setWidth(side, side === 'nav' ? ev.clientX : document.documentElement.clientWidth - ev.clientX);
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      shell.classList.remove('is-resizing');
      save();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });

  // Double-clicking a handle puts that sidebar back to its usual width.
  shell.addEventListener('dblclick', (e) => {
    const handle = e.target.closest('[data-resize]');
    if (!handle) return;
    setWidth(handle.dataset.resize, null);
    save();
  });

  // The arrow keys move a focused handle, towards the side they point to.
  shell.addEventListener('keydown', (e) => {
    const handle = e.target.closest('[data-resize]');
    if (!handle || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const side = handle.dataset.resize;
    const current = SIDES[side].el.getBoundingClientRect().width;
    const wider = (e.key === 'ArrowRight') === (side === 'nav');
    setWidth(side, current + (wider ? STEP : -STEP));
    save();
  });
})();
