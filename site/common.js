/* Shared helpers for the Tactic Arena results site (plain JavaScript, no dependencies). */
(function () {
  'use strict';

  var FORMATIONS = {
    '442': '4-4-2', '433': '4-3-3', '343': '3-4-3', '451': '4-5-1', '352': '3-5-2',
    '4231': '4-2-3-1', '4141': '4-1-4-1', '4411': '4-4-1-1', '4321': '4-3-2-1',
    '4222': '4-2-2-2', '3421': '3-4-2-1', '532': '5-3-2', '5212': '5-2-1-2',
    '541': '5-4-1', '3511': '3-5-1-1', '31411': '3-1-4-1-1'
  };

  /** Builds an element; text is always inserted as text, never as HTML. */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'style') el.setAttribute('style', value);
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : String(value));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function isNum(value) { return typeof value === 'number' && isFinite(value); }

  function show(value) {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  function signed(value) {
    if (!isNum(value)) return '—';
    return value > 0 ? '+' + value : String(value);
  }

  function signClass(value) {
    return isNum(value) && value > 0 ? 'ta-pos' : (isNum(value) && value < 0 ? 'ta-neg' : null);
  }

  function formationLabel(key) {
    if (key === null || key === undefined || key === '') return '—';
    return FORMATIONS[String(key)] || String(key);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function parseDate(value) {
    if (!value) return null;
    var time = Date.parse(value);
    return isNaN(time) ? null : new Date(time);
  }

  /** dd.MM.yyyy, optionally with HH:mm (local time). */
  function formatDate(value, withTime) {
    var d = parseDate(value);
    if (!d) return '—';
    var text = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    if (withTime) text += ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return text;
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
      return response.json();
    });
  }

  function engineLabel(test) {
    var parts = [];
    if (test && test.engine) parts.push(String(test.engine));
    if (test && test.version) parts.push(String(test.version));
    return parts.join(' · ');
  }

  function testUrl(key) { return 'test.html?t=' + encodeURIComponent(key); }

  /** The fm-arena results block: Overall / Home / Away and "Based on N test result(s)". */
  function resultsBlock(results, title, emptyText) {
    var section = h('section', { class: 'ta-results' });
    if (title) section.appendChild(h('h3', { text: title }));
    var rows = [];
    if (results && typeof results === 'object') {
      [['Overall', 'overall'], ['Home', 'home'], ['Away', 'away']].forEach(function (pair) {
        var split = results[pair[1]];
        if (split && typeof split === 'object') rows.push([pair[0], split]);
      });
    }
    if (!rows.length) {
      section.appendChild(h('p', { class: 'ta-muted', text: emptyText || 'No results yet.' }));
      return section;
    }
    var head = h('tr', null, h('th', { class: 'ta-left' }),
      ['PLD', 'PTS', 'xPts', 'GD', 'GF', 'GA', 'xGF', 'xGA', 'xGD'].map(function (label) { return h('th', { text: label }); }));
    var body = h('tbody');
    rows.forEach(function (pair) {
      var s = pair[1];
      body.appendChild(h('tr', null,
        h('td', { class: 'ta-left ta-strong', text: pair[0] }),
        h('td', { text: show(s.pld) }),
        h('td', { class: 'ta-strong', text: pts(s) }),
        h('td', { title: XPTS_TITLE, text: xpts(s) }),
        h('td', { class: signClass(s.gd), text: signed(s.gd) }),
        h('td', { text: show(s.gf) }),
        h('td', { text: show(s.ga) }),
        h('td', { text: show(s.xgf) }),
        h('td', { text: show(s.xga) }),
        h('td', { class: signClass(s.xgd), text: signed(s.xgd) })));
    });
    section.appendChild(h('div', { class: 'ta-scroll' }, h('table', { class: 'ta-table' }, h('thead', null, head), body)));
    if (isNum(results.basedOn)) {
      section.appendChild(h('p', { class: 'ta-based', text: 'Based on ' + results.basedOn + ' test result(s)' }));
    }
    return section;
  }

  /** "6 / 12" (place / clubs in the league); null when the place is unknown. */
  function placeText(position, size) {
    if (!isNum(position) || position <= 0) return null;
    return position + ' / ' + (isNum(size) && size > 0 ? size : '—');
  }

  var XPTS_TITLE = "Expected points: 3 × chance to win + 1 × chance to draw in every match, from the engine's pre-match chances.";

  /** Expected points with one decimal, or "—". */
  function xpts(split) { return split && isNum(split.xpts) ? split.xpts.toFixed(1) : '—'; }

  function pts(split) {
    if (!split || !isNum(split.pts)) return '—';
    return split.pts + ' / ' + show(split.ptsMax);
  }

  /** One full-screen viewer for every screenshot on the page. */
  var lightbox = null;
  function openLightbox(src, alt) {
    if (!lightbox) {
      lightbox = h('div', { class: 'ta-lightbox', role: 'dialog', 'aria-label': 'Screenshot', hidden: true });
      lightbox.addEventListener('click', closeLightbox);
      document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeLightbox(); });
      document.body.appendChild(lightbox);
    }
    lightbox.textContent = '';
    lightbox.appendChild(h('img', { src: src, alt: alt || 'Screenshot, full size' }));
    lightbox.hidden = false;
  }
  function closeLightbox() { if (lightbox) { lightbox.hidden = true; lightbox.textContent = ''; } }

  window.Arena = {
    h: h, show: show, signed: signed, signClass: signClass, isNum: isNum, pts: pts, xpts: xpts, XPTS_TITLE: XPTS_TITLE, placeText: placeText,
    formationLabel: formationLabel, formatDate: formatDate, parseDate: parseDate,
    loadJson: loadJson, engineLabel: engineLabel, testUrl: testUrl,
    resultsBlock: resultsBlock, openLightbox: openLightbox
  };
})();
