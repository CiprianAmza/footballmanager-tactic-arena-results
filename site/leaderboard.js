/* Leaderboard: every tested tactic, like the fm-arena aggregator table. */
(function () {
  'use strict';
  var A = window.Arena;
  var h = A.h;

  var NUMERIC = [
    { key: 'pld', label: 'PLD' }, { key: 'pts', label: 'PTS' }, { key: 'gd', label: 'GD' },
    { key: 'gf', label: 'GF' }, { key: 'ga', label: 'GA' }, { key: 'xgf', label: 'xGF' },
    { key: 'xga', label: 'xGA' }, { key: 'xgd', label: 'xGD' }
  ];
  var state = { board: null, split: 'overall', sortKey: 'pts', sortDesc: true, engine: '' };

  function row(test) {
    var results = test && test.results;
    var split = results && results[state.split];
    return split && typeof split === 'object' ? split : null;
  }

  function uploaded(test) {
    var d = A.parseDate(test.finishedAt) || A.parseDate(test.createdAt);
    return d ? d.getTime() : 0;
  }

  function value(test) {
    if (state.sortKey === 'uploaded') return uploaded(test);
    var split = row(test);
    if (!split) return null;
    var v = split[state.sortKey];
    return A.isNum(v) ? v : null;
  }

  function sortedTests() {
    var tests = (state.board.tests || []).filter(function (test) {
      return !state.engine || A.engineLabel(test) === state.engine;
    });
    return tests.slice().sort(function (left, right) {
      var a = value(left), b = value(right);
      if (a === null && b === null) return uploaded(right) - uploaded(left);
      if (a === null) return 1;
      if (b === null) return -1;
      return state.sortDesc ? b - a : a - b;
    });
  }

  function sortBy(key) {
    if (state.sortKey === key) state.sortDesc = !state.sortDesc;
    else { state.sortKey = key; state.sortDesc = key !== 'ga' && key !== 'xga'; }
    render();
  }

  function arrow(key) { return state.sortKey === key ? (state.sortDesc ? ' ▼' : ' ▲') : ''; }

  function renderHead() {
    var head = document.getElementById('head-row');
    head.textContent = '';
    var labels = hasClubs() ? ['Thread', 'Formation', 'Owner', 'Club', 'League'] : ['Thread', 'Formation', 'Owner'];
    labels.forEach(function (label) {
      head.appendChild(h('th', { class: 'ta-left', text: label }));
    });
    NUMERIC.concat([{ key: 'uploaded', label: 'Uploaded' }]).forEach(function (column) {
      head.appendChild(h('th', {
        class: 'sortable' + (state.sortKey === column.key ? ' sorted' : ''),
        text: column.label + arrow(column.key),
        onclick: function () { sortBy(column.key); }
      }));
    });
  }

  /** Club / League columns only when some test has a chosen club (general-only tests have none). */
  function hasClubs() {
    return (state.board.tests || []).some(function (test) { return test && (test.teamName || test.leagueName); });
  }

  /** The chosen club's media prediction ("6 / 20"), as small text next to the club. */
  function prediction(test) {
    var chosen = (test.runs || []).filter(function (run) { return run && run.kind === 'CHOSEN'; })[0];
    var text = chosen ? A.placeText(chosen.predictedPosition, chosen.leagueSize) : null;
    return text ? h('span', { class: 'ta-small', title: 'Media prediction', text: ' (pred. ' + text + ')' }) : null;
  }

  function renderRows() {
    var body = document.getElementById('rows');
    body.textContent = '';
    var tests = sortedTests();
    var clubs = hasClubs();
    var columns = NUMERIC.length + (clubs ? 6 : 4);
    if (!tests.length) {
      body.appendChild(h('tr', null, h('td', { class: 'ta-left ta-muted', colspan: columns,
        text: (state.board.tests || []).length ? 'No test matches this filter.' : 'No tactic has been tested yet.' })));
      return;
    }
    tests.forEach(function (test) {
      var url = A.testUrl(test.key);
      var thread = h('td', { class: 'ta-left ta-thread' },
        h('a', { href: url, text: A.show(test.name), onclick: function (event) { event.stopPropagation(); } }));
      if (test.status && test.status !== 'DONE') thread.appendChild(h('span', { class: 'ta-status ' + test.status, text: test.status }));
      var tr = h('tr', { class: 'ta-link-row', onclick: function () { window.location.href = url; } },
        thread,
        h('td', { class: 'ta-left', text: A.formationLabel(test.formation) }),
        h('td', { class: 'ta-left', text: A.show(test.owner) }),
        clubs ? h('td', { class: 'ta-left' }, A.show(test.teamName), prediction(test)) : null,
        clubs ? h('td', { class: 'ta-left', text: A.show(test.leagueName) }) : null);
      var s = row(test);
      if (s) {
        tr.appendChild(h('td', { text: A.show(s.pld) }));
        tr.appendChild(h('td', { class: 'ta-strong', text: A.pts(s) }));
        tr.appendChild(h('td', { class: A.signClass(s.gd), text: A.signed(s.gd) }));
        tr.appendChild(h('td', { text: A.show(s.gf) }));
        tr.appendChild(h('td', { text: A.show(s.ga) }));
        tr.appendChild(h('td', { text: A.show(s.xgf) }));
        tr.appendChild(h('td', { text: A.show(s.xga) }));
        tr.appendChild(h('td', { class: A.signClass(s.xgd), text: A.signed(s.xgd) }));
      } else {
        NUMERIC.forEach(function () { tr.appendChild(h('td', { class: 'ta-muted', text: '—' })); });
      }
      tr.appendChild(h('td', { text: A.formatDate(test.finishedAt || test.createdAt) }));
      body.appendChild(tr);
    });
  }

  function render() {
    renderHead();
    renderRows();
    var tabs = document.querySelectorAll('#tabs button');
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].getAttribute('data-split') === state.split;
      tabs[i].classList.toggle('active', active);
      tabs[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }

  function setupFilter() {
    var labels = {};
    (state.board.tests || []).forEach(function (test) {
      var label = A.engineLabel(test);
      if (label) labels[label] = true;
    });
    var names = Object.keys(labels).sort();
    if (!names.length) return;
    var select = document.getElementById('engine-filter');
    names.forEach(function (name) { select.appendChild(h('option', { value: name, text: name })); });
    select.addEventListener('change', function () { state.engine = select.value; render(); });
    document.getElementById('filter-wrap').hidden = false;
  }

  document.getElementById('tabs').addEventListener('click', function (event) {
    var split = event.target && event.target.getAttribute && event.target.getAttribute('data-split');
    if (split && state.board) { state.split = split; render(); }
  });

  A.loadJson('data/index.json').then(function (board) {
    state.board = board && typeof board === 'object' ? board : { tests: [] };
    if (!Array.isArray(state.board.tests)) state.board.tests = [];
    var count = A.isNum(state.board.testsCount) ? state.board.testsCount : state.board.tests.length;
    var matches = A.isNum(state.board.matchesPlayed) ? state.board.matchesPlayed : 0;
    document.getElementById('summary').textContent =
      count + ' tactics have been tested. Total number of matches played is ' + matches + '.';
    if (state.board.generatedAt) {
      document.getElementById('generated').textContent = 'Updated ' + A.formatDate(state.board.generatedAt, true) + '.';
    }
    var refs = (Array.isArray(state.board.referenceClubs) ? state.board.referenceClubs : [])
      .filter(function (name) { return typeof name === 'string' && name; });
    if (refs.length) {
      document.getElementById('pts-note').textContent = 'PTS = average league points per season / maximum possible, from the three reference clubs (' +
        refs.join(', ') + ').';
    }
    setupFilter();
    render();
  }).catch(function (error) {
    var box = document.getElementById('error');
    box.textContent = 'The leaderboard could not be loaded (' + error.message + ').';
    box.hidden = false;
    document.getElementById('summary').textContent = '';
    document.getElementById('rows').textContent = '';
  });
})();
