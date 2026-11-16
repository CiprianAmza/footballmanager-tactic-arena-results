/*
 * Test page: results block of the reference clubs, the chosen club's run apart, then for
 * every run the tactic, the full schedule and the competition overview. Saved screenshots
 * are shown when the test has them; otherwise the panel is drawn from the data.
 */
(function () {
  'use strict';
  var A = window.Arena;
  var h = A.h;

  var RUN_KIND_LABELS = {
    CHOSEN: 'Chosen club',
    REFERENCE: 'Reference',
    REFERENCE_TOP: 'Reference · highest reputation',
    REFERENCE_MEDIAN: 'Reference · median reputation',
    REFERENCE_BOTTOM: 'Reference · lowest reputation'
  };
  var KINDS = [
    { key: 'tactic', label: 'Tactic' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'competitions', label: 'Competition overview' }
  ];
  var INSTRUCTIONS = [
    ['mentality', 'Mentality'], ['inPossession', 'In possession'], ['passingType', 'Passing'],
    ['tempo', 'Tempo'], ['timeWasting', 'Time wasting'], ['defensiveLine', 'Defensive line'],
    ['pressing', 'Pressing'], ['width', 'Width'], ['dribbling', 'Dribbling'],
    ['foulFrequency', 'Foul frequency'], ['foulHardness', 'Foul hardness'],
    ['tempoFragmentation', 'Tempo fragmentation'], ['widePlay', 'Wide play'],
    ['transition', 'Transition'], ['recovery', 'Recovery']
  ];

  var page = document.getElementById('page');

  function list(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  function fail(message) {
    page.textContent = '';
    page.appendChild(h('div', { class: 'ta-head' }, h('div', null,
      h('span', { class: 'ta-eyebrow', text: 'Tactic Arena' }), h('h1', { text: 'Test not found' })),
      h('div', { class: 'ta-actions' }, h('a', { class: 'ta-btn', href: 'index.html', text: 'Leaderboard' }))));
    page.appendChild(h('p', { class: 'ta-error', text: message }));
  }

  /** Only plain colour names and hex values reach the style attribute. */
  function color(value, fallback) {
    var text = typeof value === 'string' ? value.trim() : '';
    if (/^#[0-9a-f]{3,8}$/i.test(text) || /^[a-z]{3,20}$/i.test(text)) return text;
    if (/^[0-9a-f]{6}$/i.test(text)) return '#' + text;
    return fallback;
  }

  /* ---------- tactic ---------- */

  function tacticPanel(run, result) {
    var tactic = obj(result.tactic);
    var squad = {};
    list(result.squad).forEach(function (player) { if (player && player.id !== undefined) squad[player.id] = player; });
    var slots = list(tactic.formationDataList).filter(function (slot) { return slot && A.isNum(slot.positionIndex); });
    var starters = slots.filter(function (slot) { return slot.positionIndex < 30; })
      .sort(function (a, b) { return a.positionIndex - b.positionIndex; });
    var bench = slots.filter(function (slot) { return slot.positionIndex >= 30; })
      .sort(function (a, b) { return a.positionIndex - b.positionIndex; });
    var c1 = color(result.color1, '#c0392b');
    var c2 = color(result.color2, '#ffffff');

    function playerName(id) {
      var player = squad[id];
      return player && player.name ? player.name : (id === null || id === undefined ? '—' : 'Player ' + id);
    }
    function roleText(slot) {
      return [slot.role, slot.duty].filter(Boolean).join(' · ');
    }

    var grid = h('div', { class: 'pitch-grid' });
    starters.forEach(function (slot) {
      var index = slot.positionIndex;
      var player = squad[slot.playerId] || {};
      var label = player.position || '';
      grid.appendChild(h('div', {
        class: 'pitch-slot',
        style: 'grid-row:' + (Math.floor(index / 5) + 1) + ';grid-column:' + (index % 5 + 1),
        title: playerName(slot.playerId) + (roleText(slot) ? ' — ' + roleText(slot) : '')
      },
        h('div', { class: 'shirt', style: '--c1:' + c1 + ';--c2:' + c2, text: label }),
        h('div', { class: 'slot-name', text: playerName(slot.playerId) }),
        roleText(slot) ? h('div', { class: 'slot-role', text: roleText(slot) }) : null));
    });
    var pitch = h('div', { class: 'pitch', role: 'img', 'aria-label': 'Starting eleven on the pitch' },
      h('div', { class: 'pitch-line pitch-half' }), h('div', { class: 'pitch-line pitch-circle' }),
      h('div', { class: 'pitch-line pitch-box-top' }), h('div', { class: 'pitch-line pitch-box-bottom' }), grid);

    var side = h('div');
    var kv = h('dl', { class: 'kv' });
    kv.appendChild(h('dt', { text: 'Formation' }));
    kv.appendChild(h('dd', { text: A.formationLabel(tactic.tactic) }));
    INSTRUCTIONS.forEach(function (pair) {
      kv.appendChild(h('dt', { text: pair[1] }));
      kv.appendChild(h('dd', { text: tactic[pair[0]] ? String(tactic[pair[0]]) : 'Default' }));
    });
    side.appendChild(h('p', { class: 'ta-subhead', text: 'Team instructions' }));
    side.appendChild(kv);

    var takers = [['Penalties', 'penaltyTakerId'], ['Free kicks', 'freeKickTakerId'],
      ['Corners (left)', 'cornerTakerLeftId'], ['Corners (right)', 'cornerTakerRightId']]
      .filter(function (pair) { return tactic[pair[1]] !== null && tactic[pair[1]] !== undefined; });
    if (takers.length) {
      var setPieces = h('dl', { class: 'kv' });
      takers.forEach(function (pair) {
        setPieces.appendChild(h('dt', { text: pair[0] }));
        setPieces.appendChild(h('dd', { text: playerName(tactic[pair[1]]) }));
      });
      side.appendChild(h('p', { class: 'ta-subhead', text: 'Set pieces' }));
      side.appendChild(setPieces);
    }

    var eleven = h('tbody');
    starters.forEach(function (slot) {
      var player = squad[slot.playerId] || {};
      var extra = list(slot.instructions).join(', ');
      if (slot.specialRole) extra = (extra ? extra + ', ' : '') + slot.specialRole;
      eleven.appendChild(h('tr', null,
        h('td', { class: 'ta-left', text: A.show(player.position) }),
        h('td', { class: 'ta-left ta-strong', text: playerName(slot.playerId) }),
        h('td', { class: 'ta-left', text: A.show(slot.role || 'Default') }),
        h('td', { class: 'ta-left', text: A.show(slot.duty || 'Default') }),
        h('td', { class: 'ta-left', text: extra || '—' })));
    });
    side.appendChild(h('p', { class: 'ta-subhead', text: 'Starting eleven' }));
    side.appendChild(h('div', { class: 'ta-scroll' }, h('table', { class: 'ta-table' },
      h('thead', null, h('tr', null, ['Pos', 'Player', 'Role', 'Duty', 'Instructions'].map(function (label) {
        return h('th', { class: 'ta-left', text: label });
      }))), eleven)));
    if (bench.length) {
      side.appendChild(h('p', { class: 'ta-subhead', style: 'margin-top:14px', text: 'Bench' }));
      side.appendChild(h('p', { class: 'ta-small', text: bench.map(function (slot) {
        var player = squad[slot.playerId] || {};
        return playerName(slot.playerId) + (player.position ? ' (' + player.position + ')' : '');
      }).join(' · ') }));
    }

    return h('div', { class: 'ta-panel' },
      h('div', { class: 'ta-panel-head' }, h('h3', { text: 'TACTIC' }),
        h('span', { class: 'ta-panel-meta', text: A.show(result.teamName || run.teamName) + ' · ' + A.formationLabel(tactic.tactic) })),
      h('div', { class: 'tactic-layout' }, pitch, side));
  }

  /* ---------- schedule ---------- */

  function isPlayed(match) { return !!match.resultOutcome && match.resultOutcome !== 'Pending'; }

  function decidedNote(match) {
    var parts = [];
    if (match.penaltyTeam1Score != null && match.penaltyTeam2Score != null) {
      parts.push('pens ' + match.penaltyTeam1Score + '-' + match.penaltyTeam2Score);
    } else if (match.decidedBy && ['NORMAL', 'REGULAR', 'FRIENDLY'].indexOf(match.decidedBy) < 0) {
      parts.push(String(match.decidedBy).toLowerCase().replace(/_/g, ' '));
    }
    if (match.aggregateTeam1Score != null && match.aggregateTeam2Score != null) {
      parts.push('agg ' + match.aggregateTeam1Score + '-' + match.aggregateTeam2Score);
    }
    return parts.join(' · ');
  }

  function xg(value) { return A.isNum(value) ? value.toFixed(2) : null; }

  function schedulePanel(run, result) {
    var matches = list(result.matches).filter(function (m) { return m && typeof m === 'object'; });
    var count = { W: 0, D: 0, L: 0 };
    var beforeRun = 0;
    var body = h('tbody');
    matches.forEach(function (m) {
      if (count[m.resultOutcome] !== undefined) count[m.resultOutcome]++;
      if (m.inRun === false) beforeRun++;
      var type = m.competitionType === 'Cup' ? ' cup' : (m.competitionType === 'European' ? ' european' : '');
      var venue = m.homeOrAway === 'H' ? ' home' : (m.homeOrAway === 'A' ? ' away' : '');
      var note = decidedNote(m);
      var xgFor = xg(m.xgFor), xgAgainst = xg(m.xgAgainst);
      body.appendChild(h('tr', { class: m.inRun === false ? 'before-run' : null },
        h('td', { class: 'ta-left', text: m.date || (m.day !== undefined ? 'Day ' + m.day : '—') }),
        h('td', { class: 'ta-left' },
          h('span', { class: 'cal-badge' + type, text: String(m.competitionName || '').slice(0, 3).toUpperCase() || '—' }),
          A.show(m.competitionName)),
        h('td', { class: 'ta-left', text: m.roundLabel || (m.roundNumber !== undefined ? 'Round ' + m.roundNumber : '—') }),
        h('td', { class: 'ta-left' }, h('span', { class: 'venue' + venue,
          text: (m.homeTeamAbbr || 'TBD') + ' v ' + (m.awayTeamAbbr || 'TBD') })),
        h('td', { class: 'ta-left', text: m.opponentTeam || 'TBD' }),
        h('td', { class: 'ta-left' },
          isPlayed(m) ? h('span', { class: 'score ' + m.resultOutcome, text: m.resultOutcome + ' ' + A.show(m.score) })
            : h('span', { class: 'ta-muted', text: '—' }),
          note ? h('span', { class: 'decided', text: note }) : null),
        h('td', { class: 'ta-small', text: xgFor !== null ? xgFor + ' – ' + (xgAgainst !== null ? xgAgainst : '—') : '—' })));
    });
    if (!matches.length) {
      body.appendChild(h('tr', null, h('td', { class: 'ta-left ta-muted', colspan: 7, text: 'No matches recorded.' })));
    }
    var played = matches.filter(isPlayed).length;
    var panel = h('div', { class: 'ta-panel' },
      h('div', { class: 'ta-panel-head' }, h('h3', { text: 'FIXTURES & RESULTS' }),
        h('span', { class: 'ta-panel-meta', text: A.show(result.teamName || run.teamName) + ' · Season ' + A.show(result.season) +
          ' · ' + played + ' matches · ' + count.W + 'W ' + count.D + 'D ' + count.L + 'L' })),
      h('div', { class: 'ta-scroll' }, h('table', { class: 'ta-table' },
        h('thead', null, h('tr', null, ['Date', 'Competition', 'Stage', 'Match', 'Opponent', 'Result', 'xG'].map(function (label) {
          return h('th', { class: 'ta-left', text: label });
        }))), body)));
    if (beforeRun > 0) {
      panel.appendChild(h('p', { class: 'ta-panel-foot', text: 'Dimmed rows were already played before the test started and are not part of the run.' }));
    }
    return panel;
  }

  /* ---------- competition overview ---------- */

  function isLeague(comp) { return comp.kind === 'LEAGUE' || comp.typeId === 1 || comp.typeId === 3; }

  function compColor(comp) {
    switch (comp.typeId) {
      case 1: return '#38003c';
      case 2: return '#e74c3c';
      case 3: return '#2c3e50';
      case 4: return '#2e3192';
      case 5: return '#009460';
      default: return '#34495e';
    }
  }

  function num(value) { var n = Number(value); return isFinite(n) ? n : 0; }

  function competitionsPanel(run, result) {
    var comps = list(result.competitions).filter(function (c) { return c && typeof c === 'object'; })
      .slice().sort(function (a, b) { return Number(isLeague(b)) - Number(isLeague(a)); });
    var table = list(result.leagueTable).filter(function (r) { return r && typeof r === 'object'; });
    var trophies = comps.filter(function (c) { return c.trophy === true; }).map(function (c) { return c.name || c.competitionName; });

    var grid = h('div', { class: 'comp-grid' });
    comps.forEach(function (comp) {
      var name = comp.name || comp.competitionName || '—';
      var body = h('div', { class: 'comp-body' });
      if (isLeague(comp)) {
        var total = comp.totalTeams || table.length;
        body.appendChild(h('div', { class: 'comp-stats' },
          h('div', null, h('span', { class: 'comp-label', text: 'POSITION' }),
            h('div', { class: 'comp-value' }, A.show(comp.position), total ? h('small', { text: '/' + total }) : null)),
          h('div', { style: 'text-align:right' }, h('span', { class: 'comp-label', text: 'POINTS' }),
            h('div', { class: 'comp-value', text: A.show(comp.points) }))));
        body.appendChild(h('div', { class: 'comp-row' }, h('span', { text: 'RECORD' }),
          h('strong', { text: num(comp.wins) + 'W ' + num(comp.draws) + 'D ' + num(comp.loses) + 'L' }),
          h('small', { text: 'Goals ' + num(comp.goalsFor) + '–' + num(comp.goalsAgainst) + ' · ' + num(comp.games) + ' played' })));
      } else {
        body.appendChild(h('div', null, h('span', { class: 'comp-label', text: 'STAGE REACHED' }),
          h('div', { class: 'comp-value', style: 'font-size:1.15em',
            text: comp.stageReached || comp.statusLabel || comp.currentStage || '—' })));
        if (comp.entryStage) {
          body.appendChild(h('div', { class: 'comp-row' }, h('span', { text: 'ENTRY' }), h('strong', { text: comp.entryStage })));
        }
        var out = comp.status === 'ELIMINATED' || comp.status === 'RUNNER_UP';
        var outcome = comp.trophy ? 'Winner' : (comp.statusLabel || comp.status || '—');
        if (comp.eliminatedByTeamName && !comp.trophy) outcome += ' (by ' + comp.eliminatedByTeamName + ')';
        body.appendChild(h('div', { class: 'comp-row' + (out ? ' out' : '') }, h('span', { text: 'OUTCOME' }), h('strong', { text: outcome })));
      }
      grid.appendChild(h('article', { class: 'comp-card' },
        h('div', { class: 'comp-card-head', style: '--comp-color:' + compColor(comp) },
          h('div', { class: 'comp-logo', 'aria-hidden': 'true', text: String(name).slice(0, 1) }),
          h('h4', { text: name + (comp.trophy ? ' 🏆' : '') })),
        body));
    });
    if (!comps.length) grid.appendChild(h('p', { class: 'ta-muted', text: 'No competitions recorded.' }));

    var panel = h('div', { class: 'ta-panel' },
      h('div', { class: 'ta-panel-head' },
        h('div', null, h('h3', { text: 'COMPETITION OVERVIEW' }),
          h('span', { class: 'ta-panel-meta', text: A.show(result.teamName || run.teamName) + ' · Season ' + A.show(result.season) })),
        trophies.length ? h('span', { class: 'trophies', text: '🏆 ' + trophies.join(' · ') }) : null),
      grid);

    if (table.length) {
      var rows = table.slice().sort(function (a, b) {
        return (num(a.position) - num(b.position)) || (num(b.points) - num(a.points));
      });
      var body = h('tbody');
      rows.forEach(function (r, i) {
        var gd = num(r.goalsFor) - num(r.goalsAgainst);
        body.appendChild(h('tr', { class: r.teamId !== undefined && r.teamId === result.teamId ? 'human-team' : null },
          h('td', { text: A.show(r.position || i + 1) }),
          h('td', { class: 'ta-left', text: A.show(r.name || r.teamName) }),
          h('td', { text: A.show(r.games) }), h('td', { text: A.show(r.wins) }), h('td', { text: A.show(r.draws) }),
          h('td', { text: A.show(r.loses) }), h('td', { text: A.show(r.goalsFor) }), h('td', { text: A.show(r.goalsAgainst) }),
          h('td', { text: gd > 0 ? '+' + gd : String(gd) }),
          h('td', { class: 'ta-strong', text: A.show(r.points) })));
      });
      panel.appendChild(h('p', { class: 'ta-subhead', text: A.show(result.leagueName) + ' · final table' }));
      panel.appendChild(h('div', { class: 'ta-scroll' }, h('table', { class: 'ta-table' },
        h('thead', null, h('tr', null,
          h('th', { text: '#' }), h('th', { class: 'ta-left', text: 'Team' }),
          ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map(function (label) { return h('th', { text: label }); }))),
        body)));
    }
    return panel;
  }

  var PANELS = { tactic: tacticPanel, schedule: schedulePanel, competitions: competitionsPanel };

  /* ---------- page ---------- */

  function figure(run, kind, images) {
    var fig = h('figure', { class: 'ta-shot' });
    var src = images[kind.key];
    var alt = kind.label + ' · ' + A.show(run.teamName);
    if (src) {
      fig.appendChild(h('figcaption', { text: kind.label }));
      var img = h('img', { src: src, alt: alt, loading: 'lazy', onclick: function () { A.openLightbox(src, alt); } });
      img.addEventListener('error', function () {
        // A listed screenshot that cannot be loaded: draw the panel instead.
        fig.textContent = '';
        fig.appendChild(h('figcaption', { text: kind.label + ' · drawn from the data' }));
        fig.appendChild(safePanel(kind, run));
      });
      fig.appendChild(img);
    } else {
      fig.appendChild(h('figcaption', { text: kind.label + ' · drawn from the data' }));
      fig.appendChild(safePanel(kind, run));
    }
    return fig;
  }

  function safePanel(kind, run) {
    try {
      return PANELS[kind.key](run, obj(run.result));
    } catch (error) {
      console.error('Tactic Arena panel failed', error);
      return h('p', { class: 'ta-error', text: 'This panel could not be drawn (' + error.message + ').' });
    }
  }

  /** Everything about one run; built the first time its row is opened. */
  function runDetail(run, images) {
    var box = h('div');
    if (run.message) box.appendChild(h('p', { class: 'ta-error', text: run.message }));
    box.appendChild(A.resultsBlock(run.stats, 'Results · ' + A.show(run.teamName), 'Available when this run has finished.'));
    var hasResult = run.result && typeof run.result === 'object';
    if (hasResult || Object.keys(images).length) {
      var shots = h('div', { class: 'ta-shots' });
      KINDS.forEach(function (kind) {
        if (hasResult || images[kind.key]) shots.appendChild(figure(run, kind, images));
      });
      box.appendChild(shots);
    }
    return box;
  }

  /* ---------- clubs table ---------- */

  var KIND_ORDER = { CHOSEN: 0, REFERENCE_TOP: 1, REFERENCE_MEDIAN: 2, REFERENCE_BOTTOM: 3 };

  function leagueOf(run) {
    var comps = list(obj(run.result).competitions);
    for (var i = 0; i < comps.length; i++) {
      var comp = obj(comps[i]);
      if (isLeague(comp)) return comp;
    }
    return null;
  }

  function finish(run) {
    var league = leagueOf(run);
    if (!league || !A.isNum(league.position)) return null;
    var size = A.isNum(league.totalTeams) && league.totalTeams > 0 ? league.totalTeams : list(obj(run.result).leagueTable).length;
    return { position: league.position, size: size || null };
  }

  function cupsText(run) {
    return list(obj(run.result).competitions).map(obj).filter(function (comp) { return !isLeague(comp); })
      .map(function (comp) {
        var name = comp.name || comp.competitionName || 'Cup';
        return { name: name, text: comp.trophy ? '🏆 ' + name : (comp.stageReached || comp.statusLabel || comp.currentStage || '—') };
      });
  }

  /** Open runs from the address (#run=2 or #run=0,2). */
  function openFromHash() {
    var match = /(?:^#|&)run=([0-9,]+)/.exec(window.location.hash || '');
    return match ? match[1].split(',').filter(Boolean) : [];
  }

  function writeHash(open) {
    var keys = Object.keys(open).filter(function (k) { return open[k]; });
    var url = window.location.pathname + window.location.search + (keys.length ? '#run=' + keys.join(',') : '');
    try { history.replaceState(null, '', url); } catch (error) { /* file:// or sandbox: keep the page working */ }
  }

  function runsTable(test, runImages) {
    var runs = list(test.runs).filter(function (r) { return r && typeof r === 'object'; }).slice().sort(function (a, b) {
      var ka = KIND_ORDER[a.kind] !== undefined ? KIND_ORDER[a.kind] : 9;
      var kb = KIND_ORDER[b.kind] !== undefined ? KIND_ORDER[b.kind] : 9;
      return (ka - kb) || (num(a.index) - num(b.index));
    });
    var columns = ['Club', 'Role', 'Reputation', 'Media prediction', 'Finished', 'PLD', 'PTS', 'GD', 'GF', 'GA', 'xGF', 'xGA', 'xGD', 'Cups'];
    var optional = { GF: 1, GA: 1, xGF: 1, xGA: 1, Role: 1 };
    var wrap = h('div', { class: 'ta-table-wrap runs-wrap' });
    var table = h('table', { class: 'ta-table runs-table' }, h('thead', null, h('tr', null, columns.map(function (label, i) {
      return h('th', { class: (i < 2 || label === 'Cups' ? 'ta-left' : '') + (optional[label] ? ' opt' : ''), text: label });
    }))));
    wrap.appendChild(table);
    var open = {};
    var details = [];

    function fit() {
      details.forEach(function (inner) { inner.style.width = wrap.clientWidth + 'px'; });
    }
    window.addEventListener('resize', fit);

    runs.forEach(function (run, position) {
      var id = A.isNum(run.index) ? String(run.index) : 'p' + position;
      var images = A.isNum(run.index) ? (runImages[run.index] || {}) : {};
      var split = run.stats && obj(run.stats).overall ? obj(run.stats.overall) : null;
      var predicted = A.placeText(run.predictedPosition, run.leagueSize);
      var done = finish(run);
      var finishClass = null, finishTitle = null;
      if (done && A.isNum(run.predictedPosition)) {
        if (done.position < run.predictedPosition) { finishClass = 'ta-pos'; finishTitle = 'Better than predicted'; }
        else if (done.position > run.predictedPosition) { finishClass = 'ta-neg'; finishTitle = 'Worse than predicted'; }
      }
      var cups = cupsText(run);
      var detailId = 'run-detail-' + id;

      var club = h('td', { class: 'ta-left ta-strong' }, h('span', { class: 'run-arrow', 'aria-hidden': 'true', text: '▸' }),
        run.teamName || 'club not chosen');
      if (run.status && run.status !== 'DONE') club.appendChild(h('span', { class: 'ta-status ' + run.status, text: run.status }));
      var summary = h('tr', { class: 'run-row', tabindex: '0', role: 'button', 'aria-expanded': 'false', 'aria-controls': detailId },
        club,
        h('td', { class: 'ta-left opt', text: (typeof run.label === 'string' && run.label) || RUN_KIND_LABELS[run.kind] || A.show(run.kind) }),
        h('td', { text: A.isNum(run.teamReputation) ? String(run.teamReputation) : '—' }),
        h('td', { text: predicted || '—' }),
        h('td', { class: finishClass, title: finishTitle, text: done ? A.placeText(done.position, done.size) : '—' }),
        h('td', { text: split ? A.show(split.pld) : '—' }),
        h('td', { class: 'ta-strong', text: split ? A.pts(split) : '—' }),
        h('td', { class: split ? A.signClass(split.gd) : null, text: split ? A.signed(split.gd) : '—' }),
        h('td', { class: 'opt', text: split ? A.show(split.gf) : '—' }),
        h('td', { class: 'opt', text: split ? A.show(split.ga) : '—' }),
        h('td', { class: 'opt', text: split ? A.show(split.xgf) : '—' }),
        h('td', { class: 'opt', text: split ? A.show(split.xga) : '—' }),
        h('td', { class: split ? A.signClass(split.xgd) : null, text: split ? A.signed(split.xgd) : '—' }),
        h('td', { class: 'ta-left ta-small cups', title: cups.map(function (c) { return c.name + ': ' + c.text; }).join('\n') || null,
          text: cups.length ? cups.map(function (c) { return c.text; }).join(' · ') : '—' }));
      var inner = h('div', { class: 'run-detail-inner' });
      var detail = h('tr', { class: 'run-detail', id: detailId, hidden: true }, h('td', { colspan: columns.length }, inner));
      var built = false;

      function setOpen(value, scroll) {
        open[id] = value;
        detail.hidden = !value;
        summary.classList.toggle('open', value);
        summary.setAttribute('aria-expanded', value ? 'true' : 'false');
        if (value && !built) { built = true; inner.appendChild(runDetail(run, images)); details.push(inner); }
        fit();
        if (scroll) summary.scrollIntoView({ block: 'start' });
      }
      function toggle() { setOpen(!open[id]); writeHash(open); }
      summary.addEventListener('click', toggle);
      summary.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
      });
      table.appendChild(h('tbody', { class: 'run' }, summary, detail));
      run.__open = setOpen;
      run.__id = id;
    });

    var card = h('section', { class: 'ta-card runs-card' },
      h('h3', { text: 'Tested clubs' }),
      h('p', { class: 'ta-small', text: 'Click a club to see its results, tactic, full schedule and competition overview.' }),
      wrap);
    // Rows named in the address open once the table is on the page.
    card.__restore = function () {
      var wanted = openFromHash();
      runs.forEach(function (run) {
        if (wanted.indexOf(run.__id) >= 0) run.__open(true, run.__id === wanted[0]);
      });
    };
    return card;
  }

  function render(test, row) {
    var runImages = {};
    list(row && row.runs).forEach(function (r) { if (r && A.isNum(r.index)) runImages[r.index] = obj(r.images); });

    document.title = (test.name ? test.name + ' · ' : '') + 'Tactic Arena';
    page.textContent = '';
    var sub = [
      A.formationLabel(test.formation),
      test.teamName ? String(test.teamName) : 'general test (reference clubs only)',
      test.leagueName ? String(test.leagueName) : null,
      test.autoEleven === true ? 'automatic eleven' : null,
      'by ' + A.show(test.owner),
      'season ' + A.show(test.season) + ', days ' + A.show(test.startDay) + '–' + A.show(test.endDay),
      'engine ' + A.show(test.engine), A.formatDate(test.createdAt, true)
    ].filter(Boolean);
    var heading = h('h1', { text: A.show(test.name) });
    if (test.status && test.status !== 'DONE') heading.appendChild(h('span', { class: 'ta-status ' + test.status, text: test.status }));
    page.appendChild(h('div', { class: 'ta-head' },
      h('div', null,
        h('span', { class: 'ta-eyebrow', text: 'Tactic Arena' + (test.id !== undefined ? ' · test #' + test.id : '') }),
        heading, h('p', { class: 'ta-sub', text: sub.join(' · ') })),
      h('div', { class: 'ta-actions' }, h('a', { class: 'ta-btn', href: 'index.html', text: 'Leaderboard' }))));
    if (test.message) page.appendChild(h('p', { class: 'ta-error', text: test.message }));

    page.appendChild(h('section', { class: 'ta-card' },
      A.resultsBlock(test.results,
        String(test.category || '').toUpperCase() === 'DIAMOND' ? 'Results · Diamond League clubs' : 'Results · reference clubs',
        'Available when the reference runs have finished.')));
    var clubs = runsTable(test, runImages);
    page.appendChild(clubs);
    clubs.__restore();
  }

  var key = new URLSearchParams(window.location.search).get('t');
  if (!key || !/^[A-Za-z0-9._-]+$/.test(key)) {
    fail('Unknown test. Open a test from the leaderboard.');
    return;
  }
  var index = A.loadJson('data/index.json').catch(function () { return null; });
  var detail = A.loadJson('data/' + encodeURIComponent(key) + '/result.json');
  Promise.all([detail, index]).then(function (values) {
    var test = obj(values[0]);
    var row = list(values[1] && values[1].tests).filter(function (t) { return t && t.key === key; })[0] || null;
    render(test, row);
  }).catch(function (error) {
    fail('This test could not be loaded (' + error.message + ').');
  });
})();
