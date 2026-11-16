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
  var SPLITS = ['overall', 'home', 'away'];
  var CATEGORIES = [
    { key: 'general', value: 'GENERAL', label: 'General' },
    { key: 'diamond', value: 'DIAMOND', label: 'Diamond League clubs' }
  ];
  /** General tests: the average of the three reference clubs, then each club type. */
  var GENERAL_TEAMS = [
    { key: 'all', label: 'All reference clubs', best: 'Best overall' },
    { key: 'top', tier: 'TOP', label: 'Top club', best: 'Best for a top club' },
    { key: 'mid', tier: 'MID', label: 'Mid-table club', best: 'Best for a mid-table club' },
    { key: 'bottom', tier: 'BOTTOM', label: 'Bottom club', best: 'Best for a bottom club' }
  ];
  var state = {
    board: null, cat: 'general', split: 'overall', team: 'all', formationsOnly: false,
    sortKey: 'pts', sortDesc: true, engine: ''
  };

  function categoryOf(test) { return String(test.category || 'GENERAL').toUpperCase() === 'DIAMOND' ? 'diamond' : 'general'; }
  function catTests() { return state.board.tests.filter(function (test) { return categoryOf(test) === state.cat; }); }

  function uploaded(test) {
    var d = A.parseDate(test.finishedAt) || A.parseDate(test.createdAt);
    return d ? d.getTime() : 0;
  }

  function newestFirst(tests) { return tests.slice().sort(function (a, b) { return uploaded(b) - uploaded(a); }); }

  function predText(club) {
    var pred = club ? A.placeText(club.predictedPosition, club.leagueSize) : null;
    return pred ? ' (pred. ' + pred + ')' : '';
  }

  /** The "Team" choices of the current category. */
  function teams() {
    if (state.cat === 'general') {
      return GENERAL_TEAMS.map(function (team) {
        if (!team.tier) return team;
        var club = tierClub(team.tier);
        return {
          key: team.key, tier: team.tier, best: team.best, clubName: club ? club.teamName : null,
          label: team.label + (club ? ' · ' + club.teamName + predText(club) : '')
        };
      });
    }
    var list = [{ key: 'all', label: 'All 8 clubs', best: 'Best overall (8 clubs)' }];
    var seen = {};
    newestFirst(catTests()).forEach(function (test) {
      (test.byClub || []).forEach(function (club) {
        if (!club || club.teamId === null || club.teamId === undefined || seen[club.teamId]) return;
        seen[club.teamId] = true;
        list.push({ key: 'c' + club.teamId, teamId: club.teamId, clubName: club.teamName,
          label: A.show(club.teamName) + predText(club), best: A.show(club.teamName) });
      });
    });
    return list;
  }

  function currentTeam() {
    var all = teams();
    return all.filter(function (t) { return t.key === state.team; })[0] || all[0];
  }

  /** Name and prediction of a general reference club type, from the newest test that has it. */
  function tierClub(tier) {
    var tests = newestFirst(catTests());
    for (var i = 0; i < tests.length; i++) {
      var club = tests[i].byTier && tests[i].byTier[tier];
      if (club && club.teamName) return club;
    }
    return null;
  }

  /** The results block for a test and a team choice: the average, a club type, or one club. */
  function resultsOf(test, team) {
    if (team.tier) {
      var tier = test.byTier && test.byTier[team.tier];
      return tier && tier.results;
    }
    if (team.teamId !== undefined) {
      var club = (test.byClub || []).filter(function (c) { return c && c.teamId === team.teamId; })[0];
      return club && club.results;
    }
    return test.results;
  }

  /** Diamond League figures for a test and a team choice (null when that club does not play in it). */
  function diamondOf(test, team, split) {
    var block;
    if (team.tier) block = test.byTier && test.byTier[team.tier] && test.byTier[team.tier].diamond;
    else if (team.teamId !== undefined) {
      var club = (test.byClub || []).filter(function (c) { return c && c.teamId === team.teamId; })[0];
      block = club && club.diamond;
    } else block = test.diamond;
    var value = block && block[split];
    return value && typeof value === 'object' && A.isNum(value.pts) ? value : null;
  }

  /** The byTier / byClub entry of a club choice; null for the averages. */
  function entryOf(test, team) {
    if (team.tier) return (test.byTier && test.byTier[team.tier]) || null;
    if (team.teamId !== undefined) return (test.byClub || []).filter(function (c) { return c && c.teamId === team.teamId; })[0] || null;
    return null;
  }

  var TIER_ORDER = ['TOP', 'MID', 'BOTTOM'];

  /** League place for the table: {text, sort, cls}; for "All reference clubs" the three places "1 · 11 · 17". */
  function leaguePos(test, team) {
    if (team.key === 'all') {
      if (state.cat !== 'general') return null;
      var places = TIER_ORDER.map(function (t) { var e = test.byTier && test.byTier[t]; return e && A.isNum(e.finalPosition) ? e.finalPosition : null; });
      var known = places.filter(function (p) { return p !== null; });
      if (!known.length) return null;
      return { text: places.map(function (p) { return p === null ? '—' : p; }).join(' · '),
        sort: known.reduce(function (a, b) { return a + b; }, 0) / known.length, cls: null,
        title: 'Final league places: top · mid-table · bottom club' };
    }
    var e = entryOf(test, team);
    if (!e || !A.isNum(e.finalPosition)) return null;
    var cls = null, title = null;
    if (A.isNum(e.predictedPosition)) {
      if (e.finalPosition < e.predictedPosition) { cls = 'ta-pos'; title = 'Better than predicted (' + e.predictedPosition + ')'; }
      else if (e.finalPosition > e.predictedPosition) { cls = 'ta-neg'; title = 'Worse than predicted (' + e.predictedPosition + ')'; }
    }
    return { text: A.placeText(e.finalPosition, e.finalLeagueSize), sort: e.finalPosition, cls: cls, title: title };
  }

  /** Diamond League place: the chosen club's, or the top club's for the general average. */
  function diamondPos(test, team) {
    var e;
    if (team.key === 'all') {
      if (state.cat !== 'general') return null;
      e = test.byTier && test.byTier.TOP;
    } else {
      e = entryOf(test, team);
    }
    var d = e && e.diamond;
    if (!d || !A.isNum(d.position)) return null;
    return { text: A.placeText(d.position, d.of), sort: d.position };
  }

  function hasDiamond() {
    return catTests().some(function (test) {
      if (test.diamond) return true;
      return (test.byClub || []).some(function (c) { return c && c.diamond; });
    });
  }

  function splitOf(test, team, split) {
    var results = resultsOf(test, team);
    var value = results && results[split];
    return value && typeof value === 'object' ? value : null;
  }

  /** Share of the maximum points (0-100). */
  function pct(split) {
    if (!split) return null;
    if (A.isNum(split.ptsPct)) return split.ptsPct;
    return A.isNum(split.pts) && A.isNum(split.ptsMax) && split.ptsMax > 0 ? Math.round(split.pts * 1000 / split.ptsMax) / 10 : null;
  }

  /** Points are compared as a share when the compared clubs have different maxima (8 clubs, several leagues). */
  function usePct(team) { return state.cat === 'diamond' && team.teamId === undefined; }

  function points(split, team) { return usePct(team) ? pct(split) : (split && A.isNum(split.pts) ? split.pts : null); }

  function value(test, team) {
    if (state.sortKey === 'uploaded') return uploaded(test);
    if (state.sortKey === 'dl') return pct(diamondOf(test, team, state.split));
    if (state.sortKey === 'lpos') { var lp = leaguePos(test, team); return lp ? lp.sort : null; }
    if (state.sortKey === 'dlpos') { var dp = diamondPos(test, team); return dp ? dp.sort : null; }
    var split = splitOf(test, team, state.split);
    if (!split) return null;
    if (state.sortKey === 'pts') return points(split, team);
    var v = split[state.sortKey];
    return A.isNum(v) ? v : null;
  }

  function visibleTests() {
    return catTests().filter(function (test) {
      if (state.engine && A.engineLabel(test) !== state.engine) return false;
      if (state.formationsOnly && test.formationOnly !== true) return false;
      return true;
    });
  }

  function sortedTests(team) {
    return visibleTests().sort(function (left, right) {
      var a = value(left, team), b = value(right, team);
      if (a === null && b === null) return uploaded(right) - uploaded(left);
      if (a === null) return 1;
      if (b === null) return -1;
      return state.sortDesc ? b - a : a - b;
    });
  }

  function sortBy(key) {
    if (state.sortKey === key) state.sortDesc = !state.sortDesc;
    else { state.sortKey = key; state.sortDesc = ['ga', 'xga', 'lpos', 'dlpos'].indexOf(key) < 0; }
    render();
  }

  function arrow(key) { return state.sortKey === key ? (state.sortDesc ? ' ▼' : ' ▲') : ''; }

  /** Club / League columns only when some test has a chosen club (general-only tests have none). */
  function hasClubs() {
    return catTests().some(function (test) { return test.teamName || test.leagueName; });
  }

  /** The chosen club's media prediction ("6 / 20"), as small text next to the club. */
  function prediction(test) {
    var chosen = (test.runs || []).filter(function (run) { return run && run.kind === 'CHOSEN'; })[0];
    var text = chosen ? A.placeText(chosen.predictedPosition, chosen.leagueSize) : null;
    return text ? h('span', { class: 'ta-small', title: 'Media prediction', text: ' (pred. ' + text + ')' }) : null;
  }

  function ptsCell(split) {
    var cell = h('td', { class: 'ta-strong', text: A.pts(split) });
    var share = pct(split);
    if (state.cat === 'diamond' && share !== null) cell.appendChild(h('span', { class: 'ta-small pct', text: ' ' + share + '%' }));
    return cell;
  }

  /* ---------- address ---------- */

  function readAddress() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('cat') === 'diamond') state.cat = 'diamond';
    var view = params.get('view');
    if (view && SPLITS.indexOf(view) >= 0) state.split = view;
    state.team = params.get('team') || 'all';
    state.formationsOnly = params.get('formations') === '1';
  }

  function writeAddress() {
    var params = new URLSearchParams(window.location.search);
    function put(name, value, fallback) { if (value !== fallback) params.set(name, value); else params.delete(name); }
    put('cat', state.cat, 'general');
    put('team', state.team, 'all');
    put('view', state.split, 'overall');
    put('formations', state.formationsOnly ? '1' : '0', '0');
    var query = params.toString();
    try { history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash); } catch (e) { /* ignore */ }
  }

  /* ---------- summary ---------- */

  function renderSummary() {
    var done = catTests().filter(function (test) { return !test.status || test.status === 'DONE'; });
    var matches = 0;
    done.forEach(function (test) {
      var s = test.results && test.results.overall;
      if (s && A.isNum(s.pld)) matches += s.pld;
    });
    document.getElementById('summary').textContent = state.board.tests.length === 0 ? 'No tests yet.'
      : done.length + ' tactics have been tested. Total number of matches played is ' + matches + '.';
    var note = document.getElementById('pts-note');
    var names = teams().filter(function (t) { return t.clubName; }).map(function (t) { return t.clubName; });
    if (state.cat === 'diamond') {
      note.textContent = 'PTS = average league points per season / maximum possible over the Diamond League clubs' +
        (names.length ? ' (' + names.join(', ') + ')' : '') + '; the % is the share of the maximum, used to rank "All 8 clubs".';
    } else {
      var refs = names.length ? names : (state.board.referenceClubs || []);
      note.textContent = 'PTS = average league points per season / maximum possible, from the three reference clubs' +
        (refs.length ? ' (' + refs.join(', ') + ')' : '') + '.';
    }
  }

  /** Best test for a team choice: most Overall points (share for mixed leagues), then goal difference. */
  function best(team) {
    var winner = null, winnerPts = null, winnerGd = null;
    visibleTests().forEach(function (test) {
      var s = splitOf(test, team, 'overall');
      var p = points(s, team);
      if (p === null) return;
      var gd = A.isNum(s.gd) ? s.gd : -Infinity;
      if (!winner || p > winnerPts || (p === winnerPts && gd > winnerGd)) { winner = { test: test, split: s }; winnerPts = p; winnerGd = gd; }
    });
    return winner;
  }

  function renderCards() {
    var box = document.getElementById('best-cards');
    box.textContent = '';
    box.classList.toggle('compact', state.cat === 'diamond');
    teams().forEach(function (team) {
      var found = best(team);
      var card = h('div', { class: 'best-card' + (state.team === team.key ? ' active' : ''),
        title: 'Show the table for: ' + team.label, onclick: function () { state.team = team.key; render(); } },
        h('span', { class: 'best-title', text: state.cat === 'diamond' && team.teamId !== undefined ? 'Best for ' + team.best : team.best }),
        state.cat === 'general' && team.clubName ? h('span', { class: 'ta-small', text: team.clubName }) : null);
      if (found) {
        card.appendChild(h('a', { class: 'best-name', href: A.testUrl(found.test.key), text: A.show(found.test.name),
          onclick: function (event) { event.stopPropagation(); } }));
        var share = pct(found.split);
        card.appendChild(h('span', { class: 'best-meta' },
          A.formationLabel(found.test.formation) + ' · ', h('strong', { text: A.pts(found.split) }),
          state.cat === 'diamond' && share !== null ? ' (' + share + '%)' : '',
          ' · GD ' + A.signed(found.split.gd)));
      } else {
        card.appendChild(h('span', { class: 'ta-muted', text: 'No results yet' }));
      }
      box.appendChild(card);
    });
    if (hasDiamond()) box.appendChild(diamondCard());
  }

  /** "Best in the Diamond League": highest share of Diamond League points (reference average), then goal difference. */
  function diamondCard() {
    var all = { key: 'all' };
    var winner = null, winnerPct = null, winnerGd = null;
    visibleTests().forEach(function (test) {
      var s = diamondOf(test, all, 'overall');
      var p = pct(s);
      if (p === null) return;
      var gd = A.isNum(s.gd) ? s.gd : -Infinity;
      if (!winner || p > winnerPct || (p === winnerPct && gd > winnerGd)) { winner = { test: test, split: s }; winnerPct = p; winnerGd = gd; }
    });
    var card = h('div', { class: 'best-card diamond-card', title: 'Sort the table by Diamond League points',
      onclick: function () { state.sortKey = 'dl'; state.sortDesc = true; render(); } },
      h('span', { class: 'best-title', text: 'Best in the Diamond League' }));
    if (winner) {
      card.appendChild(h('a', { class: 'best-name', href: A.testUrl(winner.test.key), text: A.show(winner.test.name),
        onclick: function (event) { event.stopPropagation(); } }));
      card.appendChild(h('span', { class: 'best-meta' }, A.formationLabel(winner.test.formation) + ' · ',
        h('strong', { text: A.pts(winner.split) }), ' (' + winnerPct + '%) · GD ' + A.signed(winner.split.gd)));
    } else {
      card.appendChild(h('span', { class: 'ta-muted', text: 'No results yet' }));
    }
    return card;
  }

  /* ---------- table ---------- */

  /** Which optional columns the current category and team choice have data for. */
  function optionalColumns(team) {
    var tests = catTests();
    return {
      lpos: tests.some(function (t) { return leaguePos(t, team) !== null; }),
      dl: hasDiamond(),
      dlpos: tests.some(function (t) { return diamondPos(t, team) !== null; })
    };
  }

  function renderHead(clubs, team) {
    var head = document.getElementById('head-row');
    head.textContent = '';
    (clubs ? ['Thread', 'Formation', 'Owner', 'Club', 'League'] : ['Thread', 'Formation', 'Owner']).forEach(function (label) {
      head.appendChild(h('th', { class: 'ta-left', text: label }));
    });
    var opt = optionalColumns(team);
    (opt.lpos ? [{ key: 'lpos', label: 'League pos' }] : []).concat(NUMERIC)
      .concat(opt.dl ? [{ key: 'dl', label: 'Diamond League' }] : [])
      .concat(opt.dlpos ? [{ key: 'dlpos', label: 'DL pos' }] : [])
      .concat([{ key: 'uploaded', label: 'Uploaded' }]).forEach(function (column) {
      head.appendChild(h('th', {
        class: 'sortable' + (state.sortKey === column.key ? ' sorted' : ''),
        text: column.label + arrow(column.key),
        onclick: function () { sortBy(column.key); }
      }));
    });
  }

  function renderRows(team, clubs) {
    var body = document.getElementById('rows');
    body.textContent = '';
    var tests = sortedTests(team);
    var opt = optionalColumns(team);
    var diamond = opt.dl;
    var columns = NUMERIC.length + (clubs ? 6 : 4) + (opt.dl ? 1 : 0) + (opt.lpos ? 1 : 0) + (opt.dlpos ? 1 : 0);
    if (!tests.length) {
      body.appendChild(h('tr', null, h('td', { class: 'ta-left ta-muted', colspan: columns,
        text: catTests().length ? 'No test matches this filter.' : 'No tests yet.' })));
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
      if (opt.lpos) {
        var lp = leaguePos(test, team);
        tr.appendChild(h('td', { class: lp ? lp.cls : 'ta-muted', title: lp ? lp.title : null, text: lp ? lp.text : '—' }));
      }
      var s = splitOf(test, team, state.split);
      if (s) {
        tr.appendChild(h('td', { text: A.show(s.pld) }));
        tr.appendChild(ptsCell(s));
        tr.appendChild(h('td', { class: A.signClass(s.gd), text: A.signed(s.gd) }));
        tr.appendChild(h('td', { text: A.show(s.gf) }));
        tr.appendChild(h('td', { text: A.show(s.ga) }));
        tr.appendChild(h('td', { text: A.show(s.xgf) }));
        tr.appendChild(h('td', { text: A.show(s.xga) }));
        tr.appendChild(h('td', { class: A.signClass(s.xgd), text: A.signed(s.xgd) }));
      } else {
        NUMERIC.forEach(function () { tr.appendChild(h('td', { class: 'ta-muted', text: '—' })); });
      }
      if (diamond) {
        var dl = diamondOf(test, team, state.split);
        var cell = h('td', { class: dl ? 'ta-strong' : 'ta-muted', text: dl ? A.pts(dl) : '—' });
        if (dl && pct(dl) !== null) cell.appendChild(h('span', { class: 'ta-small pct', text: ' ' + pct(dl) + '%' }));
        tr.appendChild(cell);
      }
      if (opt.dlpos) {
        var dp = diamondPos(test, team);
        tr.appendChild(h('td', { class: dp ? null : 'ta-muted', text: dp ? dp.text : '—' }));
      }
      tr.appendChild(h('td', { text: A.formatDate(test.finishedAt || test.createdAt) }));
      body.appendChild(tr);
    });
  }

  function markActive(selector, attribute, current) {
    var buttons = document.querySelectorAll(selector);
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].getAttribute(attribute) === current;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }

  function renderTeams(team) {
    var box = document.getElementById('teams');
    box.textContent = '';
    teams().forEach(function (option) {
      box.appendChild(h('button', { type: 'button', role: 'tab', 'data-team': option.key, text: option.label,
        onclick: function () { state.team = option.key; render(); } }));
    });
    markActive('#teams button', 'data-team', team.key);
    document.getElementById('team-note').textContent = team.key === 'all' ? ''
      : 'The table shows the run of ' + (team.clubName || team.label) + ' in every test.';
  }

  function renderCats() {
    var hasDiamond = state.board.tests.some(function (test) { return categoryOf(test) === 'diamond'; });
    var box = document.getElementById('cats');
    box.hidden = !hasDiamond;
    if (!hasDiamond) { state.cat = 'general'; return; }
    box.textContent = '';
    CATEGORIES.forEach(function (cat) {
      box.appendChild(h('button', { type: 'button', role: 'tab', 'data-cat': cat.key, text: cat.label,
        onclick: function () { if (state.cat !== cat.key) { state.cat = cat.key; state.team = 'all'; render(); } } }));
    });
    markActive('#cats button', 'data-cat', state.cat);
  }

  function renderFormationsToggle() {
    var tests = catTests();
    var some = tests.some(function (test) { return test.formationOnly === true; });
    var all = tests.every(function (test) { return test.formationOnly === true; });
    var useful = some && !all;
    document.getElementById('formations-wrap').hidden = !useful;
    if (!useful) state.formationsOnly = false;
    document.getElementById('formations-only').checked = state.formationsOnly;
  }

  function render() {
    renderCats();
    var team = currentTeam();
    state.team = team.key;
    renderFormationsToggle();
    renderSummary();
    renderCards();
    renderTeams(team);
    var clubs = hasClubs();
    var opt = optionalColumns(team);
    if ((state.sortKey === 'lpos' && !opt.lpos) || (state.sortKey === 'dlpos' && !opt.dlpos) || (state.sortKey === 'dl' && !opt.dl)) {
      state.sortKey = 'pts';
      state.sortDesc = true;
    }
    renderHead(clubs, team);
    renderRows(team, clubs);
    markActive('#tabs button', 'data-split', state.split);
    writeAddress();
  }

  function setupFilter() {
    var labels = {};
    state.board.tests.forEach(function (test) {
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
  document.getElementById('formations-only').addEventListener('change', function (event) {
    state.formationsOnly = event.target.checked;
    if (state.board) render();
  });

  readAddress();
  A.loadJson('data/index.json').then(function (board) {
    state.board = board && typeof board === 'object' ? board : { tests: [] };
    if (!Array.isArray(state.board.tests)) state.board.tests = [];
    state.board.tests = state.board.tests.filter(function (test) { return test && typeof test === 'object'; });
    if (!Array.isArray(state.board.referenceClubs)) state.board.referenceClubs = [];
    if (state.board.generatedAt) {
      document.getElementById('generated').textContent = 'Updated ' + A.formatDate(state.board.generatedAt, true) + '.';
    }
    setupFilter();
    render();
  }).catch(function (error) {
    if (/HTTP 404/.test(error.message)) {
      // Nothing published yet: an empty leaderboard, not an error.
      state.board = { tests: [], referenceClubs: [] };
      render();
      return;
    }
    var box = document.getElementById('error');
    box.textContent = 'The leaderboard could not be loaded (' + error.message + ').';
    box.hidden = false;
    document.getElementById('summary').textContent = '';
    document.getElementById('rows').textContent = '';
  });
})();
