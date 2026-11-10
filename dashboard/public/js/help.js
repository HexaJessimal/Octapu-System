// Help Guide: the markdown guide in the main folder, shown as a page.
(function () {
  'use strict';
  const { markdown: md, component, getJson, loadError, setDateFormat } = window.PMS;

  const contentEl = document.getElementById('content');

  getJson('api/help')
    .then((data) => {
      setDateFormat(data.dateFormat);
      contentEl.innerHTML = data.exists ? component('doc-article', { body: md.render(data.content) }) : component('empty-card', { message: "Help Guide.md doesn't exist yet." });
    })
    .catch((err) => {
      contentEl.innerHTML = loadError('the Help Guide', err);
    });
})();
