// Examination couch (back wall) + wall-hung walnut vanity with ceramic basin and chrome mixer.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export async function build(ctx) {
  const { THREE, dims, mats } = ctx;
  const root = new THREE.Group();
  root.name = 'bed-sink';
  const A = dims.anchors;
  const PM = (o) => new THREE.MeshPhysicalMaterial(o);

  // ---------------------------------------------------------------- helpers
  // World-space box-projected UVs so textures keep real-world scale.
  // grain: 'x' | 'z' = direction the wood grain (texture v axis) should run.
  function worldUV(geo, tile, grain = 'x') {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { // horizontal face
        if (grain === 'x') { u = z; v = x; } else { u = x; v = z; }
      } else if (az >= ax) {      // front/back face
        u = y; v = x;
      } else {                    // side face
        u = y; v = z;
      }
      uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }

  function mesh(geo, mat, x = 0, y = 0, z = 0, parent = root) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Rounded box placed in world space (baked) with world UVs.
  function rbox(w, h, d, r, x, y, z, mat, { tile = 0, grain = 'x', seg = 3 } = {}) {
    const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
    g.translate(x, y, z);
    if (tile) worldUV(g, tile, grain);
    return mesh(g, mat);
  }

  // Closed rounded-rectangle path (xz plane) at height y -> tube (piping / seam).
  function pipingLoop(hw, hd, rc, y, tubeR, mat, parent = root, cx = 0, cz = 0) {
    const pts = [];
    const arc = 14;
    const corners = [
      [hw - rc, hd - rc, 0], [-(hw - rc), hd - rc, Math.PI / 2],
      [-(hw - rc), -(hd - rc), Math.PI], [hw - rc, -(hd - rc), Math.PI * 1.5],
    ];
    // straight runs sampled too so the tube stays round
    for (let c = 0; c < 4; c++) {
      const [ox, oz, a0] = corners[c];
      for (let i = 0; i <= arc; i++) {
        const a = a0 + (i / arc) * Math.PI / 2;
        pts.push(new THREE.Vector3(ox + Math.cos(a) * rc, y, oz + Math.sin(a) * rc));
      }
    }
    // add mid points on long straights for smoother Catmull-Rom
    const dense = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      dense.push(a);
      if (a.distanceTo(b) > 0.05) {
        const k = Math.ceil(a.distanceTo(b) / 0.05);
        for (let j = 1; j < k; j++) dense.push(a.clone().lerp(b, j / k));
      }
    }
    const curve = new THREE.CatmullRomCurve3(dense, true, 'centripetal');
    const g = new THREE.TubeGeometry(curve, dense.length * 2, tubeR, 8, true);
    g.translate(cx, 0, cz);
    return mesh(g, mat, 0, 0, 0, parent);
  }

  // ================================================================= EXAM COUCH
  const bed = A.examBed;
  const bw = bed.w, bx = bed.x;
  const backZ = 0.05, bd = bed.d;           // 1 cm clear of the 4 cm wall panels
  const frontZ = backZ + bd;
  const zc = backZ + bd / 2;

  const lacquer = PM({ color: 0xe3ded5, roughness: 0.42, clearcoat: 0.18, clearcoatRoughness: 0.35 });
  const lacquerDark = PM({ color: 0x3b3731, roughness: 0.55 });
  const gapDark = PM({ color: 0x1e1b18, roughness: 0.8 });
  const slotMat = PM({ color: 0x2a2622, roughness: 0.6 });

  // pad leatherette: lighter, slightly glossier than chairs
  const ls = mats.sets.leatherSet({ color: [201, 178, 144], seed: 17, repeat: [1, 1] });
  const leatherBed = PM({
    ...ls, roughness: 0.78, clearcoat: 0.22, clearcoatRoughness: 0.38,
    sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xe6d3b4),
  });
  const seamMat = PM({ color: 0x8f7a5c, roughness: 0.7 });

  // plinth (recessed) 7 cm high
  const plinthH = 0.07;
  rbox(bw - 0.07, plinthH, bd - 0.07, 0.006, bx, plinthH / 2, zc - 0.0, lacquerDark);

  // carcass
  const cabY0 = plinthH, cabY1 = 0.56, cabH = cabY1 - cabY0;
  const frontT = 0.018;
  rbox(bw, cabH, bd - frontT, 0.006, bx, cabY0 + cabH / 2, backZ + (bd - frontT) / 2, lacquer, { seg: 3 });
  // dark liner visible in the shadow gaps
  rbox(bw - 0.012, cabH - 0.012, 0.004, 0.001, bx, cabY0 + cabH / 2, frontZ - frontT, gapDark, { seg: 1 });

  // fronts: door | two drawers | door, 4 mm gaps
  const gap = 0.004, margin = 0.006;
  const availW = bw - 2 * margin, availH = cabH - 2 * margin;
  const fw = (availW - 2 * gap) / 3;
  const fx0 = bx - availW / 2;
  const fzc = frontZ - frontT / 2;
  const addFront = (x0, y0, w, h, slot) => {
    const cx = x0 + w / 2, cy = y0 + h / 2;
    rbox(w, h, frontT, 0.0035, cx, cy, fzc, lacquer, { seg: 3 });
    // recessed pull: dark slot with a lit lower lip
    if (slot === 'top') {
      rbox(0.12, 0.014, 0.003, 0.0025, cx, y0 + h - 0.026, frontZ + 0.0002, slotMat, { seg: 2 });
    } else {
      const sx = slot === 'left' ? x0 + 0.04 : x0 + w - 0.04;
      rbox(0.014, 0.11, 0.003, 0.0025, sx, y0 + h - 0.11, frontZ + 0.0002, slotMat, { seg: 2 });
    }
  };
  const y0 = cabY0 + margin;
  addFront(fx0, y0, fw, availH, 'left');                          // left door (slot at its right edge? mirrored below)
  const dh = (availH - gap) / 2;
  addFront(fx0 + fw + gap, y0, fw, dh, 'top');                    // lower drawer
  addFront(fx0 + fw + gap, y0 + dh + gap, fw, dh, 'top');         // upper drawer
  addFront(fx0 + 2 * (fw + gap), y0, fw, availH, 'right');        // right door

  // upholstered pad ~10.5 cm
  const padH = 0.105, padW = bw + 0.02, padD = bd - 0.005, padR = 0.042;
  const padY = cabY1 + padH / 2;
  const padZ = backZ - 0.005 + padD / 2;
  {
    const g = new RoundedBoxGeometry(padW, padH, padD, 14, padR);
    // soft crown on the upper surface
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = Math.max(0, y / (padH / 2));
      const wgt = Math.pow(t, 2) * (1 - Math.pow(x / (padW / 2), 2)) * (1 - Math.pow(z / (padD / 2), 2));
      p.setY(i, y + 0.007 * wgt);
    }
    g.translate(bx, padY, padZ);
    worldUV(g, 0.32);
    mesh(g, leatherBed);
  }
  // piping seam around the pad (mid-height) and a headrest-hinge seam on top
  pipingLoop(padW / 2 + 0.0008, padD / 2 + 0.0008, padR, padY + 0.004, 0.0042, leatherBed, root, bx, padZ);
  {
    const sx = bx + padW / 2 - 0.50;       // headrest section break
    const g = new THREE.CylinderGeometry(0.0018, 0.0018, padD - 2 * padR - 0.02, 8);
    g.rotateX(Math.PI / 2);
    g.translate(sx, cabY1 + padH + 0.0036, padZ);
    mesh(g, seamMat);
    // top-stitch line along the seam
    const g2 = new THREE.CylinderGeometry(0.0009, 0.0009, padD - 2 * padR - 0.02, 6);
    g2.rotateX(Math.PI / 2);
    g2.translate(sx + 0.008, cabY1 + padH + 0.0034, padZ);
    mesh(g2, seamMat);
  }

  // headrest pillow (soft bolster/wedge) at the right end
  {
    const pw = 0.42, ph = 0.10, pd = 0.30;
    const g = new RoundedBoxGeometry(pw, ph, pd, 14, 0.045);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nx = x / (pw / 2), nz = z / (pd / 2);
      const e = Math.min(1, (nx * nx + nz * nz) / 1.6);
      let yy = y * (1 - 0.55 * e * e);
      yy += Math.sign(y) * 0.012 * (1 - nx * nx) * (1 - nz * nz);   // pillowy middle
      p.setY(i, yy);
    }
    g.computeVertexNormals();
    worldUV(g, 0.3);
    const pil = new THREE.Group();
    const m = mesh(g, leatherBed, 0, 0, 0, pil);
    // piping around the seam line
    pipingLoop(pw / 2 - 0.004, pd / 2 - 0.004, 0.05, 0, 0.0035, leatherBed, pil);
    pil.position.set(bx + bw / 2 - 0.25, cabY1 + padH + 0.034, padZ + 0.0);
    pil.rotation.set(0, -0.06, 0.10, 'YXZ');
    root.add(pil);
  }

  // ================================================================= VANITY
  const van = A.vanity;
  const vw = 0.57, vcx = -1.08;
  const vBack = 0.045, vFront = 0.48;
  const vd = vFront - vBack;
  const vzc = vBack + vd / 2;
  const cabBot = 0.33, cabTop = 0.75, slabTop = 0.82;
  const walnut = mats.walnut;
  const frontT2 = 0.018;

  rbox(vw, cabTop - cabBot, vd - frontT2, 0.004, vcx, (cabBot + cabTop) / 2, vBack + (vd - frontT2) / 2, walnut, { tile: 0.6, grain: 'x' });
  rbox(vw - 0.002, cabTop - cabBot - 0.002, 0.004, 0.001, vcx, (cabBot + cabTop) / 2, vFront - frontT2, gapDark, { seg: 1 });
  // drawer front (single), 4 mm gaps
  const dfw = vw - 0.008, dfh = cabTop - cabBot - 0.008;
  rbox(dfw, dfh, frontT2, 0.003, vcx, (cabBot + cabTop) / 2, vFront - frontT2 / 2, walnut, { tile: 0.6, grain: 'x', seg: 3 });
  // brushed brass bar pull
  {
    const brass = mats.brushedBrass;
    const by = cabTop - 0.075, bz = vFront + 0.022;
    const bar = new THREE.CapsuleGeometry(0.0065, 0.25, 6, 20);
    bar.rotateZ(Math.PI / 2);
    mesh(bar, brass, vcx, by, bz);
    for (const s of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 16);
      post.rotateX(Math.PI / 2);
      mesh(post, brass, vcx + s * 0.105, by, vFront + 0.011);
    }
  }

  // ceramic vanity top with real bowl
  {
    const cer = mats.ceramic.clone();
    cer.side = THREE.DoubleSide;
    const slabD = vd + 0.01, slabZc = vBack + slabD / 2 - 0.0;
    const T = slabTop - cabTop, bev = 0.004;
    const a0 = 0.215, b0 = 0.123, bowlDz = 0.045;   // bowl half-sizes and forward offset
    const nSeg = 160, ex = 0.5;                      // squircle exponent
    const contour = (a, b, i) => {
      const th = (i / nSeg) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      return [a * Math.sign(c) * Math.pow(Math.abs(c), ex), b * Math.sign(s) * Math.pow(Math.abs(s), ex)];
    };
    // slab: rounded rectangle with squircle hole
    const sw = vw - 2 * bev, sd = slabD - 2 * bev, rr = 0.02;
    const shape = new THREE.Shape();
    const hx = sw / 2, hz = sd / 2;
    shape.moveTo(-hx + rr, -hz);
    shape.lineTo(hx - rr, -hz); shape.absarc(hx - rr, -hz + rr, rr, -Math.PI / 2, 0, false);
    shape.lineTo(hx, hz - rr); shape.absarc(hx - rr, hz - rr, rr, 0, Math.PI / 2, false);
    shape.lineTo(-hx + rr, hz); shape.absarc(-hx + rr, hz - rr, rr, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hx, -hz + rr); shape.absarc(-hx + rr, -hz + rr, rr, Math.PI, Math.PI * 1.5, false);
    const hole = new THREE.Path();
    for (let i = 0; i <= nSeg; i++) {
      const [x, z] = contour(a0, b0, i);
      // shape y maps to -world z after rotateX(-90deg)
      const sy = -(z + bowlDz);
      if (i === 0) hole.moveTo(x, sy); else hole.lineTo(x, sy);
    }
    shape.holes.push(hole);
    const eg = new THREE.ExtrudeGeometry(shape, {
      depth: T - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
      bevelSegments: 4, curveSegments: 8, steps: 1,
    });
    eg.rotateX(-Math.PI / 2);
    eg.translate(vcx, cabTop + bev, slabZc);
    const slab = mesh(eg, cer);

    // bowl: concave squircle tub
    const rimY = slabTop - bev;
    const D = 0.056, Rf = 0.042;
    const rings = [];
    const nF = 16;
    for (let k = 0; k <= nF; k++) {
      const ph = (k / nF) * Math.PI / 2;
      rings.push({ a: (a0 - bev) - Rf * (1 - Math.cos(ph)), b: (b0 - bev) - Rf * (1 - Math.cos(ph)), y: rimY - D * Math.sin(ph) });
    }
    const aF = rings[nF].a, bF = rings[nF].b, yF = rings[nF].y;
    const nFl = 8;
    for (let k = 1; k <= nFl; k++) {
      const s = 1 - k / nFl;
      rings.push({ a: aF * s, b: bF * s, y: yF - 0.006 * (1 - s * s) });  // gentle slope to drain
    }
    const pos = [], idx = [];
    for (let r = 0; r < rings.length; r++) {
      const R = rings[r];
      const last = r === rings.length - 1;
      const count = last ? 1 : nSeg;
      for (let i = 0; i < count; i++) {
        const [x, z] = contour(R.a, R.b, i);
        pos.push(vcx + x, R.y, slabZc + bowlDz + z);
      }
    }
    const start = (r) => r * nSeg;
    for (let r = 0; r < rings.length - 1; r++) {
      const lastNext = r + 1 === rings.length - 1;
      for (let i = 0; i < nSeg; i++) {
        const i2 = (i + 1) % nSeg;
        const a = start(r) + i, b = start(r) + i2;
        if (lastNext) {
          const c = start(r + 1);
          idx.push(a, c, b);
        } else {
          const c = start(r + 1) + i, d = start(r + 1) + i2;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setIndex(idx);
    bg.computeVertexNormals();
    // make normals point up/inward (into the bowl)
    const nrm = bg.attributes.normal;
    if (nrm.getY(nrm.count - 1) < 0) {
      const ia = bg.index.array;
      for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
      bg.computeVertexNormals();
    }
    mesh(bg, cer);

    // drain
    const dcx = vcx, dcz = slabZc + bowlDz, dy = rings[rings.length - 1].y;
    const lp = [[0.0105, -0.006], [0.0108, 0.0004], [0.019, 0.0016], [0.0225, 0.0012], [0.0228, 0.0004], [0.0226, -0.0004]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const dg = new THREE.LatheGeometry(lp, 48);
    const drain = mesh(dg, mats.chrome, dcx, dy, dcz);
    const disc = new THREE.CircleGeometry(0.0106, 32); disc.rotateX(-Math.PI / 2);
    mesh(disc, mats.darkPlastic, dcx, dy - 0.0045, dcz);

    // ------------------------------------------------------------- faucet
    const chrome = mats.chrome;
    const fg = new THREE.Group();
    fg.position.set(vcx - 0.10, slabTop, vBack + 0.052 + 0.0);
    root.add(fg);
    const prof = [[0.0, 0.0], [0.0235, 0.0], [0.0238, 0.0025], [0.0205, 0.0045], [0.0168, 0.0062],
      [0.0158, 0.02], [0.0148, 0.055], [0.0146, 0.066], [0.0138, 0.0725], [0.0112, 0.0765], [0.0, 0.0775]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    mesh(new THREE.LatheGeometry(prof, 64), chrome, 0, 0, 0, fg);
    // spout
    const sp = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.052, 0), new THREE.Vector3(0, 0.066, 0.012), new THREE.Vector3(0, 0.078, 0.035),
      new THREE.Vector3(0, 0.0835, 0.070), new THREE.Vector3(0, 0.082, 0.103), new THREE.Vector3(0, 0.073, 0.128),
      new THREE.Vector3(0, 0.060, 0.139),
    ], false, 'centripetal');
    mesh(new THREE.TubeGeometry(sp, 80, 0.0075, 24, false), chrome, 0, 0, 0, fg);
    // aerator nozzle at tip, aligned to curve tangent
    const tip = sp.getPoint(1), tan = sp.getTangent(1).normalize();
    const noz = new THREE.Group();
    noz.position.copy(tip);
    noz.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    const nl = [[0.0, 0.0], [0.0078, 0.0], [0.0086, 0.002], [0.0088, 0.010], [0.0082, 0.0125], [0.0, 0.0125]].map(([r, y]) => new THREE.Vector2(r, y));
    mesh(new THREE.LatheGeometry(nl, 32), chrome, 0, -0.001, 0, noz);
    fg.add(noz);
    // lever: collar + flattened rounded paddle tilted back
    mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.006, 32), chrome, 0, 0.0775, 0, fg);
    const lev = new THREE.Group();
    lev.position.set(0, 0.079, -0.002);
    lev.rotation.x = -1.0;
    const lg = new THREE.CapsuleGeometry(0.0062, 0.052, 8, 24);
    lg.scale(1.7, 1, 0.75);
    lg.translate(0, 0.033, 0);
    mesh(lg, chrome, 0, 0, 0, lev);
    fg.add(lev);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}
