// Help Guide: the markdown guide in the main folder, shown as a page, with its "Mark as read" checkbox below.
(function () {
  'use strict';
  const { markdown: md, component, getJson, postJson, loadError, setDateFormat, status, UNREACHABLE } = window.PMS;

  const contentEl = document.getElementById('content');
  let read = false;

  function render(data) {
    setDateFormat(data.dateFormat);
    if (!data.exists) {
      contentEl.innerHTML = component('empty-card', { message: "Help Guide.md doesn't exist yet." });
      return;
    }
    read = data.read;
    const guide = component('doc-article', { body: md.render(data.content) });
    contentEl.innerHTML = component('card-stack', { items: guide + component('help-read', { read, checked: String(read) }) });
  }

  function load() {
    return getJson('api/help')
      .then(render)
      .catch((err) => {
        contentEl.innerHTML = loadError('the Help Guide', err);
      });
  }

  contentEl.addEventListener('click', async (e) => {
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
