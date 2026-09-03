/* ===========================================================================
   test.js — regression suite for Training Week
   ===========================================================================
   Run by Claude, not by the user:   npm i jsdom && TZ=Asia/Bangkok node test.js
   Optionally against another build: node test.js "training v61.html"

   Every test named FIX-x pins a bug that was live in v61. Point this file at
   v61 and those tests fail; point it at v62 and they pass. That is the whole
   contract — a fix with no failing-before test is not a fix, it is a hope.
   =========================================================================== */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = path.resolve(process.argv[2] || path.join(__dirname, 'training v62.html'));

/* ---------------- runner ---------------- */
let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push([name, e.message]); console.log('  FAIL ' + name + '\n         ' + e.message); }
}
function eq(got, want, what) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) throw new Error((what || 'value') + ': got ' + a + ', want ' + b);
}
function ok(cond, what) { if (!cond) throw new Error(what || 'expected truthy'); }
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

/* ---------------- harness ----------------
   A fake window.storage that behaves like the real bridge: string values in,
   {key,value} out, null for a miss. The app's localStorage fallback is never
   exercised here on purpose — it is the path that is hardest to break. */
function makeStore(seed) {
  const mem = new Map(Object.entries(seed || {}));
  return {
    mem,
    api: {
      async get(k) { return mem.has(k) ? { key: k, value: mem.get(k), shared: false } : null; },
      async set(k, v) { mem.set(k, v); return { key: k, value: v, shared: false }; },
      async delete(k) { mem.delete(k); return { key: k, deleted: true }; },
      async list(p) { return { keys: [...mem.keys()].filter(k => !p || k.startsWith(p)) }; }
    }
  };
}

const html = fs.readFileSync(FILE, 'utf8');

async function boot(opts = {}) {
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.test/',
    beforeParse(win) {
      const s = makeStore(opts.seed);
      win.storage = s.api;
      win.__mem = s.mem;
      /* freeze the clock. `new Date()` with no args is the app's only reading of
         "now"; every other construction (weekStart+'T12:00:00') must keep
         working, so only the zero-arg form is pinned. */
      if (opts.now) {
        const Real = win.Date;
        const fixed = new Real(opts.now).getTime();
        class FakeDate extends Real {
          constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
          static now() { return fixed; }
        }
        win.Date = FakeDate;
      }
      win.addEventListener('error', e => errors.push(String((e.error && e.error.stack) || e.message)));
      win.console.error = (...a) => errors.push('console.error: ' + a.join(' '));
    }
  });
  const win = dom.window;
  win.onunhandledrejection = e => errors.push('unhandled rejection: ' + e.reason);
  for (let i = 0; i < 300 && win.document.body.dataset.ready !== '1'; i++) await tick(10);
  return { win, doc: win.document, errors, mem: win.__mem, close: () => dom.window.close() };
}

const STATE = o => JSON.stringify(Object.assign(
  { weekStart: '2026-08-31', checks: {}, weights: {}, metrics: {}, aero: [], bw: '', deload: false }, o));

const input = (win, el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };

/* =========================================================================
   1 · boot
   ========================================================================= */
async function suiteBoot() {
  console.log('\n[boot]');

  await test('boots clean, paints all three tabs, no errors', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    eq(t.doc.body.dataset.ready, '1', 'ready flag');
    eq(t.doc.querySelectorAll('[data-day]').length, 3, 'day cards');
    ok(t.doc.querySelectorAll('[data-item]').length > 20, 'exercise rows');
    t.doc.querySelector('[data-tab="aero"]').click(); await tick(40);
    ok(t.doc.querySelector('#aprog'), 'weekly progress card');
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(200);
    eq(t.doc.querySelectorAll('.hab').length, 2, 'habit cards');
    eq(t.errors, [], 'errors');
    t.close();
  });

  await test('every getElementById target exists on some tab', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const ids = [...new Set([...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
    /* #aprog is rendered by buildAero, so the check has to visit every tab
       before deciding an id is dangling. */
    const found = new Set();
    for (const tab of ['week', 'aero', 'daily']) {
      t.doc.querySelector('[data-tab="' + tab + '"]').click();
      await tick(tab === 'daily' ? 200 : 40);
      ids.forEach(i => { if (t.doc.getElementById(i)) found.add(i); });
    }
    eq(ids.filter(i => !found.has(i)), [], 'missing ids');
    t.close();
  });
}

/* =========================================================================
   2 · pure date maths
   ========================================================================= */
async function suiteDates() {
  console.log('\n[dates]');
  const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
  const win = t.win;

  await test('weekKeyOf matches ISO-8601 over 12 years', async () => {
    const ref = d => {
      const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
      const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
      const wk = Math.ceil(((x - y0) / 864e5 + 1) / 7);
      return x.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
    };
    let bad = 0, n = 0, first = null;
    for (let ms = Date.UTC(2019, 0, 1); ms < Date.UTC(2031, 0, 1); ms += 864e5) {
      const d = new Date(ms + 12 * 3600e3);   /* noon, clear of the 4h roll shift */
      n++;
      if (win.weekKeyOf(d) !== ref(d)) { bad++; first = first || [d.toISOString().slice(0, 10), win.weekKeyOf(d), ref(d)]; }
    }
    ok(n > 4000, 'sample size');
    eq(bad, 0, 'mismatches (first: ' + JSON.stringify(first) + ')');
  });

  await test('the 4am roll hour keeps 00:00–03:59 on the previous day', async () => {
    eq(win.dayKeyOf(new Date('2026-08-31T03:59:00+07:00')), '2026-08-30', 'before roll');
    eq(win.dayKeyOf(new Date('2026-08-31T04:01:00+07:00')), '2026-08-31', 'after roll');
  });

  await test('weekStartOf returns the Monday', async () => {
    eq(win.weekStartOf(new Date('2026-08-31T12:00:00+07:00')), '2026-08-31', 'Monday itself');
    eq(win.weekStartOf(new Date('2026-09-06T12:00:00+07:00')), '2026-08-31', 'Sunday');
  });

  await test('FIX-A · monthKeyBack does not clamp on a 31-day month', async () => {
    ok(typeof win.monthKeyBack === 'function', 'monthKeyBack exists (v62)');
    const d = new Date('2026-03-31T12:00:00+07:00');
    eq(win.monthKeyBack(d, 1), '2026-02', 'Mar 31 minus one month');
    eq(win.monthKeyBack(new Date('2026-05-31T12:00:00+07:00'), 1), '2026-04', 'May 31');
    /* 24 distinct keys, which is what buildDump walks */
    const base = new Date('2026-08-31T12:00:00+07:00');
    const keys = Array.from({ length: 24 }, (_, i) => win.monthKeyBack(base, i));
    eq(new Set(keys).size, 24, 'distinct months in a 24-step walk');
  });

  await test('num() rejects half-typed values', async () => {
    eq(win.num(''), null, 'empty'); eq(win.num(null), null, 'null');
    eq(win.num('abc'), null, 'text'); eq(win.num('5.'), 5, 'trailing dot'); eq(win.num('0'), 0, 'zero');
  });

  t.close();
}

/* =========================================================================
   3 · archive / rollover
   ========================================================================= */
async function suiteRollover() {
  console.log('\n[rollover]');

  await test('a stale week is archived and the new week starts clean', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: { 'trainweek:v11': STATE({ weekStart: '2026-08-24', checks: { h2: true }, weights: { h2: '40' }, aero: [{ s: 'a1', d: 1, t: 'run', min: '30', km: '5' }], bw: '70' }) }
    });
    const shard = JSON.parse(t.mem.get('trainweek:hist:2026'));
    const wk = Object.keys(shard.weeks)[0];
    eq(shard.weeks[wk].items, { h2: { done: 1, w: 40 } }, 'archived items');
    eq(shard.weeks[wk].aero, [{ t: 'run', d: 1, min: 30, km: 5 }], 'archived aero');
    eq(shard.weeks[wk].bw, 70, 'archived body weight');
    eq(JSON.parse(t.mem.get('trainweek:v11')).weekStart, '2026-08-31', 'new week start');
    eq(JSON.parse(t.mem.get('trainweek:hist:index')).years, [2026], 'year index');
    eq(t.errors, [], 'errors');
    t.close();
  });

  await test('a week with nothing in it is not archived', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00', seed: { 'trainweek:v11': STATE({ weekStart: '2026-08-24' }) } });
    ok(!t.mem.get('trainweek:hist:2026'), 'no shard written');
    t.close();
  });

  await test('an already-archived week is never overwritten', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: {
        'trainweek:v11': STATE({ weekStart: '2026-08-24', checks: { h2: true }, weights: { h2: '99' } }),
        'trainweek:hist:index': JSON.stringify({ years: [2026] }),
        'trainweek:hist:2026': JSON.stringify({ v: 1, weeks: { '2026-W35': { week: '2026-W35', items: { h2: { done: 1, w: 40 } } } } })
      }
    });
    const shard = JSON.parse(t.mem.get('trainweek:hist:2026'));
    eq(shard.weeks['2026-W35'].items.h2.w, 40, 'existing week untouched');
    t.close();
  });

  await test('a current week is left alone', async () => {
    const t = await boot({ now: '2026-09-02T09:00:00+07:00', seed: { 'trainweek:v11': STATE({ weekStart: '2026-08-31', checks: { h2: true } }) } });
    eq(t.win.eval('JSON.stringify(state.checks)'), '{"h2":true}', 'checks survive');
    ok(!t.mem.get('trainweek:hist:2026'), 'nothing archived');
    t.close();
  });
}

/* =========================================================================
   4 · resistance tab
   ========================================================================= */
async function suiteWeek() {
  console.log('\n[resistance]');

  await test('a checkbox writes state and moves the progress bar', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const cb = t.doc.querySelector('[data-check]');
    cb.click(); await tick(20);
    eq(t.win.eval('state.checks["' + cb.dataset.check + '"]'), true, 'checked');
    eq(cb.getAttribute('aria-pressed'), 'true', 'aria');
    ok(parseFloat(t.doc.querySelector('[data-prog="0"]').style.width) > 0, 'progress');
    t.close();
  });

  await test('"Finish the day" dims the header without ticking any exercise', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const day = t.doc.querySelector('[data-day="0"]');
    const cb = day.querySelector('[data-check]');
    const sd = day.querySelector('[data-stopday]');
    ok(sd.closest('.grp') === day.querySelector('.grp:last-of-type'), 'sits in its own group at the bottom');
    ok(!day.classList.contains('done'), 'not done at start');
    sd.click(); await tick(400);
    ok(day.classList.contains('done'), 'dimmed once finished');
    ok(sd.classList.contains('on'), 'box lit');
    eq(sd.getAttribute('aria-pressed'), 'true', 'aria');
    eq(t.win.eval('state.checks["' + cb.dataset.check + '"]'), undefined, 'no exercise was ticked');
    eq(JSON.parse(t.mem.get('trainweek:v11')).stopped, { '0': true }, 'persisted');
    sd.click(); await tick(20);
    ok(!day.classList.contains('done'), 'un-dimmed once reopened');
    ok(!sd.classList.contains('on'), 'box cleared');
    eq(sd.getAttribute('aria-pressed'), 'false', 'aria cleared');
    t.close();
  });

  await test('one superset box ticks every exercise in the pair, and untick clears it', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const g = t.doc.querySelector('[data-gcheck]');
    const ids = g.dataset.gcheck.split(',');
    ok(ids.length > 1, 'a real pair');
    g.click(); await tick(20);
    for (const id of ids) eq(t.win.eval('state.checks["' + id + '"]'), true, 'ticked ' + id);
    eq(t.doc.querySelector('[data-gcheck]').getAttribute('aria-pressed'), 'true', 'group aria');
    t.doc.querySelector('[data-gcheck]').click(); await tick(20);
    for (const id of ids) eq(t.win.eval('state.checks["' + id + '"]'), false, 'cleared ' + id);
    t.close();
  });

  await test('a half-done superset completes rather than clears', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const g = t.doc.querySelector('[data-gcheck]');
    const ids = g.dataset.gcheck.split(',');
    t.win.eval('state.checks["' + ids[0] + '"]=true');
    g.click(); await tick(20);
    for (const id of ids) eq(t.win.eval('state.checks["' + id + '"]'), true, 'completed ' + id);
    t.close();
  });

  await test('typing a weight ticks the exercise and persists it', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const w = t.doc.querySelector('[data-wt]');
    input(t.win, w, '42.5'); await tick(400);
    eq(t.win.eval('state.weights["' + w.dataset.wt + '"]'), '42.5', 'in memory');
    eq(JSON.parse(t.mem.get('trainweek:v11')).weights[w.dataset.wt], '42.5', 'on disk');
    eq(t.win.eval('state.checks["' + w.dataset.wt + '"]'), true, 'auto-ticked');
    t.close();
  });

  await test('clearing a mistyped weight does not untick', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const w = t.doc.querySelector('[data-wt]');
    input(t.win, w, '40'); await tick(20);
    input(t.win, w, ''); await tick(20);
    eq(t.win.eval('state.checks["' + w.dataset.wt + '"]'), true, 'still ticked');
    t.close();
  });

  await test('deload cuts the sore exercises and removes every weight field', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.getElementById('dltoggle').click(); await tick(40);
    eq(t.win.eval('state.deload'), true, 'flag');
    ok(t.doc.querySelectorAll('.item.cut').length > 0, 'cut rows shown');
    eq(t.doc.querySelectorAll('[data-wt]').length, 0, 'no weight inputs');
    eq(t.doc.getElementById('weekbar').hidden, false, 'deload banner');
    t.close();
  });

  await test('FIX-G · no group checkbox is rendered with nothing behind it', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.getElementById('dltoggle').click(); await tick(40);
    const empties = [...t.doc.querySelectorAll('[data-gcheck]')].filter(b => !b.dataset.gcheck);
    eq(empties.length, 0, 'dead group boxes');
    t.close();
  });
}

/* =========================================================================
   5 · aerobic tab
   ========================================================================= */
async function suiteAero() {
  console.log('\n[aerobic]');

  await test('add, log and delete a session', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.querySelector('[data-tab="aero"]').click(); await tick(40);
    t.doc.querySelector('[data-aadd="incline"]').click(); await tick(40);
    eq(t.win.eval('state.aero.length'), 1, 'added');
    input(t.win, t.doc.querySelector('[data-af][data-fk="min"]'), '50'); await tick(400);
    eq(t.win.eval('state.aero[0].min'), '50', 'logged');
    ok(/50 \/ \d+ min/.test(t.doc.getElementById('aprog').textContent), 'total updated');
    t.doc.querySelector('[data-adel]').click(); await tick(40);
    eq(t.win.eval('state.aero.length'), 0, 'deleted');
    eq(t.errors, [], 'errors');
    t.close();
  });

  await test('the copied exercise list includes this week\'s logged aerobic dose', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: { 'trainweek:v11': STATE({ aero: [{ s: 'a1', d: 1, t: 'incline', min: '45', kmh: '5.5', grade: '10' }] }) }
    });
    const txt = t.win.eval('planListText()');
    ok(/^Monday\n/.test(txt), 'resistance day still heads the list');
    ok(txt.includes('Tuesday\nIncline walk — 45 min · 5.5 km/h · 10 %'), 'aerobic session with its dose');
    ok(!txt.includes('Saturday'), 'a day with nothing logged is not printed');
    t.close();
  });

  await test('the 4x4 derives its minutes from the rounds', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    eq(t.win.aeroMinOf({ t: 'x4' }), 40, 'default 4 rounds');
    eq(t.win.aeroMinOf({ t: 'x4', sets: 3 }), 33, '3 rounds');
  });

  await test('a session logged as zero is not a session', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    eq(t.win.aeroCounts({ t: 'run', min: 0 }), false, 'zero minutes');
    eq(t.win.aeroCounts({ t: 'run' }), false, 'empty row');
    eq(t.win.aeroCounts({ t: 'run', min: 30 }), true, 'real run');
    eq(t.win.aeroCounts({ t: 'x4' }), true, '4x4 is whitelisted');
    t.close();
  });

  await test('the peak is the highest archived week, not the latest', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const recs = [
      { week: '2026-W34', aero: [{ t: 'run', min: 60 }] },
      { week: '2026-W33', aero: [{ t: 'run', min: 200 }] }
    ];
    eq(t.win.aeroPeak(recs).min, 200, 'peak');
    eq(t.win.aeroPeak([]).min, 120, 'no history falls back to 120');
    t.close();
  });

  await test('the incline card keeps its static speed/grade placeholders', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.querySelector('[data-tab="aero"]').click(); await tick(40);
    t.doc.querySelector('[data-aadd="incline"]').click(); await tick(40);
    eq(t.doc.querySelector('[data-af][data-fk="grade"]').placeholder, '12', 'grade');
    eq(t.doc.querySelector('[data-af][data-fk="kmh"]').placeholder, '5.5', 'speed');
    t.close();
  });

  await test('FIX-F · an unknown session type does not paint an empty card', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: { 'trainweek:v11': STATE({ aero: [{ s: 'a1', d: 1, t: 'swim', min: '30' }, { s: 'a2', d: 2, t: 'run', min: '20' }] }) }
    });
    t.doc.querySelector('[data-tab="aero"]').click(); await tick(60);
    eq(t.doc.querySelectorAll('.aday').length, 1, 'only the known session gets a card');
    eq(t.errors, [], 'errors');
    t.close();
  });

}

/* =========================================================================
   6 · routines tab
   ========================================================================= */
async function suiteDaily() {
  console.log('\n[routines]');

  await test('tapping a cell writes the day shard', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(200);
    const b = t.doc.querySelector('[data-hab]');
    const id = b.dataset.hab, day = b.dataset.day;
    b.click(); await tick(300);
    eq(JSON.parse(t.mem.get('daily:log:' + day.slice(0, 7))).days[day][id], 1, 'stored');
    t.close();
  });

  await test('two taps inside one round trip do not erase each other', async () => {
    /* mid-month, so every cell in the visible week lives in the same shard —
       this is the coalescing bug v50 fixed, and the regression guard for it. */
    const t = await boot({ now: '2026-08-12T09:00:00+07:00', seed: { 'trainweek:v11': STATE({ weekStart: '2026-08-10' }) } });
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(200);
    const pick = i => [...t.doc.querySelectorAll('[data-hab]')].filter(b => b.dataset.day.startsWith('2026-08'))[i];
    const a = pick(0), b = pick(1);
    const keyA = [a.dataset.hab, a.dataset.day], keyB = [b.dataset.hab, b.dataset.day];
    a.click();                                   /* second tap lands inside the first write */
    pick(1).click();
    await tick(500);
    const days = JSON.parse(t.mem.get('daily:log:2026-08')).days;
    eq(days[keyA[1]][keyA[0]], 1, 'first tap survived');
    eq(days[keyB[1]][keyB[0]], 1, 'second tap survived');
    t.close();
  });

  await test('a quality score writes, and tapping the lit number clears it', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(200);
    const s = t.doc.querySelector('[data-score][data-v="4"]');
    s.click(); await tick(300);
    eq(t.win.eval('dayLog[dayKeyOf(now())]["' + s.dataset.score + '"].score'), 4, 'set');
    t.doc.querySelector('[data-score][data-v="4"]').click(); await tick(300);
    eq(t.win.eval('typeof (dayLog[dayKeyOf(now())]["' + s.dataset.score + '"]||{}).score'), 'undefined', 'cleared');
    t.close();
  });

  await test('FIX-A · the previous month is loaded on the 29th-31st', async () => {
    /* 29 Mar 2026: setMonth(-1) asks for 29 Feb, which does not exist in a
       non-leap year, so the old code overflowed forward to 1 Mar and read the
       CURRENT month twice. The 30-day density window reaches back to 27 Feb, so
       the miss is visible in the number on the card as well as in dayLog. */
    const t = await boot({
      now: '2026-03-29T09:00:00+07:00',
      seed: {
        'trainweek:v11': STATE({ weekStart: '2026-03-23' }),
        'daily:log:2026-02': JSON.stringify({ v: 1, days: { '2026-02-27': { x3: 1 }, '2026-02-28': { x3: 1 } } }),
        'daily:log:2026-03': JSON.stringify({ v: 1, days: { '2026-03-28': { x3: 1 } } })
      }
    });
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(300);
    eq(JSON.parse(t.win.eval('JSON.stringify(Object.keys(dayLog).sort())')),
       ['2026-02-27', '2026-02-28', '2026-03-28'], 'February is present');
    /* the window is the 30 days ending today: 28 Feb – 29 Mar. 27 Feb is loaded
       into dayLog but sits one day outside it, which is why this is 2 and not 3. */
    eq(t.doc.querySelector('.density').textContent.trim(), '2 / 30', '30-day density');
    t.close();
  });

  await test('FIX-A · the same miss on the 31st, where the window shows only dayLog', async () => {
    const t = await boot({
      now: '2026-03-31T09:00:00+07:00',
      seed: {
        'trainweek:v11': STATE({ weekStart: '2026-03-30' }),
        'daily:log:2026-02': JSON.stringify({ v: 1, days: { '2026-02-25': { x3: 1 } } }),
        'daily:log:2026-03': JSON.stringify({ v: 1, days: { '2026-03-30': { x3: 1 } } })
      }
    });
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(300);
    eq(JSON.parse(t.win.eval('JSON.stringify(Object.keys(dayLog).sort())')),
       ['2026-02-25', '2026-03-30'], 'February is present');
    t.close();
  });
}

/* =========================================================================
   7 · export / import
   ========================================================================= */
async function suiteTransfer() {
  console.log('\n[transfer]');

  await test('FIX-B · an export on the 31st covers 24 distinct months', async () => {
    const seed = { 'trainweek:v11': STATE({}) };
    for (let m = 1; m <= 12; m++) seed['daily:log:2026-' + String(m).padStart(2, '0')] = JSON.stringify({ v: 1, days: { ['2026-' + String(m).padStart(2, '0') + '-10']: { x1: 1 } } });
    const t = await boot({ now: '2026-08-31T09:00:00+07:00', seed });
    t.doc.getElementById('export').click(); await tick(400);
    const dump = JSON.parse(t.doc.getElementById('ioout').value);
    const months = Object.keys(dump.daily).sort();
    eq(months, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'], 'every stored month present');
    eq(t.errors, [], 'errors');
    t.close();
  });

  await test('export then import round-trips history and daily log', async () => {
    const dump = {
      exported: '2026-08-01T00:00:00Z', app: 'training-week-v52',
      current: { weekStart: '2026-08-31', checks: { h2: true }, weights: { h2: '55' }, metrics: {}, aero: [], bw: '71', deload: false },
      history: { 2026: { v: 1, weeks: { '2026-W20': { week: '2026-W20', items: { h2: { done: 1, w: 50 } } } } } },
      daily: { '2026-08': { v: 1, days: { '2026-08-05': { x3: 1 } } } }
    };
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.getElementById('import').click(); await tick(40);
    t.doc.getElementById('ioin').value = JSON.stringify(dump);
    t.doc.querySelector('[data-iocheck]').click(); await tick(40);
    t.doc.querySelector('[data-iogo]').click(); await tick(600);
    eq(t.win.eval('state.bw'), '71', 'current week');
    eq(t.win.eval('histRecs.length'), 1, 'history');
    eq(t.errors, [], 'errors');
    t.close();
  });

  await test('import refuses foreign and malformed JSON', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.getElementById('import').click(); await tick(40);
    t.doc.getElementById('ioin').value = '{not json';
    t.doc.querySelector('[data-iocheck]').click(); await tick(40);
    ok(/not readable/i.test(t.doc.querySelector('[data-iomsg]').textContent), 'malformed rejected');
    t.doc.getElementById('ioin').value = '{"app":"something-else"}';
    t.doc.querySelector('[data-iocheck]').click(); await tick(40);
    ok(/not an export/i.test(t.doc.querySelector('[data-iomsg]').textContent), 'foreign rejected');
    t.close();
  });

  await test('FIX-E · import writes a numeric, deduped year index', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: { 'trainweek:v11': STATE({}), 'trainweek:hist:index': JSON.stringify({ years: ['2026'] }) }
    });
    t.doc.getElementById('import').click(); await tick(40);
    t.doc.getElementById('ioin').value = JSON.stringify({
      app: 'training-week-v62', exported: '2026-08-01',
      history: { 2026: { v: 1, weeks: { '2026-W21': { week: '2026-W21', items: {} } } } }, daily: {}
    });
    t.doc.querySelector('[data-iocheck]').click(); await tick(40);
    t.doc.querySelector('[data-iogo]').click(); await tick(600);
    eq(JSON.parse(t.mem.get('trainweek:hist:index')).years, [2026], 'one numeric year');
    t.close();
  });
}

/* =========================================================================
   8 · durability — the bugs that lose data quietly
   ========================================================================= */
async function suiteDurability() {
  console.log('\n[durability]');

  await test('FIX-C · backgrounding flushes a weight typed 100ms ago', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const w = t.doc.querySelector('[data-wt]');
    input(t.win, w, '42');
    await tick(100);                                  /* inside the 300ms debounce */
    Object.defineProperty(t.doc, 'hidden', { value: true, configurable: true });
    t.doc.dispatchEvent(new t.win.Event('visibilitychange'));
    await tick(20);                                   /* iOS would suspend timers here */
    const stored = JSON.parse(t.mem.get('trainweek:v11') || '{}').weights || {};
    eq(stored[w.dataset.wt], '42', 'written before the timer could have fired');
    t.close();
  });

  await test('FIX-C · pagehide flushes too', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const w = t.doc.querySelector('[data-wt]');
    input(t.win, w, '37');
    await tick(50);
    t.win.dispatchEvent(new t.win.Event('pagehide'));
    await tick(20);
    eq((JSON.parse(t.mem.get('trainweek:v11') || '{}').weights || {})[w.dataset.wt], '37', 'stored');
    t.close();
  });

  await test('FIX-C · backgrounding flushes a habit field too', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(200);
    const f = t.doc.querySelector('[data-hf]');
    input(t.win, f, '15');
    await tick(100);
    Object.defineProperty(t.doc, 'hidden', { value: true, configurable: true });
    t.doc.dispatchEvent(new t.win.Event('visibilitychange'));
    await tick(60);
    const day = t.win.eval('dayKeyOf(now())');
    const sh = JSON.parse(t.mem.get('daily:log:' + day.slice(0, 7)) || '{}');
    eq(((sh.days || {})[day] || {})[f.dataset.hf].min, 15, 'habit field written');
    t.close();
  });

  await test('FIX-D · a corrupt dump does not crash the app or silence writes', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: {
        'trainweek:v11': JSON.stringify({ weekStart: '2026-08-31', checks: null, weights: 'oops', metrics: 0, aero: [null, { s: 'a1', d: 1, t: 'run', min: '20' }, 'junk'], bw: {}, deload: 1 })
      }
    });
    eq(t.doc.body.dataset.ready, '1', 'still booted');
    eq(t.win.eval('typeof state.weights'), 'object', 'weights coerced to an object');
    eq(t.win.eval('state.aero.length'), 1, 'junk aero entries dropped');
    eq(t.win.eval('state.bw'), '', 'body weight coerced');
    t.doc.querySelector('[data-tab="aero"]').click(); await tick(60);
    eq(t.errors, [], 'aerobic tab does not throw');
    /* and a weight typed after loading a corrupt blob must actually stick */
    t.doc.querySelector('[data-tab="week"]').click(); await tick(40);
    const w = t.doc.querySelector('[data-wt]');
    if (w) { input(t.win, w, '33'); await tick(400); eq(t.win.eval('state.weights["' + w.dataset.wt + '"]'), '33', 'weight written'); }
    t.close();
  });

  await test('FIX-E · a duplicated year in the index does not duplicate history', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: {
        'trainweek:v11': STATE({}),
        'trainweek:hist:index': JSON.stringify({ years: ['2026', 2026] }),
        'trainweek:hist:2026': JSON.stringify({ v: 1, weeks: { '2026-W30': { week: '2026-W30', items: { h2: { done: 1, w: 40 } }, aero: [{ t: 'incline', min: 50 }] } } })
      }
    });
    eq(t.win.eval('histRecs.length'), 1, 'one record');
    eq(t.win.eval('histRecs.map(r=>r.week).join(",")'), '2026-W30', 'one week');
    t.close();
  });

  await test('an unreadable shard for the current year freezes the rollover and says so', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: {
        'trainweek:v11': STATE({ weekStart: '2026-08-24', checks: { h2: true } }),
        'trainweek:hist:index': JSON.stringify({ years: [2026] })
        /* the 2026 shard the index promises is missing */
      }
    });
    eq(t.win.eval('histOK'), false, 'failed closed');
    eq(t.win.eval('state.weekStart'), '2026-08-24', 'week stays open');
    ok(/History incomplete/.test(t.doc.getElementById('dlintro').textContent), 'warning shown');
    t.close();
  });

  await test('an unreadable OLD shard does not freeze the rollover', async () => {
    const t = await boot({
      now: '2026-08-31T09:00:00+07:00',
      seed: {
        'trainweek:v11': STATE({ weekStart: '2026-08-24', checks: { h2: true } }),
        'trainweek:hist:index': JSON.stringify({ years: [2024, 2026] }),
        'trainweek:hist:2026': JSON.stringify({ v: 1, weeks: {} })
      }
    });
    eq(t.win.eval('histOK'), true, 'not frozen');
    eq(t.win.eval('state.weekStart'), '2026-08-31', 'rolled over');
    t.close();
  });
}

/* =========================================================================
   9 · markup contracts
   ========================================================================= */
async function suiteMarkup() {
  console.log('\n[markup]');

  await test('no duplicate element ids anywhere', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const check = where => {
      const seen = new Set(), dup = [];
      t.doc.querySelectorAll('[id]').forEach(el => { if (seen.has(el.id)) dup.push(el.id); seen.add(el.id); });
      eq(dup, [], 'duplicates on ' + where);
    };
    check('week');
    t.doc.querySelector('[data-tab="aero"]').click(); await tick(40); check('aero');
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(200); check('daily');
    t.close();
  });

  await test('every plan id has a deload rule or falls through to the default', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const bad = t.win.eval(`(()=>{const out=[];for(const d of PLAN)for(const it of d.items){const r=deloadOf(it);if(!r||(!r.dose&&!r.skip))out.push(it.id);}return JSON.stringify(out);})()`);
    eq(JSON.parse(bad), [], 'items with no deload outcome');
    t.close();
  });

  await test('no deload rule points at an id that left the plan', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const orphans = t.win.eval(`(()=>{const ids=new Set();for(const d of PLAN)for(const it of d.items)ids.add(it.id);return JSON.stringify(Object.keys(DELOAD_RULES).filter(k=>!ids.has(k)));})()`);
    eq(JSON.parse(orphans), [], 'dead deload rules');
    t.close();
  });

  await test('plan ids are unique', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    const dup = t.win.eval(`(()=>{const s=new Set(),d=[];for(const x of PLAN)for(const it of x.items){if(s.has(it.id))d.push(it.id);s.add(it.id);}return JSON.stringify(d);})()`);
    eq(JSON.parse(dup), [], 'duplicate exercise ids');
    t.close();
  });

  await test('the tabs are wired to their panels both ways', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    for (const b of t.doc.querySelectorAll('[role="tab"]')) {
      const pane = t.doc.getElementById(b.getAttribute('aria-controls'));
      ok(pane, 'panel exists for ' + b.dataset.tab);
      eq(pane.getAttribute('role'), 'tabpanel', 'role on ' + b.dataset.tab);
      eq(t.doc.getElementById(pane.getAttribute('aria-labelledby')), b, 'labelled by its tab');
    }
    t.close();
  });

  await test('no <label> wraps a button', async () => {
    const t = await boot({ now: '2026-08-31T09:00:00+07:00' });
    t.doc.querySelector('[data-tab="daily"]').click(); await tick(200);
    eq(t.doc.querySelectorAll('label button').length, 0, 'labels wrapping buttons');
    t.close();
  });

  await test('the working-rules comment is present', async () => {
    ok(/WORKING RULES/.test(html), 'rules comment');
    ok(/VERSION EVERY FILE/.test(html), 'versioning rule');
  });
}

/* =========================================================================
   run
   ========================================================================= */
(async () => {
  console.log('testing: ' + FILE);
  console.log('tz: ' + (process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone));
  await suiteBoot();
  await suiteDates();
  await suiteRollover();
  await suiteWeek();
  await suiteAero();
  await suiteDaily();
  await suiteTransfer();
  await suiteDurability();
  await suiteMarkup();
  console.log('\n' + '='.repeat(58));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nfailures:'); failures.forEach(([n, m]) => console.log('  · ' + n + '\n      ' + m)); }
  console.log('='.repeat(58));
  process.exit(fail ? 1 : 0);
})();
