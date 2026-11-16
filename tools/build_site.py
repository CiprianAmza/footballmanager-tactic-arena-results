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
        split = results.get(name)
        out[name] = split if isinstance(split, dict) else None
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

    rows = []
    for key, (folder, test, _) in sorted(by_key.items()):
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
            runs.append({
                "index": index,
                "kind": run.get("kind"),
                "teamName": run.get("teamName"),
                "status": run.get("status"),
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
            "runs": runs,
        })

    done = [row for row in rows if row.get("status") in (None, "DONE")]
    matches = 0
    for row in done:
        overall = as_dict(as_dict(row.get("results")).get("overall"))
        if isinstance(overall.get("pld"), (int, float)):
            matches += int(overall["pld"])
    rows.sort(key=lambda row: str(row.get("finishedAt") or row.get("createdAt") or ""), reverse=True)
    index = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "testsCount": len(done),
        "matchesPlayed": matches,
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
