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
    { key: 'diamond', value: 'DIAMOND', label: 'Diamond League clubs' },
    { key: 'club', value: 'CLUB', label: 'Club' }
  ];
  /** General tests: the average of the three reference clubs, then each club type. */
  var GENERAL_TEAMS = [
    { key: 'all', label: 'All reference clubs', best: 'Best overall' },
    { key: 'top', tier: 'TOP', label: 'Top club', best: 'Best for a top club' },
    { key: 'mid', tier: 'MID', label: 'Mid-table club', best: 'Best for a mid-table club' },
    { key: 'bottom', tier: 'BOTTOM', label: 'Bottom club', best: 'Best for a bottom club' }
  ];
  /** The tactic settings of a test (`settings` in data/index.json) with their defaults. */
  var SETTINGS = [
    { key: 'tactic', label: 'Formation', def: '442' },
    { key: 'mentality', label: 'Mentality', def: 'Balanced' },
    { key: 'inPossession', label: 'Possession', def: 'Standard' },
    { key: 'passingType', label: 'Passing', def: 'Normal' },
    { key: 'tempo', label: 'Tempo', def: 'Standard' },
    { key: 'timeWasting', label: 'Time wasting', def: 'Sometimes' },
    { key: 'defensiveLine', label: 'Def line', def: 'Standard' },
    { key: 'pressing', label: 'Pressing', def: 'Normal' },
    { key: 'width', label: 'Width', def: 'Balanced' },
    { key: 'dribbling', label: 'Dribbling', def: 'Standard' },
    { key: 'foulFrequency', label: 'Foul freq', def: 'Normal' },
    { key: 'foulHardness', label: 'Foul hardness', def: 'Medium' },
    { key: 'tempoFragmentation', label: 'Fragmentation', def: 'Normal' },
    { key: 'widePlay', label: 'Wide play', def: 'Shoot' },
    { key: 'transition', label: 'Transition', def: 'Balanced' },
    { key: 'recovery', label: 'Recovery', def: 'Standard' }
  ];
  var ENGINES = { classic: 'Classic', '2d': '2D' };
  var ENGINE_TITLE = "2D engine for the tested club's matches, classic engine for the rest";

  var state = {
    board: null, cat: 'general', split: 'overall', team: 'all', club: '', formationsOnly: false,
    sortKey: 'pts', sortDesc: true, engine: '', cols: 'results', filters: {}
  };

  function categoryOf(test) {
    var value = String(test.category || 'GENERAL').toUpperCase();
    return value === 'DIAMOND' ? 'diamond' : (value === 'CLUB' ? 'club' : 'general');
  }
  function catTests() { return state.board.tests.filter(function (test) { return categoryOf(test) === state.cat; }); }

  /** "classic" / "2d" / "" from the test's engine. */
  function engineOf(test) {
    var value = String(test && test.engine || '').toLowerCase();
    if (value === 'classic') return 'classic';
    if (value.indexOf('2d') === 0) return '2d';
    return '';
  }

  function settingsOf(test) {
    var given = test.settings && typeof test.settings === 'object' ? test.settings : {};
    var out = {};
    SETTINGS.forEach(function (s) {
      var v = given[s.key];
      if (v === null || v === undefined || v === '') v = s.key === 'tactic' && test.formation ? test.formation : s.def;
      out[s.key] = String(v);
    });
    return out;
  }

  function settingText(s, value) { return s.key === 'tactic' ? A.formationLabel(value) : value; }

  function uploaded(test) {
    var d = A.parseDate(test.finishedAt) || A.parseDate(test.createdAt);
    return d ? d.getTime() : 0;
  }

  function newestFirst(tests) { return tests.slice().sort(function (a, b) { return uploaded(b) - uploaded(a); }); }

  function predText(club) {
    var pred = club ? A.placeText(club.predictedPosition, club.leagueSize) : null;
    return pred ? ' (pred. ' + pred + ')' : '';
  }

  /* ---------- club category ---------- */

  /** The clubs that have CLUB tests: most tests first; label "Name · 3 / 20". */
  function clubs() {
    var byId = {};
    var order = [];
    newestFirst(state.board.tests.filter(function (t) { return categoryOf(t) === 'club'; })).forEach(function (test) {
      var id = test.teamId === null || test.teamId === undefined ? 'n:' + (test.teamName || '') : String(test.teamId);
      if (!byId[id]) {
        var pred = A.placeText(test.predictedPosition, test.leagueSize);
        byId[id] = { id: id, name: A.show(test.teamName), count: 0,
          label: A.show(test.teamName) + (pred ? ' · ' + pred : ''), league: test.leagueName };
        order.push(byId[id]);
      }
      byId[id].count++;
    });
    return order.sort(function (a, b) { return b.count - a.count; });
  }

  function clubIdOf(test) {
    return test.teamId === null || test.teamId === undefined ? 'n:' + (test.teamName || '') : String(test.teamId);
  }

  function currentClub() {
    var all = clubs();
    return all.filter(function (c) { return c.id === state.club; })[0] || all[0] || null;
  }

  /** Tests of the category (and, for Club, of the chosen club). */
  function scopeTests() {
    var tests = catTests();
    if (state.cat !== 'club') return tests;
    var club = currentClub();
    return club ? tests.filter(function (t) { return clubIdOf(t) === club.id; }) : [];
  }

  /** The tests whose values feed the setting filters: the scope after the engine choice. */
  function baseTests() {
    return scopeTests().filter(function (test) { return !state.engine || engineOf(test) === state.engine; });
  }

  /** The "Team" choices of the current category. */
  function teams() {
    if (state.cat === 'club') {
      var club = currentClub();
      return [{ key: 'all', label: club ? club.label : 'Club', clubName: club ? club.name : null,
        best: club ? 'Best for ' + club.name : 'Best overall' }];
    }
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

  /** Mean of the season places of a CLUB test: {text "4.3", sort, title "3 · 5 · 5"}. */
  function meanPlace(places, what) {
    var known = places.filter(function (p) { return A.isNum(p); });
    if (!known.length) return null;
    var mean = known.reduce(function (a, b) { return a + b; }, 0) / known.length;
    return { text: mean.toFixed(1), sort: mean,
      title: what + ' of the ' + places.length + ' seasons: ' + places.map(function (p) { return A.isNum(p) ? p : '—'; }).join(' · ') };
  }

  function seasons(test) { return (test.byClub || []).filter(function (c) { return c && typeof c === 'object'; }); }

  /** League place for the table: {text, sort, cls}; for "All reference clubs" the three places "1 · 11 · 17". */
  function leaguePos(test, team) {
    if (state.cat === 'club') {
      var mp = meanPlace(seasons(test).map(function (c) { return c.finalPosition; }), 'League places');
      if (!mp) return null;
      if (A.isNum(test.predictedPosition)) {
        if (mp.sort < test.predictedPosition) mp.cls = 'ta-pos';
        else if (mp.sort > test.predictedPosition) mp.cls = 'ta-neg';
        mp.title += ' (predicted ' + test.predictedPosition + ')';
      }
      return mp;
    }
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
    if (state.cat === 'club') {
      var list = seasons(test);
      if (!list.some(function (c) { return c.diamond && A.isNum(c.diamond.position); })) return null;
      return meanPlace(list.map(function (c) { return c.diamond ? c.diamond.position : null; }), 'Diamond League places');
    }
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

  function seasonsCount(test) {
    return A.isNum(test.repeats) ? test.repeats : (seasons(test).length || null);
  }

  function hasDiamond() {
    return scopeTests().some(function (test) {
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
    if (state.sortKey === 'seasons') return seasonsCount(test);
    var split = splitOf(test, team, state.split);
    if (!split) return null;
    if (state.sortKey === 'pts') return points(split, team);
    if (state.sortKey === 'ptspct') return pct(split);
    var v = split[state.sortKey];
    return A.isNum(v) ? v : null;
  }

  function activeFilters() {
    return SETTINGS.filter(function (s) { return state.filters[s.key] !== undefined && state.filters[s.key] !== ''; });
  }

  function visibleTests() {
    var filters = activeFilters();
    return baseTests().filter(function (test) {
      if (state.formationsOnly && test.formationOnly !== true) return false;
      if (filters.length) {
        var set = settingsOf(test);
        for (var i = 0; i < filters.length; i++) if (set[filters[i].key] !== state.filters[filters[i].key]) return false;
      }
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
    if (state.cat === 'club') return false; // the club is the selector itself
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
    var cat = params.get('cat');
    if (cat === 'diamond' || cat === 'club') state.cat = cat;
    var view = params.get('view');
    if (view && SPLITS.indexOf(view) >= 0) state.split = view;
    state.team = params.get('team') || 'all';
    state.club = params.get('club') || '';
    state.formationsOnly = params.get('formations') === '1';
    if (params.get('cols') === 'settings') state.cols = 'settings';
    var engine = params.get('engine');
    if (engine && ENGINES[engine]) state.engine = engine;
    SETTINGS.forEach(function (s) {
      var v = params.get('f_' + s.key);
      if (v) state.filters[s.key] = v;
    });
  }

  function writeAddress() {
    var params = new URLSearchParams(window.location.search);
    function put(name, value, fallback) { if (value !== fallback) params.set(name, value); else params.delete(name); }
    put('cat', state.cat, 'general');
    put('team', state.team, 'all');
    put('club', state.cat === 'club' ? state.club : '', '');
    put('view', state.split, 'overall');
    put('formations', state.formationsOnly ? '1' : '0', '0');
    put('cols', state.cols, 'results');
    put('engine', state.engine, '');
    SETTINGS.forEach(function (s) { put('f_' + s.key, state.filters[s.key] || '', ''); });
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
    if (state.cat === 'club') {
      var club = currentClub();
      note.textContent = 'PTS = average league points per season / maximum possible, over the repeated first seasons of ' +
        (club ? club.name : 'the club') + ' (column Seasons); League pos / DL pos = the average place, the single places in the tooltip.';
    } else if (state.cat === 'diamond') {
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
      var card = h('div', { class: 'best-card' + (state.team === team.key && state.cat !== 'club' ? ' active' : ''),
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
      onclick: function () { state.sortKey = 'dl'; state.sortDesc = true; state.cols = 'results'; render(); } },
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
    var tests = scopeTests();
    return {
      lpos: tests.some(function (t) { return leaguePos(t, team) !== null; }),
      dl: hasDiamond(),
      dlpos: tests.some(function (t) { return diamondPos(t, team) !== null; })
    };
  }

  function dash() { return h('td', { class: 'ta-muted', text: '—' }); }

  function nameCell(test, url) {
    var thread = h('td', { class: 'ta-left ta-thread' },
      h('a', { href: url, text: A.show(test.name), onclick: function (event) { event.stopPropagation(); } }));
    if (test.status && test.status !== 'DONE') thread.appendChild(h('span', { class: 'ta-status ' + test.status, text: test.status }));
    return thread;
  }

  function engineCell(test) {
    var kind = engineOf(test);
    return h('td', { class: 'ta-left' + (kind ? ' eng eng-' + kind : ' ta-muted'), title: ENGINE_TITLE,
      text: ENGINES[kind] || A.show(test.engine) });
  }

  function lposCell(test, team) {
    var lp = leaguePos(test, team);
    return h('td', { class: lp ? lp.cls : 'ta-muted', title: lp ? lp.title : null, text: lp ? lp.text : '—' });
  }

  function dlposCell(test, team) {
    var dp = diamondPos(test, team);
    return h('td', { class: dp ? null : 'ta-muted', title: dp ? dp.title : null, text: dp ? dp.text : '—' });
  }

  /** The columns of the current view: {key (sort key or null), label, left, title, filter (setting), cell(test, rank)}. */
  function columns(team) {
    var opt = optionalColumns(team);
    var club = state.cat === 'club';
    var cols = [];
    var nameCol = { label: 'Thread', left: true, cell: function (t, r, url) { return nameCell(t, url); } };
    var engineCol = { label: 'Engine', left: true, title: ENGINE_TITLE, cell: engineCell };
    var lposCol = { key: 'lpos', label: 'League pos', cell: function (t) { return lposCell(t, team); } };
    if (state.cols === 'settings') {
      cols.push({ label: '#', cell: function (t, rank) { return h('td', { class: 'ta-muted', text: String(rank) }); } });
      cols.push(nameCol, engineCol);
      SETTINGS.forEach(function (s) {
        cols.push({ label: s.label, left: true, filter: s, cell: function (t) {
          var v = settingsOf(t)[s.key];
          var isDefault = v === s.def;
          return h('td', { class: 'ta-left ' + (isDefault ? 'set-def' : 'set-on'), title: isDefault ? 'Default' : 'Default: ' + settingText(s, s.def),
            text: settingText(s, v) });
        } });
      });
      cols.push({ key: 'ptspct', label: 'Pts %', title: 'Share of the maximum league points', cell: function (t) {
        var p = pct(splitOf(t, team, state.split));
        return p === null ? dash() : h('td', { class: 'ta-strong', text: p.toFixed(1) });
      } });
      cols.push({ key: 'gd', label: 'GD', cell: function (t) {
        var s = splitOf(t, team, state.split);
        return s ? h('td', { class: A.signClass(s.gd), text: A.signed(s.gd) }) : dash();
      } });
      if (club && opt.lpos) cols.push(lposCol);
      return cols;
    }
    var clubsCols = hasClubs();
    cols.push(nameCol, engineCol);
    cols.push({ label: 'Formation', left: true, cell: function (t) { return h('td', { class: 'ta-left', text: A.formationLabel(t.formation) }); } });
    cols.push({ label: 'Owner', left: true, cell: function (t) { return h('td', { class: 'ta-left', text: A.show(t.owner) }); } });
    if (clubsCols) {
      cols.push({ label: 'Club', left: true, cell: function (t) { return h('td', { class: 'ta-left' }, A.show(t.teamName), prediction(t)); } });
      cols.push({ label: 'League', left: true, cell: function (t) { return h('td', { class: 'ta-left', text: A.show(t.leagueName) }); } });
    }
    if (club) {
      cols.push({ key: 'seasons', label: 'Seasons', title: 'Season runs averaged', cell: function (t) { return h('td', { text: A.show(seasonsCount(t)) }); } });
    }
    if (opt.lpos) cols.push(lposCol);
    NUMERIC.forEach(function (n) {
      cols.push({ key: n.key, label: n.label, cell: function (t) {
        var s = splitOf(t, team, state.split);
        if (!s) return dash();
        if (n.key === 'pts') return ptsCell(s);
        if (n.key === 'gd' || n.key === 'xgd') return h('td', { class: A.signClass(s[n.key]), text: A.signed(s[n.key]) });
        return h('td', { text: A.show(s[n.key]) });
      } });
    });
    if (opt.dl) {
      cols.push({ key: 'dl', label: 'Diamond League', cell: function (t) {
        var dl = diamondOf(t, team, state.split);
        var cell = h('td', { class: dl ? 'ta-strong' : 'ta-muted', text: dl ? A.pts(dl) : '—' });
        if (dl && pct(dl) !== null) cell.appendChild(h('span', { class: 'ta-small pct', text: ' ' + pct(dl) + '%' }));
        return cell;
      } });
    }
    if (opt.dlpos) cols.push({ key: 'dlpos', label: 'DL pos', cell: function (t) { return dlposCell(t, team); } });
    cols.push({ key: 'uploaded', label: 'Uploaded', cell: function (t) { return h('td', { text: A.formatDate(t.finishedAt || t.createdAt) }); } });
    return cols;
  }

  /** The values a setting takes in the rows of the current category (after the engine / club choice). */
  function filterValues(s) {
    var seen = {};
    baseTests().forEach(function (t) { seen[settingsOf(t)[s.key]] = true; });
    var current = state.filters[s.key];
    if (current) seen[current] = true;
    return Object.keys(seen).sort(function (a, b) {
      if (a === s.def) return -1;
      if (b === s.def) return 1;
      return a.localeCompare(b);
    });
  }

  function renderHead(cols) {
    var head = document.getElementById('head');
    head.textContent = '';
    var row = h('tr');
    cols.forEach(function (column) {
      row.appendChild(h('th', {
        class: (column.left ? 'ta-left' : '') + (column.key ? ' sortable' + (state.sortKey === column.key ? ' sorted' : '') : ''),
        title: column.title || null,
        text: column.label + (column.key ? arrow(column.key) : ''),
        onclick: column.key ? function () { sortBy(column.key); } : null
      }));
    });
    head.appendChild(row);
    if (state.cols !== 'settings') return;
    var filters = h('tr', { class: 'filter-row' });
    cols.forEach(function (column) {
      var s = column.filter;
      if (!s) { filters.appendChild(h('th')); return; }
      var select = h('select', { class: 'ta-select ta-select-sm' + (state.filters[s.key] ? ' on' : ''), 'aria-label': 'Filter: ' + s.label,
        onchange: function (event) { setFilter(s.key, event.target.value); } },
        h('option', { value: '', text: 'Any' }));
      filterValues(s).forEach(function (v) {
        select.appendChild(h('option', { value: v, text: settingText(s, v) + (v === s.def ? ' (default)' : ''),
          selected: state.filters[s.key] === v }));
      });
      filters.appendChild(h('th', { class: 'ta-left' }, select));
    });
    head.appendChild(filters);
  }

  function setFilter(key, value) {
    if (value) state.filters[key] = value; else delete state.filters[key];
    render();
  }

  function renderChips() {
    var box = document.getElementById('filter-chips');
    box.textContent = '';
    var active = activeFilters();
    box.hidden = !active.length;
    if (!active.length) return;
    box.appendChild(h('span', { class: 'ta-filter', text: 'Filters' }));
    active.forEach(function (s) {
      box.appendChild(h('button', { type: 'button', class: 'filter-chip', title: 'Remove this filter',
        onclick: function () { setFilter(s.key, ''); } },
        s.label + ': ' + settingText(s, state.filters[s.key]) + ' ', h('span', { 'aria-hidden': 'true', text: '×' })));
    });
    box.appendChild(h('button', { type: 'button', class: 'ta-link-btn', text: 'Clear all',
      onclick: function () { state.filters = {}; render(); } }));
  }

  function renderRows(team, cols) {
    var body = document.getElementById('rows');
    body.textContent = '';
    var tests = sortedTests(team);
    if (!tests.length) {
      body.appendChild(h('tr', null, h('td', { class: 'ta-left ta-muted', colspan: cols.length,
        text: catTests().length ? 'No test matches this filter.' : 'No tests yet.' })));
      return;
    }
    tests.forEach(function (test, i) {
      var url = A.testUrl(test.key);
      var tr = h('tr', { class: 'ta-link-row', onclick: function () { window.location.href = url; } });
      cols.forEach(function (column) { tr.appendChild(column.cell(test, i + 1, url)); });
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
    if (state.cat === 'club') {
      document.getElementById('team-label').textContent = 'Club';
      clubs().forEach(function (club) {
        box.appendChild(h('button', { type: 'button', role: 'tab', 'data-club': club.id, text: club.label,
          title: (club.league ? club.league + ' · ' : '') + 'media prediction · ' + club.count + ' test(s)',
          onclick: function () { state.club = club.id; render(); } }));
      });
      markActive('#teams button', 'data-club', state.club);
      document.getElementById('team-note').textContent = 'Every row: the first season of this club repeated N times (column Seasons), figures averaged.';
      return;
    }
    document.getElementById('team-label').textContent = 'Team';
    teams().forEach(function (option) {
      box.appendChild(h('button', { type: 'button', role: 'tab', 'data-team': option.key, text: option.label,
        onclick: function () { state.team = option.key; render(); } }));
    });
    markActive('#teams button', 'data-team', team.key);
    document.getElementById('team-note').textContent = team.key === 'all' ? ''
      : 'The table shows the run of ' + (team.clubName || team.label) + ' in every test.';
  }

  function renderCats() {
    var present = {};
    state.board.tests.forEach(function (test) { present[categoryOf(test)] = true; });
    var shown = CATEGORIES.filter(function (cat) { return cat.key === 'general' || present[cat.key]; });
    if (!present[state.cat]) state.cat = 'general';
    var box = document.getElementById('cats');
    box.hidden = shown.length < 2;
    box.textContent = '';
    shown.forEach(function (cat) {
      box.appendChild(h('button', { type: 'button', role: 'tab', 'data-cat': cat.key, text: cat.label,
        onclick: function () {
          if (state.cat !== cat.key) { state.cat = cat.key; state.team = 'all'; state.filters = {}; render(); }
        } }));
    });
    markActive('#cats button', 'data-cat', state.cat);
  }

  function renderFormationsToggle() {
    var tests = scopeTests();
    var some = tests.some(function (test) { return test.formationOnly === true; });
    var all = tests.every(function (test) { return test.formationOnly === true; });
    var useful = some && !all;
    document.getElementById('formations-wrap').hidden = !useful;
    if (!useful) state.formationsOnly = false;
    document.getElementById('formations-only').checked = state.formationsOnly;
  }

  function render() {
    renderCats();
    if (state.cat === 'club') {
      var club = currentClub();
      state.club = club ? club.id : '';
    }
    var team = currentTeam();
    state.team = team.key;
    renderFormationsToggle();
    renderSummary();
    renderCards();
    renderTeams(team);
    document.getElementById('engine-filter').value = state.engine;
    var cols = columns(team);
    var keys = cols.map(function (c) { return c.key; }).filter(Boolean);
    if (keys.indexOf(state.sortKey) < 0) {
      // The sorted column is not in this view: PTS and Pts % stand for each other, anything else goes back to points.
      var alias = state.sortKey === 'pts' || state.sortKey === 'ptspct';
      if (!alias) state.sortDesc = true;
      state.sortKey = keys.indexOf('pts') >= 0 ? 'pts' : 'ptspct';
    }
    renderChips();
    renderHead(cols);
    renderRows(team, cols);
    markActive('#tabs button', 'data-split', state.split);
    markActive('#cols button', 'data-cols', state.cols);
    writeAddress();
  }

  document.getElementById('tabs').addEventListener('click', function (event) {
    var split = event.target && event.target.getAttribute && event.target.getAttribute('data-split');
    if (split && state.board) { state.split = split; render(); }
  });
  document.getElementById('cols').addEventListener('click', function (event) {
    var cols = event.target && event.target.getAttribute && event.target.getAttribute('data-cols');
    if (cols && state.board && cols !== state.cols) { state.cols = cols; render(); }
  });
  document.getElementById('formations-only').addEventListener('change', function (event) {
    state.formationsOnly = event.target.checked;
    if (state.board) render();
  });
  document.getElementById('engine-filter').addEventListener('change', function (event) {
    state.engine = ENGINES[event.target.value] ? event.target.value : '';
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
