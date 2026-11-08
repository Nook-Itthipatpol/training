// Consult desk (marble top, fluted oak pedestal) + four tub leather armchairs.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export async function build(ctx) {
  const { THREE, dims, mats } = ctx;
  const { anchors } = dims;
  const root = new THREE.Group();
  root.name = 'desk-chairs';

  // ---------- helpers ----------
  // Re-project UVs from positions so textures sit at real-world scale (tile = `tile` meters).
  function projectUV(geo, tile, off = [0, 0]) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
      else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
      else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = (u + off[0]) / tile; uv[i * 2 + 1] = (v + off[1]) / tile;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  const mesh = (g, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o;
  };

  // ================= DESK =================
  const D = anchors.desk;
  const desk = new THREE.Group();
  desk.position.set(D.x, 0, D.z);
  root.add(desk);

  const topT = 0.04, topY1 = D.h, topY0 = D.h - topT;
  // marble slab: rounded-rect plan, beveled extrusion
  {
    const w = D.w, d = D.d, r = 0.05, bev = 0.009;
    const s = new THREE.Shape();
    const hw = w / 2, hd = d / 2;
    s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
    s.lineTo(hw, hd - r); s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
    s.lineTo(-hw + r, hd); s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-hw, -hd + r); s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
    // shrink shape by bevel (bevelSize grows it outward)
    const g = new THREE.ExtrudeGeometry(s, { depth: topT - 2 * bev, bevelEnabled: true, bevelThickness: bev,
      bevelSize: bev, bevelSegments: 5, curveSegments: 20 });
    g.rotateX(-Math.PI / 2); // extrusion -> +y
    g.translate(0, topY0 + bev, 0);
    g.computeVertexNormals();
    projectUV(g, 1.9, [hw, hd]); // single marble tile covers whole top -> continuous veins
    desk.add(mesh(g, mats.marble));
  }

  // pedestal core
  const coreW = D.w - 0.12, coreD = D.d - 0.12, kick = 0.05, coreY0 = kick, coreY1 = topY0 - 0.002;
  {
    const g = new RoundedBoxGeometry(coreW, coreY1 - coreY0, coreD, 4, 0.012);
    projectUV(g, 0.5);
    desk.add(mesh(g, mats.oak, 0, (coreY0 + coreY1) / 2, 0));
  }
  // recessed dark toe-kick
  {
    const kickMat = new THREE.MeshPhysicalMaterial({ color: 0x241b14, roughness: 0.55 });
    const g = new RoundedBoxGeometry(coreW - 0.07, kick + 0.01, coreD - 0.07, 3, 0.008);
    desk.add(mesh(g, kickMat, 0, (kick + 0.01) / 2 - 0.0, 0));
  }

  // fluted (reeded) panel geometry: width W (x), height H (y), half-round flutes, faces +z
  function fluteGeo(W, H, pitch, depth, uvOff) {
    const n = Math.round(W / pitch), p = W / n, seg = 10, rows = 2;
    const pos = [], nor = [], uv = [], idx = [];
    for (let f = 0; f < n; f++) {
      const x0 = -W / 2 + f * p;
      for (let r = 0; r < rows; r++) {
        const y = -H / 2 + r * H;
        for (let k = 0; k <= seg; k++) {
          const phi = (k / seg) * Math.PI;
          const x = x0 + p / 2 - (p / 2) * Math.cos(phi), z = depth * Math.sin(phi);
          const nv = new THREE.Vector3(-depth * Math.cos(phi), 0, (p / 2) * Math.sin(phi));
          if (k === 0 || k === seg) nv.set(Math.cos(phi) * -0.0, 0, 1); // valley: face-on
          nv.normalize();
          pos.push(x, y, z); nor.push(nv.x, nv.y, nv.z);
          uv.push((x + uvOff[0]) / 0.5, (y + uvOff[1]) / 0.5);
        }
      }
      const b = f * rows * (seg + 1);
      for (let k = 0; k < seg; k++) {
        const a0 = b + k, a1 = b + k + 1, c0 = b + (seg + 1) + k, c1 = b + (seg + 1) + k + 1;
        idx.push(a0, a1, c0, a1, c1, c0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  {
    const ph = coreY1 - coreY0 - 0.004, py = (coreY0 + coreY1) / 2;
    const fd = 0.0085, pitch = 0.025;
    const front = mesh(fluteGeo(coreW - 0.04, ph, pitch, fd, [0.37, 0.2]), mats.oak, 0, py, coreD / 2);
    desk.add(front);
    const sideG = fluteGeo(coreD - 0.04, ph, pitch, fd, [0.11, 0.2]);
    const right = mesh(sideG, mats.oak, coreW / 2, py, 0); right.rotation.y = Math.PI / 2;
    const left = mesh(sideG, mats.oak, -coreW / 2, py, 0); left.rotation.y = -Math.PI / 2;
    desk.add(right, left);
  }

  // ================= CHAIR =================
  const leatherTex = mats.sets.leatherSet({ color: [176, 145, 106], seed: 5, repeat: [1, 1] });
  const leather = mats.leather.clone();
  leather.map = leatherTex.map; leather.roughnessMap = leatherTex.roughnessMap; leather.normalMap = leatherTex.normalMap;
  leather.roughness = 0.9; leather.normalScale = new THREE.Vector2(0.22, 0.22); leather.sheen = 0.45; leather.sheenColor = new THREE.Color(0xe0c9a8);
  leather.sheenRoughness = 0.5; leather.clearcoat = 0.12; leather.clearcoatRoughness = 0.5;
  const legMat = mats.blackMetal, glideMat = mats.darkPlastic;
  const TILE = 0.3;

  // plan path of the U-shaped tub (centre line), x half-width hx, back at -hz.
  function uPath(hx, hz, R, zStart, step = 0.012) {
    const pts = [];
    const line = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(L / step));
      for (let i = 0; i < k; i++) pts.push([x0 + (x1 - x0) * i / k, z0 + (z1 - z0) * i / k]);
    };
    const arc = (cx, cz, a0, a1) => {
      const k = 14;
      for (let i = 0; i < k; i++) { const a = a0 + (a1 - a0) * i / k; pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); }
    };
    line(-hx, zStart, -hx, -hz + R);
    arc(-hx + R, -hz + R, Math.PI, Math.PI * 1.5);
    line(-hx + R, -hz, hx - R, -hz);
    arc(hx - R, -hz + R, Math.PI * 1.5, Math.PI * 2);
    line(hx, -hz + R, hx, zStart);
    pts.push([hx, zStart]);
    return pts;
  }

  // swept puffy roll along the U path. cross-section: superellipse (thick x high).
  function sweepBand({ yc, h, t, zStart, taper, hx = 0.245, hz = 0.245, R = 0.10, recline = 0.075, drop = 0.03, n = 3.0, ring = 28 }) {
    const path = uPath(hx, hz, R, zStart);
    const P = path.length;
    // arc length + tangents
    const S = [0];
    for (let i = 1; i < P; i++) S.push(S[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const Ltot = S[P - 1];
    const pos = [], uv = [], idx = [];
    const perim = 2 * Math.PI * Math.sqrt((t * t + h * h) / 8) * 1.0;
    for (let i = 0; i < P; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(P - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      const nx = tz, nz = -tx;
      const e = Math.min(S[i], Ltot - S[i]);
      const kk = Math.min(1, e / taper), sc = Math.sqrt(Math.max(0, 1 - (1 - kk) * (1 - kk)));
      // puff varies subtly along the band
      const puff = 1 + 0.05 * Math.sin(S[i] * 14);
      const front = Math.min(1, Math.max(0, (path[i][1] + 0.05) / 0.27));
      const ycc = yc - drop * front * front;
      const zshift = -recline * (ycc - 0.47);
      for (let j = 0; j <= ring; j++) {
        const th = Math.PI + (j / ring) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const u = (t / 2) * sc * puff * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
        const v = (h / 2) * sc * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
        pos.push(path[i][0] + nx * u, ycc + v, path[i][1] + nz * u + zshift);
        uv.push(S[i] / TILE, (j / ring) * perim / TILE);
      }
    }
    const W = ring + 1;
    for (let i = 0; i < P - 1; i++) for (let j = 0; j < ring; j++) {
      const a = i * W + j, b = (i + 1) * W + j, c = a + 1, d = b + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // stitch normals across the ring seam
    const nm = g.attributes.normal;
    for (let i = 0; i < P; i++) {
      const a = i * W, b = i * W + ring;
      const v = new THREE.Vector3(nm.getX(a) + nm.getX(b), nm.getY(a) + nm.getY(b), nm.getZ(a) + nm.getZ(b)).normalize();
      nm.setXYZ(a, v.x, v.y, v.z); nm.setXYZ(b, v.x, v.y, v.z);
    }
    return g;
  }

  function makeChair() {
    const c = new THREE.Group();
    const add = (g, m, x = 0, y = 0, z = 0) => { const o = mesh(g, m, x, y, z); c.add(o); return o; };

    // tub: lower core + 4 channel-tufted rolls (lower two wrap into the arms)
    const T = 0.092;
    add(sweepBand({ yc: 0.445, h: 0.15, t: T, zStart: 0.20, taper: 0.06, drop: 0.02 }), leather);
    add(sweepBand({ yc: 0.515, h: 0.125, t: 0.098, zStart: 0.255, taper: 0.07, drop: 0.035 }), leather);
    add(sweepBand({ yc: 0.622, h: 0.125, t: 0.098, zStart: 0.245, taper: 0.07, drop: 0.035 }), leather);
    add(sweepBand({ yc: 0.728, h: 0.118, t: 0.092, zStart: -0.02, taper: 0.09, drop: 0, hx: 0.248 }), leather);
    add(sweepBand({ yc: 0.822, h: 0.105, t: 0.086, zStart: -0.10, taper: 0.09, drop: 0, hx: 0.25 }), leather);

    // seat base + cushion
    add(new RoundedBoxGeometry(0.50, 0.08, 0.50, 5, 0.03), leather, 0, 0.395, 0.01);
    {
      const g = new RoundedBoxGeometry(0.48, 0.095, 0.50, 8, 0.042);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (y > 0) {
          const k = (1 - Math.pow(x / 0.25, 2)) * (1 - Math.pow(z / 0.26, 2));
          p.setY(i, y + 0.014 * Math.max(0, k));
        }
      }
      g.computeVertexNormals();
      projectUV(g, TILE);
      add(g, leather, 0, 0.428, 0.015);
    }

    // legs: slim tapered black metal, slightly splayed, with floor glides
    const legG = new THREE.CylinderGeometry(0.0165, 0.0095, 1, 20, 1);
    const glideG = new THREE.CylinderGeometry(0.0115, 0.0125, 0.007, 16);
    glideG.translate(0, 0.0035, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const legs = [
      [[-0.205, -0.20], [-0.255, -0.275]], [[0.205, -0.20], [0.255, -0.275]],
      [[-0.205, 0.215], [-0.245, 0.255]], [[0.205, 0.215], [0.245, 0.255]],
    ];
    for (const [t, b] of legs) {
      const top = new THREE.Vector3(t[0], 0.365, t[1]), bot = new THREE.Vector3(b[0], 0.007, b[1]);
      const dir = top.clone().sub(bot), L = dir.length();
      const lg = mesh(legG, legMat);
      lg.scale.set(1, L, 1);
      lg.position.copy(top.clone().add(bot).multiplyScalar(0.5));
      lg.quaternion.setFromUnitVectors(up, dir.normalize());
      c.add(lg);
      c.add(mesh(glideG, glideMat, b[0], 0, b[1]));
      // mounting cup
      const cup = mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.012, 16), legMat, t[0], 0.362, t[1]);
      c.add(cup);
    }
    return c;
  }

  const chair = makeChair();
  const place = (a) => {
    const ch = chair.clone(); // shares geometries + materials
    ch.position.set(a.x, 0, a.z); ch.rotation.y = a.rotY || 0;
    root.add(ch);
  };
  place(anchors.chairBehind);
  anchors.chairsFront.forEach(place);

  return root;
}
