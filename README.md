# Tactic Arena results

Results of the tactic tests run with the **Tactic Arena** of the football manager game
(backend: `footballmanager-backend-`, section "Tactic testing (Tactic Arena)" of its README).

Every finished test is one folder, written and pushed here automatically by the game's backend
when `tactic-arena.export-dir` points to a clone of this repository and `tactic-arena.git-push`
is on:

```text
<id>-<short-name>/
  result.json.gz     the test: tactic, starting eleven, the four season runs, the averages
  *.webp / *.png     the tactic, the full schedule and the competition overview of each run
```

A backend started on an empty database imports the tests found in this folder, so the results
survive a database reset. Nothing here is edited by hand.
