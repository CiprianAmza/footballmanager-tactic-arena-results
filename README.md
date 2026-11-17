# Tactic Arena results

Results of the tactic tests run with the **Tactic Arena** of the football manager game
(backend: `footballmanager-backend-`, section "Tactic testing (Tactic Arena)" of its README).

**Site:** <https://ciprianamza.github.io/footballmanager-tactic-arena-results/>

## Repository layout

```text
tests/
  <id>-<short-name>-<uid>/
    result.json.gz     the test: tactic, starting eleven, the four season runs, the averages
    *.webp / *.png     <run>-tactic, <run>-schedule, <run>-competitions screenshots of each run
baseline/              the base world every run starts from (written by the backend; not used by the site)
site/                  the static site (plain HTML, CSS and JavaScript, no build tools)
tools/build_site.py    builds the published site from site/ and the tests
.github/workflows/pages.yml   builds and publishes the site on every push to main
```

Every finished test is one folder, written and pushed here automatically by the game's backend
when `tactic-arena.export-dir` points to a clone of this repository and `tactic-arena.git-push`
is on. A backend started on an empty database imports the tests found here, so the results
survive a database reset. Nothing under `tests/` is edited by hand.

## How the site is published

1. The backend pushes a new or updated test folder to `main`.
2. The **Publish site** workflow runs `python tools/build_site.py --out _site`. The script finds
   every folder holding a `result.json.gz` (at the root, under `tests/` or deeper), and writes:
   - the pages from `site/`;
   - `data/index.json`: one leaderboard row per test (Overall / Home / Away figures, engine,
     dates, the screenshots each run has, `category` (`GENERAL` / `DIAMOND` / `CLUB`), `byTier` (the
     top / mid-table / bottom reference club of a general test: the runs' `tier`, else their
     order) and `byClub` (every reference club with its figures; `ptsPct` added when missing),
     `settings` (the 16 tactic settings: formation `tactic` + the 15 team instructions, taken
     from the test's `settings`, else from its `tactic`, defaults filled) and `repeats`. A `CLUB`
     test plays one club's first season `repeats` times: the row carries the club (`teamId`,
     `teamName`, `leagueName`, `predictedPosition`, `leagueSize`), `results` = the mean of the
     seasons and `byClub` = one entry per season run (`label` "Season run i", `finalPosition`));
   - `data/<key>/result.json`: the full test as plain JSON, plus its screenshots
     (`<key>` = the test `uid`, or the folder name when there is none).

   A test whose JSON cannot be read is skipped with a warning. Runs without a media prediction
   (`predictedPosition`, `leagueSize`) get it from `baseline/clubs.json` by `teamId`, unless the
   test's `baselineUid` differs from `baseline/meta.json`. A run with `result.players` but no
   `result.playerSummary` gets the summary computed (top scorer, top assists, best rated, team
   average rating). `byTier` / `byClub` entries carry `finalPosition` / `finalLeagueSize` and
   their `diamond` block (`position` / `of`).
3. The workflow publishes `_site/` to GitHub Pages. The site reads only those static files; there
   is no backend. A run without screenshots is drawn from the data (pitch with the eleven and
   the team instructions, full schedule, competition overview).

## Build locally

Python 3, standard library only:

```sh
python tools/build_site.py --out _site
python -m http.server 8000 --directory _site
```

Then open <http://localhost:8000/>. Options: `--repo <folder>` searches another folder for
tests (default: the repository root), `--out <folder>` sets the output folder (default `_site/`,
which is ignored by git; the script clears it on every build).

## One-time setup

In the repository on GitHub: **Settings → Pages → Build and deployment → Source: "GitHub
Actions"**. After that every push to `main` (or a manual run of the workflow from the
**Actions** tab) publishes the site.

If the source is left on "Deploy from a branch", GitHub also runs its own "pages build and
deployment" on every push and publishes the raw branch over the built site: the pages then load
but `data/index.json` answers 404. Switching the source to "GitHub Actions" fixes it.
