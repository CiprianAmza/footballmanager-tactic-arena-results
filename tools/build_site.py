#!/usr/bin/env python3
"""Build the static Tactic Arena results site.

Finds every exported test (any folder holding a ``result.json.gz``, at the repository
root, under ``tests/`` or deeper), and writes into the output folder:

  index.html, test.html, *.css, *.js   copied from ``site/``
  data/index.json                      the leaderboard rows (one per test)
  data/<key>/result.json               the full test, plain JSON
  data/<key>/<run>-<kind>.webp|png     the screenshots saved with the test

``<key>`` is the test ``uid`` when it has one, else the folder name. A test whose JSON
cannot be read is skipped with a warning. Standard library only.

Usage: python tools/build_site.py [--repo DIR] [--out DIR]
"""

import argparse
import gzip
import json
import math
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_DIR.parent
SITE_DIR = REPO_ROOT / "site"
MARKER = ".tactic-arena-site"
IMAGE_FILE = re.compile(r"^(\d+)-(tactic|schedule|competitions)\.(webp|png)$", re.IGNORECASE)
SKIP_DIRS = {".git", ".github", "node_modules", "_site", "site", "tools", "__pycache__"}
SPLITS = ("overall", "home", "away")


def warn(message):
    print("warning: " + message, file=sys.stderr)


def find_tests(repo, out):
    """Every folder under ``repo`` that holds a result.json.gz (the output folder excluded)."""
    out = out.resolve()
    root = repo.resolve()
    found = []
    for current, dirs, files in os.walk(root):
        here = Path(current).resolve()
        skip = SKIP_DIRS if here == root else {"node_modules", "__pycache__"}
        dirs[:] = sorted(d for d in dirs
                         if d not in skip and not d.startswith(".") and (here / d).resolve() != out)
        if "result.json.gz" in files:
            found.append(here)
    return found


def safe_key(text):
    key = re.sub(r"[^A-Za-z0-9._-]+", "-", str(text)).strip("-.")
    return key[:120] or "test"


def as_dict(value):
    return value if isinstance(value, dict) else {}


def as_list(value):
    return value if isinstance(value, list) else []


def split_or_none(results):
    """Keep only the numeric splits the leaderboard needs; None when absent."""
    results = as_dict(results)
    if not results:
        return None
    out = {"basedOn": results.get("basedOn")}
    for name in SPLITS:
        out[name] = with_pts_pct(results.get(name))
    return out


def images_of(folder):
    """{runIndex: {kind: filename}}; webp wins over png for the same run and kind."""
    images = {}
    for entry in sorted(folder.iterdir()):
        match = IMAGE_FILE.match(entry.name)
        if not match or not entry.is_file():
            continue
        run, kind, ext = int(match.group(1)), match.group(2).lower(), match.group(3).lower()
        current = images.setdefault(run, {}).get(kind)
        if current is None or (ext == "webp" and current.lower().endswith(".png")):
            images[run][kind] = entry.name
    return images


def version_of(test):
    for source in (test, as_dict(test.get("baseline")), as_dict(test.get("world"))):
        for field in ("appVersion", "engineVersion", "version"):
            value = source.get(field)
            if isinstance(value, (str, int, float)) and str(value).strip():
                return str(value).strip()
    return None


def positive_int(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def load_predictions(repo):
    """(world uid, {teamId: (predictedPosition, leagueSize)}) from baseline/; empty when absent."""
    base = repo / "baseline"
    uid, table = None, {}
    try:
        with open(base / "meta.json", encoding="utf-8") as handle:
            uid = as_dict(json.load(handle)).get("uid")
    except (OSError, ValueError):
        pass
    try:
        with open(base / "clubs.json", encoding="utf-8") as handle:
            clubs = as_dict(json.load(handle))
    except (OSError, ValueError) as error:
        if (base / "clubs.json").exists():
            warn("cannot read baseline/clubs.json: %s" % error)
        return uid, table
    for league in as_list(clubs.get("leagues")):
        league = as_dict(league)
        teams = as_list(league.get("teams"))
        for team in teams:
            team = as_dict(team)
            position = positive_int(team.get("predictedPosition"))
            team_id = team.get("teamId")
            if position is None or team_id is None:
                continue
            size = positive_int(team.get("leagueSize")) or positive_int(league.get("leagueSize")) or len(teams)
            table[str(team_id)] = (position, size)
    return uid, table


def fill_predictions(test, world_uid, table):
    """Adds predictedPosition / leagueSize to runs that lack them, when the test ran on this world."""
    if not table:
        return
    test_world = test.get("baselineUid")
    if test_world and world_uid and test_world != world_uid:
        return
    for run in as_list(test.get("runs")):
        if not isinstance(run, dict) or positive_int(run.get("predictedPosition")):
            continue
        found = table.get(str(run.get("teamId")))
        if found:
            run["predictedPosition"], size = found
            if not positive_int(run.get("leagueSize")):
                run["leagueSize"] = size


def is_diamond_comp(comp):
    """The Diamond League (competition type 7) in a run's competition list."""
    return (comp.get("typeId") == 7 or comp.get("competitionTypeId") == 7 or comp.get("diamond") is True
            or "DIAMOND" in str(comp.get("kind") or "").upper())


def is_diamond_match(match, comps, league_id=None):
    kind = match.get("competitionKind")
    if isinstance(kind, str) and kind:
        return kind.upper() == "DIAMOND"
    if league_id is not None and match.get("competitionId") == league_id:
        return True
    if match.get("competitionTypeId") == 7 or match.get("diamond") is True \
            or "DIAMOND" in str(match.get("competitionType") or "").upper():
        return True
    for comp in comps:
        if comp.get("competitionId") is not None and comp.get("competitionId") == match.get("competitionId"):
            return True
        if match.get("competitionName") and match.get("competitionName") in (comp.get("name"), comp.get("competitionName")):
            return True
    return False


def season_split(matches):
    """League-style figures of one season from played matches (totals, as a single run's stats)."""
    played = [m for m in matches if m.get("resultOutcome") in ("W", "D", "L")
              and isinstance(m.get("teamGoals"), int) and isinstance(m.get("opponentGoals"), int)]
    if not played:
        return None
    w = sum(1 for m in played if m["resultOutcome"] == "W")
    d = sum(1 for m in played if m["resultOutcome"] == "D")
    gf = sum(m["teamGoals"] for m in played)
    ga = sum(m["opponentGoals"] for m in played)
    with_xg = [m for m in played if isinstance(m.get("xgFor"), (int, float)) and isinstance(m.get("xgAgainst"), (int, float))]
    xgf = round(sum(m["xgFor"] for m in with_xg)) if with_xg else None
    xga = round(sum(m["xgAgainst"] for m in with_xg)) if with_xg else None
    return with_pts_pct({
        "pld": len(played), "pts": 3 * w + d, "ptsMax": 3 * len(played),
        "w": w, "d": d, "l": len(played) - w - d, "gf": gf, "ga": ga, "gd": gf - ga,
        "xgf": xgf, "xga": xga, "xgd": None if xgf is None else xgf - xga,
    })


def run_diamond(run):
    """The run's Diamond League figures: as exported, else computed from its schedule; None when it does not play in it."""
    given = run.get("diamond")
    if isinstance(given, dict):
        out = dict(given)
        for name in SPLITS:
            out[name] = with_pts_pct(given.get(name))
        return out
    result = as_dict(run.get("result"))
    comps = [as_dict(c) for c in as_list(result.get("competitions")) if is_diamond_comp(as_dict(c))]
    matches = [as_dict(m) for m in as_list(result.get("matches"))
               if is_diamond_match(as_dict(m), comps, result.get("diamondLeagueId"))]
    if not matches:
        return None
    overall = season_split(matches)
    if overall is None:
        return None
    comp = comps[0] if comps else {}
    standings = as_list(result.get("diamondTable")) or next(
        (as_list(comp.get(key)) for key in ("standings", "table", "leagueTable", "groupStandings") if as_list(comp.get(key))), [])
    return {
        "overall": overall,
        "home": season_split([m for m in matches if m.get("homeOrAway") == "H"]),
        "away": season_split([m for m in matches if m.get("homeOrAway") == "A"]),
        "position": positive_int(comp.get("position")),
        "of": positive_int(comp.get("of")) or positive_int(comp.get("totalTeams")) or (len(standings) or None),
    }


def average_splits(splits):
    """Average of per-run splits, like the backend's results block: pld summed, the rest averaged."""
    splits = [s for s in splits if isinstance(s, dict) and isinstance(s.get("pld"), (int, float))]
    if not splits:
        return None
    n = len(splits)

    def mean(field):
        values = [s.get(field) for s in splits if isinstance(s.get(field), (int, float))]
        return round(sum(values) / len(values)) if values else None

    out = {"pld": int(sum(s["pld"] for s in splits)), "ptsMax": round(sum(s["pld"] for s in splits) / n) * 3}
    for field in ("pts", "w", "d", "l", "gf", "ga", "gd", "xgf", "xga", "xgd"):
        out[field] = mean(field)
    return with_pts_pct(out)


def test_diamond(test):
    """The test's Diamond League block: as exported, else the average of the reference (or season) runs in it."""
    given = test.get("diamond")
    if isinstance(given, dict):
        out = dict(given)
        for name in SPLITS:
            out[name] = with_pts_pct(given.get(name))
        return out
    refs = [as_dict(run) for run in as_list(test.get("runs"))
            if str(as_dict(run).get("kind") or "").upper().startswith(("REFERENCE", "REPEAT", "DIAMOND"))
            and isinstance(as_dict(run).get("diamond"), dict)]
    if not refs:
        return None
    return dict({"basedOn": len(refs)}, **{name: average_splits([r["diamond"].get(name) for r in refs]) for name in SPLITS})


def fill_diamond(test):
    """Adds `diamond` to the runs and to the test when the export does not have it."""
    for run in as_list(test.get("runs")):
        if isinstance(run, dict):
            run["diamond"] = run_diamond(run)
    test["diamond"] = test_diamond(test)


def match_xpts(match):
    """Expected points of one match: `xptsFor`, else independent Poisson from its xG (goals 0..10); None without xG."""
    given = match.get("xptsFor")
    if isinstance(given, (int, float)) and not isinstance(given, bool):
        return float(given)
    xg_for, xg_against = match.get("xgFor"), match.get("xgAgainst")
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0 for v in (xg_for, xg_against)):
        return None
    def dist(lam):
        return [math.exp(-lam) * lam ** k / math.factorial(k) for k in range(11)]
    mine, theirs = dist(xg_for), dist(xg_against)
    win = sum(mine[i] * theirs[j] for i in range(11) for j in range(11) if i > j)
    draw = sum(mine[i] * theirs[i] for i in range(11))
    return 3 * win + draw


def played(match):
    return match.get("inRun") is not False and match.get("resultOutcome") in ("W", "D", "L")


def is_league_match(match):
    kind = match.get("competitionKind")
    if isinstance(kind, str) and kind:
        return kind.upper() == "LEAGUE"
    return str(match.get("competitionType") or "").lower() == "league"


def xpts_sum(matches):
    """Season total of the matches' expected points, one decimal; None when no match has a value."""
    values = [v for v in (match_xpts(m) for m in matches) if v is not None]
    return round(sum(values), 1) if values else None


def run_xpts(run, diamond):
    """{split: xpts} of a run's league (or Diamond League) matches."""
    result = as_dict(run.get("result"))
    all_matches = [as_dict(m) for m in as_list(result.get("matches"))]
    if diamond:
        comps = [as_dict(c) for c in as_list(result.get("competitions")) if is_diamond_comp(as_dict(c))]
        matches = [m for m in all_matches if played(m) and is_diamond_match(m, comps, result.get("diamondLeagueId"))]
    else:
        matches = [m for m in all_matches if played(m) and is_league_match(m)]
    return {
        "overall": xpts_sum(matches),
        "home": xpts_sum([m for m in matches if m.get("homeOrAway") == "H"]),
        "away": xpts_sum([m for m in matches if m.get("homeOrAway") == "A"]),
    }


def put_xpts(block, values):
    """Sets `xpts` on the splits of a block that lack it (a value already exported wins)."""
    if not isinstance(block, dict):
        return
    for name in SPLITS:
        split = block.get(name)
        if isinstance(split, dict) and not isinstance(split.get("xpts"), (int, float)):
            split["xpts"] = values.get(name) if values else None


def mean_xpts(blocks):
    """{split: mean xpts} over the blocks that have one, one decimal."""
    out = {}
    for name in SPLITS:
        values = [as_dict(b.get(name)).get("xpts") for b in blocks if isinstance(b, dict)]
        values = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)]
        out[name] = round(sum(values) / len(values), 1) if values else None
    return out


def averaged_runs(test):
    """The runs a test's `results` averages: the season runs of a CLUB test, else the reference (or Diamond League club) runs."""
    runs = [as_dict(run) for run in as_list(test.get("runs"))]
    kinds = ("REPEAT",) if category_of(test) == "CLUB" else ("REFERENCE", "DIAMOND")
    picked = [run for run in runs if str(run.get("kind") or "").upper().startswith(kinds)]
    picked.sort(key=lambda run: run.get("index") if isinstance(run.get("index"), int) else 99)
    return picked


def fill_xpts(test):
    """Adds `xpts` to every split of the test (runs, results, chosen, diamond, byTier, byClub) that lacks it."""
    for run in as_list(test.get("runs")):
        if not isinstance(run, dict):
            continue
        if isinstance(run.get("stats"), dict):
            put_xpts(run["stats"], run_xpts(run, False))
        if isinstance(run.get("diamond"), dict):
            put_xpts(run["diamond"], run_xpts(run, True))
    refs = averaged_runs(test)
    put_xpts(test.get("results"), mean_xpts([r.get("stats") for r in refs]))
    chosen = [as_dict(r) for r in as_list(test.get("runs")) if as_dict(r).get("kind") == "CHOSEN"]
    put_xpts(test.get("chosen"), mean_xpts([r.get("stats") for r in chosen]))
    put_xpts(test.get("diamond"), mean_xpts([r.get("diamond") for r in refs]))
    # The exported byTier / byClub blocks of the test JSON: same run, by tier or by position.
    tiers = as_dict(test.get("byTier"))
    by_tier_runs = as_dict(by_tier_runs_of(test))
    for tier, entry in tiers.items():
        run = by_tier_runs.get(tier)
        if isinstance(entry, dict) and run:
            put_xpts(entry.get("results"), mean_xpts([run.get("stats")]))
            put_xpts(entry.get("diamond"), mean_xpts([run.get("diamond")]))
    for entry, run in zip(as_list(test.get("byClub")), refs):
        if isinstance(entry, dict):
            put_xpts(entry.get("results"), mean_xpts([run.get("stats")]))
            put_xpts(entry.get("diamond"), mean_xpts([run.get("diamond")]))


def by_tier_runs_of(test):
    """{TOP|MID|BOTTOM: run}, chosen the same way as by_tier()."""
    out = {}
    for position, run in enumerate(averaged_runs(test)):
        tier = str(run.get("tier") or "").upper()
        if tier not in TIERS:
            tier = TIERS[position] if position < len(TIERS) else None
        if tier and tier not in out:
            out[tier] = run
    return out


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def player_summary(players):
    """Top scorer, top assists, best rated (with a fair number of games) and the team's average rating."""
    players = [as_dict(p) for p in players if isinstance(p, dict)]
    played = [p for p in players if (number(p.get("apps")) or 0) > 0]
    if not played:
        return None

    def best(field):
        top = max(played, key=lambda p: (number(p.get(field)) or 0, number(p.get("apps")) or 0))
        return top if (number(top.get(field)) or 0) > 0 else None

    scorer, assister = best("goals"), best("assists")
    most_apps = max(number(p.get("apps")) or 0 for p in played)
    rated = [p for p in played if number(p.get("avgRating")) is not None]
    regular = [p for p in rated if (number(p.get("apps")) or 0) >= max(1, most_apps / 3)] or rated
    best_rated = max(regular, key=lambda p: number(p.get("avgRating"))) if regular else None
    weight = sum(number(p.get("apps")) or 0 for p in rated)
    team_avg = round(sum(number(p.get("avgRating")) * (number(p.get("apps")) or 0) for p in rated) / weight, 2) if weight else None
    return {
        "topScorer": {"name": scorer.get("name"), "goals": scorer.get("goals")} if scorer else None,
        "topAssists": {"name": assister.get("name"), "assists": assister.get("assists")} if assister else None,
        "bestRated": {"name": best_rated.get("name"), "avgRating": best_rated.get("avgRating"),
                      "apps": best_rated.get("apps")} if best_rated else None,
        "teamAvgRating": team_avg,
    }


def fill_player_summary(test):
    """Adds result.playerSummary to runs that have result.players but no summary."""
    for run in as_list(test.get("runs")):
        result = as_dict(as_dict(run).get("result"))
        if result and isinstance(result.get("players"), list) and not isinstance(result.get("playerSummary"), dict):
            summary = player_summary(result["players"])
            if summary:
                result["playerSummary"] = summary


def league_finish(run):
    """(final league position, league size) from the run's result, or (None, None)."""
    result = as_dict(run.get("result"))
    for comp in as_list(result.get("competitions")):
        comp = as_dict(comp)
        if is_diamond_comp(comp):
            continue
        if comp.get("kind") == "LEAGUE" or comp.get("typeId") in (1, 3):
            size = positive_int(comp.get("totalTeams")) or len(as_list(result.get("leagueTable"))) or None
            return positive_int(comp.get("position")), size
    return None, None


TIERS = ("TOP", "MID", "BOTTOM")
# Team instructions and their defaults (docs/TACTIC_ARENA_API.md of the backend); null = default.
DEFAULT_INSTRUCTIONS = {
    "mentality": "Balanced", "inPossession": "Standard", "passingType": "Normal", "tempo": "Standard",
    "timeWasting": "Sometimes", "defensiveLine": "Standard", "pressing": "Normal", "width": "Balanced",
    "dribbling": "Standard", "foulFrequency": "Normal", "foulHardness": "Medium",
    "tempoFragmentation": "Normal", "widePlay": "Shoot", "transition": "Balanced", "recovery": "Standard",
}
# The flat `settings` object of a test: the formation key, then the 15 instructions.
DEFAULT_SETTINGS = dict({"tactic": "442"}, **DEFAULT_INSTRUCTIONS)
SETTING_KEYS = ("tactic", "mentality", "inPossession", "passingType", "tempo", "timeWasting", "defensiveLine",
                "pressing", "width", "dribbling", "foulFrequency", "foulHardness", "tempoFragmentation",
                "widePlay", "transition", "recovery")


def by_tier(test):
    """{TOP|MID|BOTTOM: {...}} from the reference runs: their `tier`, else their order (top, mid, bottom)."""
    refs = [as_dict(run) for run in as_list(test.get("runs"))
            if str(as_dict(run).get("kind") or "").startswith("REFERENCE")]
    refs.sort(key=lambda run: run.get("index") if isinstance(run.get("index"), int) else 99)
    out = {}
    for position, run in enumerate(refs):
        tier = str(run.get("tier") or "").upper()
        if tier not in TIERS:
            tier = TIERS[position] if position < len(TIERS) else None
        if not tier or tier in out:
            continue
        stats = as_dict(run.get("stats"))
        out[tier] = {
            "teamId": run.get("teamId"),
            "teamName": run.get("teamName"),
            "predictedPosition": positive_int(run.get("predictedPosition")),
            "leagueSize": positive_int(run.get("leagueSize")),
            "results": {name: with_pts_pct(stats.get(name)) for name in SPLITS} if stats else None,
            "diamond": run.get("diamond") if isinstance(run.get("diamond"), dict) else None,
        }
        out[tier].update(finish_fields(run))
    return out


def with_pts_pct(split):
    """The split with ptsPct (share of the maximum points, 0-100, one decimal) when it can be known."""
    if not isinstance(split, dict):
        return None
    if not isinstance(split.get("ptsPct"), (int, float)):
        pts, top = split.get("pts"), split.get("ptsMax")
        if isinstance(pts, (int, float)) and isinstance(top, (int, float)) and top > 0:
            split = dict(split, ptsPct=round(pts * 100.0 / top, 1))
    return split


def category_of(test):
    value = str(test.get("category") or "GENERAL").upper()
    return value if value in ("GENERAL", "DIAMOND", "CLUB") else "GENERAL"


def settings_of(test):
    """The 16 tactic settings: the test's `settings`, else read from its `tactic`; missing ones = default."""
    given = as_dict(test.get("settings"))
    tactic = as_dict(test.get("tactic"))
    out = {}
    for field in SETTING_KEYS:
        value = given.get(field)
        if value is None or value == "":
            value = tactic.get(field)
        if field == "tactic" and (value is None or value == ""):
            value = test.get("formation")
        if value is None or value == "":
            value = DEFAULT_SETTINGS[field]
        out[field] = str(value)
    return out


def repeats_of(test):
    """N seasons of a CLUB test (`repeats`, else its REPEAT runs); None for the other categories."""
    if category_of(test) != "CLUB":
        return None
    given = positive_int(test.get("repeats"))
    if given:
        return given
    count = sum(1 for run in as_list(test.get("runs")) if str(as_dict(run).get("kind") or "").upper() == "REPEAT")
    return count or None


def by_club(test):
    """Every averaged run (reference / Diamond League club / season run) of the test with its figures, in run order."""
    refs = averaged_runs(test)
    clubs = []
    for run in refs:
        stats = as_dict(run.get("stats"))
        clubs.append({
            "teamId": run.get("teamId"),
            "teamName": run.get("teamName"),
            "tier": run.get("tier"),
            "label": run.get("label") or (("Season run %s" % run.get("index")) if category_of(test) == "CLUB" else None),
            "predictedPosition": positive_int(run.get("predictedPosition")),
            "leagueSize": positive_int(run.get("leagueSize")),
            "results": {name: with_pts_pct(stats.get(name)) for name in SPLITS} if stats else None,
            "diamond": run.get("diamond") if isinstance(run.get("diamond"), dict) else None,
        })
        clubs[-1].update(finish_fields(run))
    return clubs


def finish_fields(run):
    """finalPosition / finalLeagueSize: as exported on the run, else from its league competition."""
    position, size = positive_int(run.get("finalPosition")), positive_int(run.get("finalLeagueSize"))
    if position is None:
        position, computed_size = league_finish(run)
        size = size or computed_size
    return {"finalPosition": position, "finalLeagueSize": size}


def formation_only(test):
    """True when the tactic differs from the base only by its formation (default instructions, no roles)."""
    if str(test.get("name") or "").startswith("Formation "):
        return True
    tactic = as_dict(test.get("tactic"))
    if not tactic:
        return False
    for field, default in DEFAULT_INSTRUCTIONS.items():
        value = tactic.get(field)
        if value is not None and value != default:
            return False
    for slot in as_list(tactic.get("formationDataList")):
        slot = as_dict(slot)
        if slot.get("role") or slot.get("duty") or slot.get("instructions") or slot.get("specialRole"):
            return False
    return True


def load_test(folder):
    with gzip.open(folder / "result.json.gz", "rb") as handle:
        test = json.loads(handle.read().decode("utf-8"))
    if not isinstance(test, dict):
        raise ValueError("the JSON is not an object")
    return test


def prepare_out(out):
    if out.exists():
        if not out.is_dir():
            sys.exit("error: --out %s is not a folder" % out)
        if any(out.iterdir()) and not (out / MARKER).exists():
            sys.exit("error: --out %s is not empty and was not made by this script; refusing to clear it" % out)
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / MARKER).write_text("Built by tools/build_site.py; cleared on every build.\n", encoding="utf-8")


def copy_site(out):
    if not SITE_DIR.is_dir():
        sys.exit("error: site folder not found: %s" % SITE_DIR)
    for entry in SITE_DIR.rglob("*"):
        if entry.is_file():
            target = out / entry.relative_to(SITE_DIR)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(entry, target)


def build(repo, out):
    prepare_out(out)
    copy_site(out)
    data = out / "data"
    data.mkdir()

    by_key = {}
    for folder in find_tests(repo, out):
        try:
            test = load_test(folder)
        except Exception as error:  # broken archive or JSON: skip, keep building
            warn("skipping %s: %s" % (folder, error))
            continue
        key = safe_key(test.get("uid") or folder.name)
        mtime = (folder / "result.json.gz").stat().st_mtime
        previous = by_key.get(key)
        if previous and previous[2] >= mtime:
            warn("duplicate test %s in %s (keeping %s)" % (key, folder, previous[0]))
            continue
        if previous:
            warn("duplicate test %s in %s (keeping %s)" % (key, previous[0], folder))
        by_key[key] = (folder, test, mtime)

    world_uid, predictions = load_predictions(repo)
    rows = []
    for key, (folder, test, _) in sorted(by_key.items()):
        fill_predictions(test, world_uid, predictions)
        fill_diamond(test)
        fill_xpts(test)
        fill_player_summary(test)
        target = data / key
        target.mkdir()
        images = images_of(folder)
        for run_images in images.values():
            for name in run_images.values():
                shutil.copy2(folder / name, target / name)
        with open(target / "result.json", "w", encoding="utf-8") as handle:
            json.dump(test, handle, ensure_ascii=False, separators=(",", ":"))

        runs = []
        for run in as_list(test.get("runs")):
            run = as_dict(run)
            index = run.get("index")
            run_images = images.get(index, {}) if isinstance(index, int) else {}
            fields = finish_fields(run)
            finish, finish_size = fields["finalPosition"], fields["finalLeagueSize"]
            runs.append({
                "index": index,
                "kind": run.get("kind"),
                "label": run.get("label"),
                "teamId": run.get("teamId"),
                "teamName": run.get("teamName"),
                "status": run.get("status"),
                "predictedPosition": positive_int(run.get("predictedPosition")),
                "leagueSize": positive_int(run.get("leagueSize")),
                "finalPosition": finish,
                "finalLeagueSize": finish_size,
                "images": {kind: "data/%s/%s" % (key, name) for kind, name in sorted(run_images.items())},
            })
        rows.append({
            "key": key,
            "id": test.get("id"),
            "uid": test.get("uid"),
            "folder": folder.name,
            "name": test.get("name"),
            "formation": test.get("formation"),
            "owner": test.get("owner"),
            "teamId": test.get("teamId"),
            "teamName": test.get("teamName"),
            "leagueId": test.get("leagueId"),
            "leagueName": test.get("leagueName"),
            "predictedPosition": positive_int(test.get("predictedPosition")),
            "leagueSize": positive_int(test.get("leagueSize")),
            "season": test.get("season"),
            "engine": test.get("engine"),
            "version": version_of(test),
            "autoEleven": test.get("autoEleven"),
            "status": test.get("status"),
            "progress": test.get("progress"),
            "createdAt": test.get("createdAt"),
            "finishedAt": test.get("finishedAt"),
            "results": split_or_none(test.get("results")),
            "chosen": split_or_none(test.get("chosen")),
            "diamond": test.get("diamond") if isinstance(test.get("diamond"), dict) else None,
            "category": category_of(test),
            "repeats": repeats_of(test),
            "settings": settings_of(test),
            "byTier": by_tier(test) if category_of(test) == "GENERAL" else {},
            "byClub": by_club(test),
            "formationOnly": formation_only(test),
            "runs": runs,
        })

    done = [row for row in rows if row.get("status") in (None, "DONE")]
    matches = 0
    for row in done:
        overall = as_dict(as_dict(row.get("results")).get("overall"))
        if isinstance(overall.get("pld"), (int, float)):
            matches += int(overall["pld"])
    rows.sort(key=lambda row: str(row.get("finishedAt") or row.get("createdAt") or ""), reverse=True)
    # The reference clubs of the newest test that has them (they are the same for every test).
    reference_clubs = []
    for row in rows:
        if row.get("category") != "GENERAL":
            continue
        names = [run.get("teamName") for run in row["runs"]
                 if str(run.get("kind") or "").startswith("REFERENCE") and run.get("teamName")]
        if names:
            reference_clubs = names
            break
    index = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "testsCount": len(done),
        "matchesPlayed": matches,
        "referenceClubs": reference_clubs,
        "tests": rows,
    }
    with open(data / "index.json", "w", encoding="utf-8") as handle:
        json.dump(index, handle, ensure_ascii=False, indent=1)
    print("built %d test(s) into %s" % (len(rows), out))


def main():
    parser = argparse.ArgumentParser(description="Build the static Tactic Arena results site.")
    parser.add_argument("--repo", default=str(REPO_ROOT), help="folder searched for tests (default: the repository root)")
    parser.add_argument("--out", default=None, help="output folder (default: <repository>/_site)")
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        sys.exit("error: --repo %s is not a folder" % repo)
    out = Path(args.out).resolve() if args.out else REPO_ROOT / "_site"
    build(repo, out)


if __name__ == "__main__":
    main()
