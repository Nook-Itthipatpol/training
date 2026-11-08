// Room shell: floor planks, plaster walls with shadow gap + skirting, ceiling with downlights,
// veneer feature wall with LED reveal channels and top cove.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export async function build({ THREE, dims, mats }) {
  const g = new THREE.Group();
  g.name = 'shell';
  const R = dims.room, F = dims.featureWall;
  const HW = R.width / 2, L = R.length, H = R.height;
  const T = 0.1; // shell thickness (watertight corners)

  // deterministic rng
  let seed = 1337;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // world-scale UVs: (su, sv) in uv-units per metre, (ou, ov) offsets. c = world centre of the geometry.
  function worldUV(geo, c, su, sv, ou = 0, ov = 0) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + c[0], y = p.getY(i) + c[1], z = p.getZ(i) + c[2];
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u * su + ou; uv[i * 2 + 1] = v * sv + ov;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }

  // box given by min/max corners
  function boxGeo(x0, x1, y0, y1, z0, z1, r = 0, su = 0.5, sv = 0.5, ou = 0, ov = 0) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    worldUV(geo, c, su, sv, ou, ov);
    geo.translate(c[0], c[1], c[2]);
    return geo;
  }
  const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; g.add(m); return m; };
  const tint = (base, rgb) => { const m = base.clone(); m.color.setRGB(rgb[0], rgb[1], rgb[2]); return m; };

  // ------------------------------------------------------------------ FLOOR
  const woodSet = mats.sets.woodSet;
  const floorTex = woodSet({ size: 1024, light: [206, 164, 118], dark: [166, 124, 86], seed: 31, rings: 12, roughBase: 0.5, normal: 1.8 });
  const floorBase = new THREE.MeshPhysicalMaterial({ ...floorTex, color: 0xffffff, roughness: 1,
    clearcoat: 0.18, clearcoatRoughness: 0.4 });
  const tones = [[1, 1, 1], [0.92, 0.9, 0.88], [1.05, 1.02, 0.97], [0.86, 0.83, 0.8], [0.97, 0.94, 0.92], [1.0, 0.96, 0.9]]
    .map((t) => tint(floorBase, t));
  const plankGeos = tones.map(() => []);
  const COLS = 14, pw = R.width / COLS, gap = 0.0016;
  for (let c = 0; c < COLS; c++) {
    let z = 0;
    let len = 0.7 + rnd() * 1.1; // staggered first board
    while (z < L - 1e-4) {
      const z1 = Math.min(L, z + len);
      const ti = Math.floor(rnd() * tones.length);
      const x0 = -HW + c * pw + gap / 2, x1 = -HW + (c + 1) * pw - gap / 2;
      const zz0 = z + gap / 2, zz1 = z1 - gap / 2;
      if (zz1 - zz0 > 0.05) {
        plankGeos[ti].push(boxGeo(x0, x1, -0.012, 0, zz0, zz1, 0.0022, 1 / 0.6, 1 / 1.8, rnd() * 10, rnd() * 10));
      }
      z = z1;
      len = 0.9 + rnd() * 1.2;
    }
  }
  plankGeos.forEach((arr, i) => { if (arr.length) add(mergeGeometries(arr), tones[i], 'floorPlanks' + i); });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.85 });
  add(boxGeo(-HW - T, HW + T, -T, -0.0105, -T, L + T), darkMat, 'floorUnderlay');

  // ------------------------------------------------------------------ WALLS (plaster)
  const plaster = mats.plaster;
  const zA = -T, zB = L + T;
  const wl = R.wallLineY, gh = 0.004, gd = 0.008; // groove half-height / depth
  for (const s of [-1, 1]) {
    const xin = s * HW, xout = s * (HW + T), xg = s * (HW + gd);
    const lo = (a, b) => (a < b ? [a, b] : [b, a]);
    const [a0, a1] = lo(xin, xout), [g0, g1] = lo(xg, xout);
    add(boxGeo(a0, a1, -T, wl - gh, zA, zB), plaster, 'wallLow');
    add(boxGeo(g0, g1, wl - gh, wl + gh, zA, zB), plaster, 'wallGroove');
    add(boxGeo(a0, a1, wl + gh, H + T, zA, zB), plaster, 'wallUp');
  }
  // door wall (behind camera)
  add(boxGeo(-HW - T, HW + T, -T, H + T, L, L + T), plaster, 'doorWall');
  // back structural plate (dark: shows in panel joints)
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1f150e, roughness: 0.8 });
  add(boxGeo(-HW - T, HW + T, -T, F.coveY, -T, 0), plateMat, 'backPlate');
  // plaster above the cove line on the back wall
  add(boxGeo(-HW, HW, F.coveY - 0.001, H + T, -T, 0.004), mats.plasterCeiling, 'backWallUpper');

  // skirting
  const skMat = plaster.clone(); skMat.color.setRGB(0.8, 0.77, 0.74); skMat.roughness = 1;
  const skH = R.skirtingH, skT = 0.012;
  for (const s of [-1, 1]) {
    add(boxGeo(s > 0 ? HW - skT : -HW, s > 0 ? HW : -HW + skT, 0, skH, F.panelDepth, L - skT, 0.0025, 0.5, 0.5), skMat, 'skirt');
  }
  add(boxGeo(-HW, HW, 0, skH, L - skT, L, 0.0025, 0.5, 0.5), skMat, 'skirtDoor');

  // ------------------------------------------------------------------ CEILING
  {
    const shape = new THREE.Shape();
    shape.moveTo(-HW - T, -T); shape.lineTo(HW + T, -T); shape.lineTo(HW + T, L + T); shape.lineTo(-HW - T, L + T); shape.closePath();
    const hr = 0.04;
    for (const d of dims.anchors.downlights) {
      const h = new THREE.Path(); h.absarc(d.x, d.z, hr, 0, Math.PI * 2, true); shape.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 32 });
    geo.rotateX(Math.PI / 2); geo.translate(0, H + T, 0);
    // simple planar UV
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.5; uv[i * 2 + 1] = p.getZ(i) * 0.5; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    add(geo, mats.plasterCeiling, 'ceiling');

    // downlights
    const trimMat = mats.whitePlastic.clone(); trimMat.roughness = 0.4; trimMat.side = THREE.DoubleSide;
    const profile = [[0.0385, H + 0.0005], [0.0385, H - 0.003], [0.0465, H - 0.003], [0.048, H - 0.0015], [0.048, H + 0.0005]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const trimGeo = new THREE.LatheGeometry(profile, 64);
    const reflGeo = new THREE.CylinderGeometry(0.0385, 0.0385, 0.05, 48, 1, true);
    const discGeo = new THREE.CircleGeometry(0.036, 48); discGeo.rotateX(Math.PI / 2);
    const lamp = mats.ledDiffuser.clone(); lamp.emissiveIntensity = 40; lamp.side = THREE.DoubleSide;
    for (const d of dims.anchors.downlights) {
      const trim = new THREE.Mesh(trimGeo, trimMat); trim.position.set(d.x, 0, d.z); g.add(trim);
      const refl = new THREE.Mesh(reflGeo, trimMat); refl.position.set(d.x, H + 0.025, d.z); g.add(refl);
      const disc = new THREE.Mesh(discGeo, lamp); disc.position.set(d.x, H + 0.04, d.z); g.add(disc);
    }
  }

  // ------------------------------------------------------------------ FEATURE WALL
  const veneerTex = woodSet({ size: 1024, light: [192, 148, 106], dark: [160, 118, 82], seed: 8, rings: 18, roughBase: 0.5, normal: 1.4 });
  const veneerBase = new THREE.MeshPhysicalMaterial({ ...veneerTex, color: 0xffffff, roughness: 1,
    clearcoat: 0.1, clearcoatRoughness: 0.45 });
  const vTones = [[1, 1, 1], [0.94, 0.92, 0.9], [1.05, 1.03, 0.99], [0.9, 0.87, 0.84]].map((t) => tint(veneerBase, t));
  const finMat = tint(veneerBase, [0.84, 0.8, 0.77]);
  const pd = F.panelDepth, gp = 0.003;
  const fins = F.ledStripsX, fhw = 0.0275;
  const topY = F.coveY;

  // panel columns between fin centres
  const edges = [-HW, ...fins, HW];
  let toneI = 0;
  const veneerGeo = vTones.map(() => []);
  for (let i = 0; i < edges.length - 1; i++) {
    let segs = [[edges[i], edges[i + 1]]];
    if (edges[i + 1] - edges[i] > 0.9) { const m = (edges[i] + edges[i + 1]) / 2; segs = [[edges[i], m], [m, edges[i + 1]]]; }
    const outer = i === 0 || i === edges.length - 2;
    const joints = outer || edges[i + 1] - edges[i] < 0.5 ? [0, 1.1, 2.6, 2.74, topY] : [0, 1.1, 2.6, topY];
    for (const [xa, xb] of segs) {
      const x0 = xa + (xa === -HW ? 0 : gp / 2), x1 = xb - (xb === HW ? 0 : gp / 2);
      for (let j = 0; j < joints.length - 1; j++) {
        const y0 = joints[j] + (j === 0 ? 0 : gp / 2), y1 = joints[j + 1] - (j === joints.length - 2 ? 0 : gp / 2);
        const ti = (toneI++) % vTones.length;
        veneerGeo[ti].push(boxGeo(x0, x1, y0, y1, 0, pd, 0.0015, 1 / 0.9, 1 / 2.4, rnd() * 10, rnd() * 10));
      }
    }
  }
  veneerGeo.forEach((arr, i) => { if (arr.length) add(mergeGeometries(arr), vTones[i], 'veneer' + i); });

  // fins (proud pilasters) with LED reveal channels
  const chW = 0.025, finZ1 = pd + 0.025;
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0907, roughness: 0.6 });
  const led = mats.led.clone(); led.emissiveIntensity = 14;
  const finGeos = [], ledGeos = [], chanGeos = [];
  for (const cx of fins) {
    const sideW = fhw - chW / 2;
    finGeos.push(boxGeo(cx - fhw, cx + fhw, 0, F.ledStripBottom, pd, finZ1, 0.002, 1 / 0.9, 1 / 2.4, rnd() * 5, rnd() * 5));
    finGeos.push(boxGeo(cx - fhw, cx - fhw + sideW, F.ledStripBottom, topY, pd, finZ1, 0.002, 1 / 0.9, 1 / 2.4, rnd() * 5, rnd() * 5));
    finGeos.push(boxGeo(cx + chW / 2, cx + fhw, F.ledStripBottom, topY, pd, finZ1, 0.002, 1 / 0.9, 1 / 2.4, rnd() * 5, rnd() * 5));
    chanGeos.push(boxGeo(cx - chW / 2, cx + chW / 2, F.ledStripBottom, topY, pd, pd + 0.003));
    ledGeos.push(boxGeo(cx - 0.005, cx + 0.005, F.ledStripBottom + 0.01, topY - 0.01, pd + 0.003, pd + 0.0065, 0.0005));
  }
  add(mergeGeometries(finGeos), finMat, 'fins');
  add(mergeGeometries(chanGeos), dark, 'ledChannels');
  add(mergeGeometries(ledGeos), led, 'ledStrips');

  // top cove: lid shelf with hidden downward-facing LED strip
  const lidY0 = topY + 0.05, lidZ = 0.14;
  add(boxGeo(-HW, HW, lidY0, H, 0, lidZ, 0.002, 0.5, 0.5), mats.plasterCeiling, 'coveLid');
  const coveLed = mats.led.clone(); coveLed.emissiveIntensity = 22;
  add(boxGeo(-HW + 0.01, HW - 0.01, lidY0 - 0.004, lidY0, 0.05, 0.075), coveLed, 'coveLed');

  return g;
}
