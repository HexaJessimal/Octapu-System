// Help Guide: the markdown guide in the main folder, shown as a page, with its "Mark as read" checkbox below.
(function () {
  'use strict';
  const { markdown: md, component, getJson, postJson, loadError, setDateFormat, status, UNREACHABLE } = window.PMS;

  const contentEl = document.getElementById('content');
  let read = false;

  function render(data) {
    setDateFormat(data.dateFormat);
    if (!data.exists) {
      contentEl.innerHTML = component('empty-card', { message: "_Help_Guide.md doesn't exist yet." });
      return;
    }
    read = data.read;
    const guide = component('doc-article', { body: md.render(data.content) });
    contentEl.innerHTML = component('card-stack', { items: guide + component('help-read', { read, checked: String(read) }) });
    contentEl.querySelector('.doc').classList.add('zoomable-images');
    addContents();
  }

  // A contents list under the guide's title, linking to each ## heading. It's built from the
  // headings as shown, so the markdown file doesn't need one, and the PDF printed from this
  // page keeps the links.
  function addContents() {
    const doc = contentEl.querySelector('.doc');
    const headings = doc ? Array.from(doc.querySelectorAll('h2[id]')) : [];
    if (!headings.length) return;
    const items = headings.map((h) => component('help-contents-item', { id: h.id, label: h.textContent })).join('');
    const title = doc.querySelector('h1');
    const box = component('help-contents', { items });
    if (title) title.insertAdjacentHTML('afterend', box);
    else doc.insertAdjacentHTML('afterbegin', box);
  }

  function load() {
    return getJson('api/help')
      .then(render)
      .catch((err) => {
        contentEl.innerHTML = loadError('the Help Guide', err);
      });
  }

  // A screenshot opens full size in a popup. Clicking it, or the space around it, closes it
  // again, as does Escape.
  function openImage(img) {
    const dialog = window.PMS.element('image-viewer', { src: img.currentSrc || img.src, alt: img.alt });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    window.PMS.openDialog(dialog);
  }

  contentEl.addEventListener('click', async (e) => {
    const img = e.target.closest('.doc img');
    if (img) return openImage(img);
    if (!e.target.closest('[data-help-read]')) return;
    try {
      const result = await postJson('api/help-read', { read: !read });
      if (!result.ok) status.toast(result.error || 'Could not save that change.');
    } catch (_) {
      status.toast(UNREACHABLE);
    }
    await load();
    status.refresh(); // the menu's outline
  });

  load();
})();
