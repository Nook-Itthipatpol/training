# Editing resistance-day exercises

Where to look next time the Monday/Wednesday/Friday strength routine changes.

## Where the data lives

`index.html` — everything is one file, no build step. Search for `const PLAN=[`
(around line 814). `PLAN` is an array of **five** session objects
(`dow:'MON'` ×2, `dow:'WED'`, `dow:'FRI'` ×2), each with an `items` array of
exercises in display order.

Monday and Friday are each ONE session split across TWO cards, purely so
neither card is a ten-item scroll. Both halves carry the same `dow` and are
told apart by `sub:'part 1'` / `sub:'part 2'`, which prints beside the day
name in the card header. Nothing downstream treats a part as its own day:
`buildWeek` opens every card whose `dow` is today, and the copied exercise
list groups by `dow`, so both Monday cards land under one `# Monday`.
To re-balance the split, move items between the two objects; to add a third
part, copy a card object and give it the same `dow` with a new `sub`.

Each item looks like:

```js
{id:'t2', rest:'rest 2 min', name:'Nordic Hamstring Curl', dose:'2 × 3–5 · once a week',
 target:'• why this exercise is here',
 note:'• how to perform it (cues, setup, tempo)',
 mistake:'• optional: the failure mode to watch for'}
```

Fields:
- `id` — stable, short, unique across the whole file (used by history, deload
  rules, tests). Never reuse an id for a different exercise — **including ids
  that have already been retired**: a user's archived weeks still hold them, so
  a recycled id makes another exercise's history reappear under the new name.
  Check every id ever used, not just the live ones:

  ```sh
  { for c in $(git rev-list --all); do git show $c:index.html; done; \
    cat training\ v*.html; } | grep -o "id:'[a-z0-9]*'" | sort -u
  ```
- `sub` — day-card subtitle (`'part 1'`), for a day written as two cards.
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
   exercise names and set counts: Friday's Nordic Hamstring Curl, Monday
   part 1's Incline DB Press / Chest-supported Row (superset B) and DB
   Overhead Extension / Hammer Curl (superset C), Monday part 2's superset D,
   and Wednesday's superset A. If you change any of those specific exercises
   or their set counts, update the matching `ok(txt.includes(...))` strings in
   `test.js`. The boot suite also asserts the **number of day cards** (5) —
   update it if a day gains or loses a part.

3. **Cross-references in prose fields.** Some `target`/`note` strings mention
   another exercise by name for context (e.g. "complement กับ hammer curl
   วันจันทร์"). If you rename or remove the referenced exercise, grep for its
   old name across `index.html` and update or drop the reference.

## Running the tests

```sh
npm install jsdom --no-save          # not vendored in the repo
node test.js index.html              # the arg matters, see below
```

`test.js` defaults to the frozen `training v62.html` snapshot, not the live
file. Always pass `index.html` explicitly, or you will be testing a build from
three versions ago (and seeing ~15 failures that are only that snapshot's).

Note: as of writing, `node test.js index.html` has 8 pre-existing failures
unrelated to the resistance-day plan (timezone/rollover/history tests, import/
export round-trips). Compare failure counts before/after your change (e.g.
`git stash` and rerun) rather than assuming a red run means you broke
something — but do make sure you haven't *added* any new failures, and that
the "copy exercise list" tests pass if you touched a resistance day.
