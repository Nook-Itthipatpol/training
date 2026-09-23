# Editing resistance-day exercises

The live app is `index.html`. Keep a byte-identical numbered snapshot (`training vNN.html`) for each new version. The three resistance sessions are defined in `const PLAN=[`, one card each for Monday, Wednesday, and Friday. Each session's `items` array sets display order.

An exercise item has a stable `id`, `name`, `dose`, and optional `rest`, `target`, `note`, `mistake`, `noWeight`, and `ss`. Keep an existing ID when moving or adjusting the same exercise; use a fresh ID for a different movement, including when its name resembles a retired one. IDs must not be reused from old snapshots or Git history because archived weight records still refer to them.

Items with the same `ss` letter **and adjacent positions** form one superset. Superset letters restart for each day. Put the rest period on the last partner. The `dose` field is displayed on the card and parsed by `itemSetsText()` for the copied exercise list. It accepts a set count such as `2 × 10–15` or range such as `2–3 × 8–15 /side`.

## Keep these in sync

1. `DELOAD_RULES` is keyed by live PLAN IDs. Remove rules for deleted exercises. Add a special rule when the default `2 sets · same load` is inappropriate.
2. Update exercise names, doses, order, and superset expectations in `test.js`. The boot test expects three day cards.
3. Search prose in `target`, `note`, `mistake`, `DELOAD_PRINCIPLES`, and `ADDLIST` for references to moved or removed movements.
4. Increment the version in the top comment of `index.html`, add a short change note, and copy it to the next `training vNN.html`.

## Test

```sh
npm install jsdom --no-save
TZ=Asia/Bangkok node test.js index.html
```

Pass `index.html` explicitly; otherwise the test script defaults to the frozen `training v62.html`. The Bangkok timezone is required for the date-sensitive tests. If a test fails, run the same test against the previous version to distinguish an existing failure from a regression.
