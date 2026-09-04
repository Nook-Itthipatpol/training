# Editing resistance-day exercises

Where to look next time the Monday/Wednesday/Friday strength routine changes.

## Where the data lives

`index.html` — everything is one file, no build step. Search for `const PLAN=[`
(around line 814). `PLAN` is an array of three session objects, one per day
(`dow:'MON'`, `dow:'WED'`, `dow:'FRI'`), each with an `items` array of
exercises in display order.

Each item looks like:

```js
{id:'h2', rest:'rest 2–3 min', name:'Bulgarian Split Squat', dose:'2 × 8 /side',
 target:'• why this exercise is here',
 note:'• how to perform it (cues, setup, tempo)',
 mistake:'• optional: the failure mode to watch for'}
```

Fields:
- `id` — stable, short, unique across the whole file (used by history, deload
  rules, tests). Never reuse an id for a different exercise; give a brand-new
  exercise a fresh id (grep the file first to make sure it's not taken).
- `dose` — the set/rep scheme. **The leading number before `×`/`x` is parsed
  by `itemSetsText()`** (see below) to build the "x N sets" suffix in the
  copied exercise list, so keep that number accurate to the actual set count.
- `ss` — superset letter (`'A'`, `'B'`, `'C'`, …). Items sharing the same
  letter **and appearing consecutively** in the `items` array are grouped as
  one superset, both on the day card and in the copied list. Order in the
  array is the order they render — to change which exercises are paired,
  both set the matching `ss` letter and move the items next to each other.
- `noWeight:1` — hides the kg/weight input (bodyweight or non-loaded work).
- `invert:1` — used for assisted-movement exercises where a *lower* logged
  number means more progress (e.g. Assisted Pull-up's assistance level).
- `rest` — free text shown as the rest period; omit for items that don't need
  one (e.g. between superset partners).

## Things that must stay in sync when you add/rename/remove an exercise

1. **`DELOAD_RULES`** (search `const DELOAD_RULES=`, a bit below `PLAN`).
   Keyed by item `id`. A new item doesn't need an entry — it silently gets
   the default deload treatment (`DELOAD_DEFAULT`, "2 sets · same load") —
   but if the exercise should be cut or altered on a deload week (high
   muscle-damage, max-intent/CAT work, etc.), add a rule here.
   A test (`markup` suite: "every plan id has a deload rule or falls through
   to the default" and "no deload rule points at an id that left the plan")
   fails if you rename/remove an id without removing its now-orphaned rule.

2. **`test.js`** — the "copy exercise list" tests
   (`the copied exercise list suffixes each resistance name with its set
   count` and `...writes each superset as one bulleted line`) hardcode exact
   exercise names and set counts from Monday's list (currently Bulgarian
   Split Squat, the Incline DB Press / Chest-supported Row superset, and the
   Lateral Raise / Hammer Curl superset). If you change any of those specific
   exercises or their set counts, update the matching `ok(txt.includes(...))`
   strings in `test.js`.

3. **Cross-references in prose fields.** Some `target`/`note` strings mention
   another exercise by name for context (e.g. "complement กับ hammer curl
   วันจันทร์"). If you rename or remove the referenced exercise, grep for its
   old name across `index.html` and update or drop the reference.

## Running the tests

```sh
npm install jsdom --no-save   # not vendored in the repo
node test.js
```

Note: as of writing, this checkout has ~15 pre-existing failures unrelated to
the resistance-day plan (timezone/rollover/history tests, `planListText is
not defined` in the aerobic suite due to an eval scoping issue with the
jsdom version installed here). Compare failure counts before/after your
change (e.g. `git stash` and rerun) rather than assuming a red run means you
broke something — but do make sure you haven't *added* any new failures, and
that the two "copy exercise list" tests pass if you touched Monday's plan.
