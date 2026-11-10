// Small, dependency-free markdown renderer plus PMS-specific parsers.
// Everything is HTML-escaped before formatting, so file content can never inject markup.
(function (global) {
  'use strict';

  // ---------- helpers ----------

  // Apostrophes stay as they are, so the patterns below can match plain text.
  const esc = (s) => global.PMS.escapeHtml(s).replace(/&#39;/g, "'");
  const component = (name, data) => global.PMS.component(name, data);

  function normalise(md) {
    return String(md || '').replace(/\r\n?/g, '\n');
  }

  // Indent width with tabs counted as 4 columns.
  function indentOf(line) {
    let n = 0;
    for (const ch of line) {
      if (ch === ' ') n += 1;
      else if (ch === '\t') n += 4;
      else break;
    }
    return n;
  }

  const RE = {
    fence: /^\s*(```|~~~)(.*)$/,
    heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
    hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
    quote: /^\s{0,3}>\s?(.*)$/,
    item: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
    task: /^\[([ xX/-])\]\s*(.*)$/,
    meta: /^(CLOSED|SCHEDULED|DEADLINE|CREATED):/,
    field: /^\*\*([^*]+)\*\*\s*:\s*(.*)$/,
    namedField: /^\*\*\s*(project type|(?:date\s+)?created):\*\*\s*(.*)$/i,
  };

  function isBlockStart(line) {
    return RE.fence.test(line) || RE.heading.test(line) || RE.hr.test(line) || RE.quote.test(line) || RE.item.test(line);
  }

  function isCancelled(text) {
    const t = text.trim();
    return t.startsWith('~~') && t.endsWith('~~') && t.length > 4;
  }

  function safeUrl(url) {
    const u = url.trim();
    if (/^(https?:|mailto:)/i.test(u) || /^[#/.]/.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
    return '#';
  }

  // ---------- inline ----------

  // The markdown files [[references]] can link to, by their name in lowercase.
  const LINKABLE_FILES = ['leads', 'events'];
  let currentNetworkingPage = null; // which file a [[#heading]] with no file name is in

  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

  // A link for [[File#Heading|Label]], or null if it points somewhere that isn't supported.
  // `body` has already been escaped.
  function wikiLink(body) {
    const m = body.match(/^([^#|]*)(?:#([^|]*))?(?:\|(.*))?$/);
    if (!m) return null;
    if (m[1].trim() === 'IMAGE' && m[2] && m[2].trim()) {
      const src = unescape(m[2].trim()).split('/').map(encodeURIComponent).join('/');
      return component('md-image', { src: 'images/' + src, alt: m[3] ? m[3].trim() : m[2].trim() });
    }
    const file = m[1].trim().replace(/\.md$/i, '').toLowerCase();
    const heading = (m[2] || '').trim();
    const page = file ? (LINKABLE_FILES.includes(file) ? file : null) : heading && currentNetworkingPage;
    // Anything starting with an owner's id goes to that owner's page. The list comes from
    // Labels/Owners.csv, by way of the api/owner-tags.js script each page loads first.
    const firstWord = unescape(m[1].trim().split(/\s+/)[0]);
    const owner = !page && (global.PMS_OWNER_IDS || []).includes(firstWord) ? firstWord : null;
    if (!page && !owner) return null;
    const hash = heading ? '#' + encodeURIComponent(unescape(heading)) : '';
    const href = (page ? 'networking.html?page=' + page : 'entity.html?id=' + encodeURIComponent(owner)) + hash;
    return component('md-wikilink', { href, label: m[3] ? m[3].trim() : heading || m[1].trim() });
  }

  // `status` ({ name, html }) swaps the leading status keyword for ready-made HTML.
  function inline(text, status) {
    const stash = [];
    const hold = (html) => '\u0000' + (stash.push(html) - 1) + '\u0000';

    let s = esc(text);

    // code spans
    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) => hold(component('md-code', { code: code.trim() })));
    // [[references]] to a heading in another file
    s = s.replace(/\[\[([^[\]]+)\]\]/g, (all, body) => {
      const link = wikiLink(body);
      return link ? hold(link) : all;
    });
    // [text](url)
    s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, label, url) =>
      hold(component('md-link', { href: safeUrl(url), label: formatEmphasis(global.PMS.displayDates(label)) }))
    );
    // bare URLs
    s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)'"\]]/g, (url) => hold(component('md-link', { href: url, label: url })));
    // [!info], as used to start a callout
    s = s.replace(/\[!info\]/gi, () => hold(component('md-info')));
    if (status) {
      // The status control also shows the priority, so its token is dropped from the text.
      const name = esc(status.name).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      const pattern = new RegExp('^([*_\\s]*)' + name + '(\\*\\*|__|\\*|_)?(\\s*\\[#[A-C]\\])?');
      s = s.replace(pattern, (_, pre, closer) => pre + hold(status.html) + (closer || ''));
    }
    // any other org-style priority [#A]
    s = s.replace(/\[#([A-C])\]/g, (_, p) => hold(component('md-priority', { level: p.toLowerCase(), priority: p })));

    // Code and URLs are already held aside, so they keep their exact characters.
    s = global.PMS.displayDates(s);

    s = formatEmphasis(s);

    // #tags (must start with a letter, preceded by start or whitespace)
    s = s.replace(/(^|\s)#([A-Za-z][\w\-/]*)/g, (_, pre, tag) => pre + hold(component('md-tag', { tag })));

    // restore placeholders (may be nested)
    let prev;
    do {
      prev = s;
      s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
    } while (s !== prev);
    return s;
  }

  function formatEmphasis(s) {
    const del = (_, text) => component('md-del', { text });
    const strong = (_, pre, text) => pre + component('md-strong', { text });
    const em = (_, pre, text) => pre + component('md-em', { text });
    return s
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, del)
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, (_, text) => component('md-strong', { text }))
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, strong)
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, em)
      .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, em);
  }

  // Formats a document line, adding the status control if the scanner found a status there.
  function lineInline(text, no, ctx) {
    const item = ctx.todos.get(no);
    return inline(text, item && item.status && ctx.badge ? { name: item.status, html: ctx.badge(item) } : null);
  }

  // ---------- lists ----------

  function parseList(lines, nos, start, ctx) {
    // Collect the contiguous list block.
    const block = [];
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        // Blank line: continue only if the next non-blank line is still part of the list.
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && (RE.item.test(lines[j]) || indentOf(lines[j]) > 0)) {
          i = j;
          continue;
        }
        break;
      }
      if (RE.item.test(line) || indentOf(line) > 0 || !isBlockStart(line)) block.push({ line, no: nos[i] });
      else break;
      i++;
    }

    // Build a tree using indentation.
    const root = { indent: -1, list: null, children: [] };
    const stack = []; // { indent, list }
    let lastItem = null;

    for (const { line, no } of block) {
      const m = line.match(RE.item);
      if (!m) {
        if (lastItem) lastItem.cont.push({ text: line.trim(), no });
        continue;
      }
      const indent = indentOf(m[1]);
      const ordered = /\d/.test(m[2]);
      let text = m[3];
      let task = null;
      const t = text.match(RE.task);
      if (t) {
        task = t[1].toLowerCase() === 'x';
        text = t[2];
      }
      const item = { text, no, task, cancelled: task !== null && isCancelled(text), cont: [], children: [] };

      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
      let top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        const list = { ordered, items: [] };
        const parentItem = top ? top.list.items[top.list.items.length - 1] : null;
        (parentItem ? parentItem.children : root.children).push(list);
        stack.push({ indent, list });
        top = stack[stack.length - 1];
      }
      top.list.items.push(item);
      lastItem = item;
    }

    return { html: root.children.map((l) => renderList(l, ctx)).join(''), next: i };
  }

  // True if the scanner found an ARCHIVED type status on this line.
  const isArchivedRow = (no, ctx) => {
    const item = ctx.todos.get(no);
    return Boolean(item) && item.type === 'ARCHIVED';
  };

  // An archived item isn't shown, and takes anything nested under it along.
  function renderItem(it, ctx) {
    if (isArchivedRow(it.no, ctx)) return '';
    const cls = [];
    const scanned = it.task !== null ? ctx.todos.get(it.no) : null;
    if (it.task !== null) cls.push('task', it.task ? 'done' : 'open');
    if (it.cancelled) cls.push('cancelled');
    if (scanned && !scanned.status) cls.push('untagged');
    let body = '';
    if (scanned && ctx.checkbox) body += ctx.checkbox(scanned);
    else if (it.task !== null) body += component('md-check', { label: it.task ? '[done]' : '[open]' });
    body += component('md-item-text', { attrs: scanned && ctx.editAttrs ? ctx.editAttrs(scanned) : '', text: lineInline(it.text, it.no, ctx) });
    for (const c of it.cont) {
      body += RE.meta.test(c.text)
        ? component('md-item-meta', { text: global.PMS.displayDates(esc(c.text)) })
        : component('md-item-cont', { text: lineInline(c.text, c.no, ctx) });
    }
    body += it.children.map((l) => renderList(l, ctx)).join('');
    return component('md-item', { classes: cls.join(' '), body });
  }

  function renderList(list, ctx) {
    const items = list.items.map((it) => renderItem(it, ctx)).join('');
    if (!items) return '';
    return component('md-list', { tag: list.ordered ? 'ol' : 'ul', tasks: list.items.some((it) => it.task !== null), items });
  }

  // ---------- blocks ----------

  // opts.todos:       Map of source line number -> scanned status item
  // opts.badge:       builds the HTML control for an item's status
  // opts.checkbox:    builds the HTML control for an item's checkbox
  // opts.editAttrs:   builds attributes that make an item's text editable
  // opts.lineNumbers: source line number of each line in `md`, when md is an excerpt
  // opts.titleLine, opts.titleHtml: replaces the contents of the page title
  // opts.lineHtml:    { line, html } replaces a paragraph line with HTML
  // opts.appendTo:    Map of source line -> HTML to add to the end of that paragraph line
  // opts.insertAfter: Map of source line -> HTML to add as a new line after it
  function render(md, opts) {
    const o = opts || {};
    const lines = normalise(md).split('\n');
    const ctx = {
      todos: o.todos || new Map(),
      badge: o.badge,
      checkbox: o.checkbox,
      editAttrs: o.editAttrs,
      titleLine: o.titleLine,
      titleHtml: o.titleHtml,
      lineHtml: o.lineHtml || {},
      appendTo: o.appendTo || new Map(),
      insertAfter: o.insertAfter || new Map(),
    };
    return renderLines(lines, o.lineNumbers || lines.map((_, i) => i + 1), ctx);
  }

  function renderLines(lines, nos, ctx) {
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim() === '') {
        i++;
        continue;
      }

      const fence = line.match(RE.fence);
      if (fence) {
        const marker = fence[1];
        const lang = fence[2].trim();
        const code = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(marker)) code.push(lines[i++]);
        i++; // closing fence
        out.push(component('md-pre', { lang: lang ? esc(lang) : '', code: esc(code.join('\n')) }));
        continue;
      }

      const h = line.match(RE.heading);
      if (h) {
        const level = h[1].length;
        const inner = nos[i] === ctx.titleLine && ctx.titleHtml ? ctx.titleHtml : lineInline(h[2], nos[i], ctx);
        out.push(component('md-heading', { level, id: slug(h[2]), inner }));
        if (ctx.insertAfter.has(nos[i])) out.push(component('md-paragraph', { inner: ctx.insertAfter.get(nos[i]) }));
        i++;
        continue;
      }

      if (RE.hr.test(line)) {
        out.push(component('md-rule'));
        i++;
        continue;
      }

      if (RE.quote.test(line)) {
        const q = [];
        const qNos = [];
        while (i < lines.length && RE.quote.test(lines[i])) {
          q.push(lines[i].match(RE.quote)[1]);
          qNos.push(nos[i]);
          i++;
        }
        out.push(component('md-quote', { inner: renderLines(q, qNos, ctx) }));
        continue;
      }

      if (RE.item.test(line)) {
        const res = parseList(lines, nos, i, ctx);
        out.push(res.html);
        i = res.next;
        continue;
      }

      // Paragraph: gather until a blank line or another block starts.
      const para = [];
      while (i < lines.length && lines[i].trim() !== '' && !(para.length && isBlockStart(lines[i]))) {
        if (isArchivedRow(nos[i], ctx)) {
          i++;
          while (i < lines.length && RE.meta.test(lines[i].trim())) i++; // its CLOSED line and so on
          continue;
        }
        const content = nos[i] === ctx.lineHtml.line ? ctx.lineHtml.html : lineInline(lines[i].trim(), nos[i], ctx);
        para.push(content + (ctx.appendTo.get(nos[i]) || ''));
        if (ctx.insertAfter.has(nos[i])) para.push(ctx.insertAfter.get(nos[i]));
        i++;
      }
      if (para.length) out.push(component('md-paragraph', { inner: para.join(component('md-break')) }));
    }

    return out.join('\n');
  }

  function slug(s) {
    return String(s)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  // ---------- PMS parsers ----------

  // Title (first H1) and **Key**: value fields, with the line numbers they came from.
  function parseMeta(md) {
    const lines = normalise(md).split('\n');
    const meta = { title: null, fields: {}, order: [], lines: [] };
    lines.forEach((line, idx) => {
      if (meta.title === null) {
        const h = line.match(/^#\s+(.*?)\s*$/);
        if (h) {
          meta.title = h[1];
          meta.lines.push(idx);
          return;
        }
      }
      const f = line.trim().match(RE.field) || line.trim().match(RE.namedField);
      if (f) {
        const key = f[1].trim();
        meta.fields[key.toLowerCase()] = f[2].trim();
        meta.order.push(key);
        meta.lines.push(idx);
      }
    });
    return meta;
  }

  // True if a checkbox's text opens with a status of the ARCHIVED type. Those names come from
  // Labels/Status.csv, by way of the api/owner-tags.js script each page loads first.
  function startsWithArchivedStatus(text) {
    const words = text.replace(/^[*_\s]+/, '').split(/[\s:*_]/, 1);
    return (global.PMS_ARCHIVED_STATUSES || []).includes(words[0]);
  }

  // Every ### under "## Milestones" (until the next # or ## heading) with its checkbox stats.
  function parseMilestones(md) {
    const lines = normalise(md).split('\n');
    const result = { found: false, start: -1, end: -1, milestones: [] };

    const start = lines.findIndex((l) => /^##\s+milestones?\s*$/i.test(l.trim()));
    if (start === -1) return result;
    result.found = true;
    result.start = start;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{1,2}\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    result.end = end;

    let current = null;
    let archivedIndent = null; // set while passing an archived row and what's nested under it
    for (let i = start + 1; i < end; i++) {
      const h = lines[i].match(/^###\s+(.*?)\s*$/);
      if (h) {
        current = { title: h[1], firstLine: i + 2, body: [], total: 0, done: 0, cancelled: 0 };
        result.milestones.push(current);
        continue;
      }
      if (!current) continue;
      current.body.push(lines[i]);
      const m = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX/-])\]\s*(.*)$/);
      if (!m) continue;
      if (archivedIndent !== null && indentOf(lines[i]) > archivedIndent) continue;
      archivedIndent = null;
      if (startsWithArchivedStatus(m[2])) {
        archivedIndent = indentOf(lines[i]);
        current.total++; // hidden, but still a finished task
        current.done++;
        continue;
      }
      if (isCancelled(m[2])) {
        current.cancelled++;
        continue;
      }
      current.total++;
      if (m[1].toLowerCase() === 'x') current.done++;
    }

    for (const ms of result.milestones) {
      ms.body = ms.body.join('\n');
      ms.state = ms.total === 0 ? 'none' : ms.done === ms.total ? 'done' : ms.done > 0 ? 'partial' : 'todo';
    }
    return result;
  }

  global.PMS = Object.assign(global.PMS || {}, {
    markdown: {
      render,
      inline,
      parseMeta,
      parseMilestones,
      normalise,
      setNetworkingPage: (page) => {
        currentNetworkingPage = page;
      },
    },
  });
})(window);
