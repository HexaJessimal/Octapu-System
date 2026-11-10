// All catalogs: every TAG_Name.csv in the Catalogs folder, and the plus button that makes one.
(function () {
  'use strict';
  const { component, getJson, postJson, loadError, formDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  const catalogHref = (file) => 'catalog.html?file=' + encodeURIComponent(file);
  const records = (n) => n + (n === 1 ? ' record' : ' records');

  function render(catalogs) {
    contentEl.innerHTML =
      component('catalog-heading', { title: 'All catalogs', count: catalogs.length, action: 'data-new-catalog', label: 'New catalog' }) +
      (catalogs.length
        ? component('catalog-list', { items: catalogs.map((c) => component('catalog-list-row', { href: catalogHref(c.file), tag: c.tag, name: c.name, count: records(c.count) })).join('') })
        : component('empty-card', { message: 'No catalogs yet. Use the plus button to make one.' }));
  }

  // A tag from the name's initials, or its first letters if it's one word: "Record Label
  // Studios" suggests RLS. It stops suggesting once the tag has been typed into.
  const suggestTag = (name) => {
    const words = name.toUpperCase().replace(/[^A-Z ]+/g, '').split(' ').filter(Boolean);
    return (words.length > 1 ? words.map((w) => w[0]).join('') : words.join('')).slice(0, 3);
  };

  function askForCatalog() {
    const form = formDialog({
      heading: 'New catalog',
      fields: component('text-field', { label: 'Name', name: 'name' }) + component('catalog-tag-field'),
      submit: 'Create catalog',
      failure: 'Could not create that catalog.',
      send: (f) => postJson('api/catalogs', { name: f.elements.name.value, tag: f.elements.tag.value }),
      done: (result) => {
        location.href = catalogHref(result.body.file);
      },
    });
    const { name, tag } = form.elements;
    let typed = false;
    name.addEventListener('input', () => {
      if (!typed) tag.value = suggestTag(name.value);
    });
    tag.addEventListener('input', () => {
      typed = true;
      tag.value = tag.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
    name.focus();
  }

  contentEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-new-catalog]')) askForCatalog();
  });

  getJson('api/catalogs')
    .then((data) => render(data.catalogs))
    .catch((err) => {
      contentEl.innerHTML = loadError('the catalogs', err);
    });
})();
