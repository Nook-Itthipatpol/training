// Decor: framed painting, brass wall sconce, split AC indoor unit, potted olive tree.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, fbm, valueNoise, paint, heightToNormal, tex, makeCanvas } from '../lib/materials.js';

export async function build(ctx) {
  const { THREE, dims, mats } = ctx;
  const root = new THREE.Group();
  root.name = 'decor';
  const A = dims.anchors;
  const half = dims.half;

  const mesh = (g, m, parent, name) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = o.receiveShadow = true;
    if (name) o.name = name;
    parent.add(o);
    return o;
  };

  root.add(buildPainting());
  root.add(buildSconce());
  root.add(buildAC());
  root.add(buildPlant());
  return root;

  // =====================================================================
  // 1. PAINTING
  // =====================================================================
  function paintArtwork(W, H) {
    const R = rng(20240611);
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const hz = H * 0.57;
    const sunX = W * 0.58, sunY = H * 0.5;

    // sky
    let grad = g.createLinearGradient(0, 0, 0, hz);
    grad.addColorStop(0, '#4d6f98');
    grad.addColorStop(0.2, '#8591ac');
    grad.addColorStop(0.36, '#d09f8c');
    grad.addColorStop(0.48, '#efb672');
    grad.addColorStop(1, '#f7d899');
    g.fillStyle = grad; g.fillRect(0, 0, W, hz + 4);

    const glow = (x, y, rx, ry, col, a) => {
      g.save(); g.translate(x, y); g.scale(1, ry / rx);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
    };
    glow(sunX, sunY, W * 0.5, W * 0.5, '255,226,150', 0.85);
    glow(sunX, sunY + 30, W * 0.18, W * 0.18, '255,244,200', 0.8);

    // clouds: layered soft elongated puffs
    for (let i = 0; i < 190; i++) {
      const y = H * (0.04 + R() * 0.46);
      const t = y / hz;
      const x = R() * W;
      const rx = W * (0.07 + R() * 0.2), ry = rx * (0.06 + R() * 0.1);
      let col;
      const k = R();
      if (t > 0.72) col = k < 0.5 ? '255,200,120' : '250,170,110';
      else if (t > 0.45) col = k < 0.5 ? '240,150,120' : '255,196,140';
      else col = k < 0.5 ? '176,150,170' : '224,170,160';
      glow(x, y, rx, ry, col, 0.22 + R() * 0.25);
      if (R() < 0.35) glow(x + rx * 0.1, y - ry * 0.4, rx * 0.6, ry * 0.5, '255,236,190', 0.3);
    }
    glow(sunX, sunY - 20, W * 0.3, W * 0.05, '255,238,190', 0.45);

    // ridges
    const ridge = (base, amp, seed, bias, left0) => {
      const r = rng(seed); const ph = [r() * 9, r() * 9, r() * 9, r() * 9];
      const pts = [];
      for (let x = 0; x <= W; x += 6) {
        const u = x / W;
        let n = 0.5 * Math.abs(Math.sin(u * 5.1 + ph[0])) + 0.28 * Math.abs(Math.sin(u * 11.7 + ph[1])) +
          0.14 * Math.sin(u * 27 + ph[2]) + 0.08 * Math.sin(u * 61 + ph[3]) ;
        const wgt = bias === 'left' ? Math.pow(1 - u, 1.4) * 1.1 + 0.15 : bias === 'right' ? 0.35 + u * 0.4 : 0.6;
        pts.push([x, base - amp * n * wgt - left0]);
      }
      return pts;
    };
    const poly = (pts, base, fill, mirror, alpha = 1) => {
      g.save(); g.globalAlpha = alpha; g.fillStyle = fill; g.beginPath();
      if (mirror) {
        g.moveTo(0, hz);
        for (const [x, y] of pts) g.lineTo(x, hz + (hz - y) * 0.92);
        g.lineTo(W, hz);
      } else {
        g.moveTo(0, base + 4);
        for (const [x, y] of pts) g.lineTo(x, y);
        g.lineTo(W, base + 4);
      }
      g.closePath(); g.fill(); g.restore();
    };
    const far = ridge(hz, H * 0.075, 11, 'mid', 0);
    const mid = ridge(hz, H * 0.095, 23, 'left', 0);
    const near = ridge(hz + 4, H * 0.11, 37, 'left', 0);
    poly(far, hz, '#a5a6bd');
    // mist
    let mg = g.createLinearGradient(0, hz - H * 0.07, 0, hz); mg.addColorStop(0, 'rgba(250,215,170,0)'); mg.addColorStop(1, 'rgba(250,215,170,0.7)');
    g.fillStyle = mg; g.fillRect(0, hz - H * 0.07, W, H * 0.07);
    poly(mid, hz, '#7f8aa8');
    mg = g.createLinearGradient(0, hz - H * 0.05, 0, hz); mg.addColorStop(0, 'rgba(245,200,160,0)'); mg.addColorStop(1, 'rgba(245,200,160,0.55)');
    g.fillStyle = mg; g.fillRect(0, hz - H * 0.05, W, H * 0.05);
    poly(near, hz, '#566785');
    mg = g.createLinearGradient(0, hz - H * 0.03, 0, hz); mg.addColorStop(0, 'rgba(240,190,150,0)'); mg.addColorStop(1, 'rgba(240,190,150,0.5)');
    g.fillStyle = mg; g.fillRect(0, hz - H * 0.03, W, H * 0.03);

    // lake
    const lakeBot = H * 0.86;
    grad = g.createLinearGradient(0, hz, 0, lakeBot);
    grad.addColorStop(0, '#f6d391'); grad.addColorStop(0.2, '#ecab72'); grad.addColorStop(0.5, '#b98479'); grad.addColorStop(1, '#4f5b78');
    g.fillStyle = grad; g.fillRect(0, hz, W, lakeBot - hz + 4);
    glow(sunX, hz + H * 0.07, W * 0.42, W * 0.09, '255,226,150', 0.6);
    poly(far, hz, '#9a8fa6', true, 0.4);
    poly(mid, hz, '#6f7497', true, 0.5);
    poly(near, hz, '#4a5878', true, 0.55);
    // clip mirrored stuff to lake
    g.save(); g.fillStyle = '#4f5b78';
    g.restore();

    // far shore with tiny trees (left peninsula)
    const tree = (x, by, h, w, col, tiers = 8) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x, by - h);
      for (let i = 1; i <= tiers; i++) {
        const y = by - h + (h * i) / tiers;
        const ww = (w / 2) * (i / tiers) * (0.85 + R() * 0.3);
        g.lineTo(x + ww, y - h / tiers * 0.15);
        g.lineTo(x + ww * 0.55, y - h / tiers * 0.12);
      }
      g.lineTo(x + w * 0.04, by); g.lineTo(x - w * 0.04, by);
      for (let i = tiers; i >= 1; i--) {
        const y = by - h + (h * i) / tiers;
        const ww = (w / 2) * (i / tiers) * (0.85 + R() * 0.3);
        g.lineTo(x - ww * 0.55, y - h / tiers * 0.12);
        g.lineTo(x - ww, y - h / tiers * 0.15);
      }
      g.closePath(); g.fill();
    };
    // peninsula
    g.fillStyle = '#3d4a4a';
    g.beginPath(); g.moveTo(0, hz + H * 0.01);
    for (let x = 0; x <= W * 0.46; x += 8) g.lineTo(x, hz + H * (0.012 + 0.018 * Math.sin(x * 0.012) + 0.05 * (x / (W * 0.46)) ** 2));
    g.lineTo(W * 0.46, hz + H * 0.03); g.lineTo(0, hz + H * 0.08); g.fill();
    for (let i = 0; i < 46; i++) {
      const x = R() * W * 0.45, by = hz + H * 0.02 + (x / (W * 0.45)) * H * 0.012;
      const h = H * (0.025 + R() * 0.05) * (1 - x / (W * 0.6));
      tree(x, by, h, h * 0.4, R() < 0.5 ? '#2c3b3b' : '#35453f', 6);
    }
    // reflection of peninsula + shoreline
    g.save(); g.globalAlpha = 0.5; g.fillStyle = '#2d3a42';
    g.fillRect(0, hz + H * 0.03, W * 0.4, H * 0.045); g.restore();

    // right distant shore, low
    g.fillStyle = '#4a5654';
    g.beginPath(); g.moveTo(W * 0.62, hz + 6);
    for (let x = W * 0.62; x <= W; x += 8) g.lineTo(x, hz + 2 - H * 0.008 * Math.sin(x * 0.02) + H * 0.01);
    g.lineTo(W, hz + H * 0.03); g.lineTo(W * 0.62, hz + H * 0.02); g.fill();

    // foreground banks
    g.fillStyle = '#1d2a26';
    g.beginPath(); g.moveTo(0, H * 0.74);
    for (let x = 0; x <= W * 0.34; x += 8) g.lineTo(x, H * 0.80 + (x / (W * 0.34)) ** 2 * H * 0.07 + 6 * Math.sin(x * 0.05));
    g.lineTo(W * 0.4, H * 0.9); g.lineTo(W * 0.42, H); g.lineTo(0, H); g.fill();
    g.beginPath(); g.moveTo(W, H * 0.78);
    for (let x = W; x >= W * 0.76; x -= 8) g.lineTo(x, H * 0.83 + ((W - x) / (W * 0.24)) ** 2 * H * 0.05);
    g.lineTo(W * 0.72, H * 0.93); g.lineTo(W * 0.7, H); g.lineTo(W, H); g.fill();
    grad = g.createLinearGradient(0, H * 0.88, 0, H);
    grad.addColorStop(0, 'rgba(42,52,56,0)'); grad.addColorStop(1, 'rgba(24,32,30,0.95)');
    g.fillStyle = grad; g.fillRect(0, H * 0.86, W, H * 0.14);

    // bank reflection into lake
    g.save(); g.globalAlpha = 0.65;
    grad = g.createLinearGradient(0, lakeBot - H * 0.07, 0, lakeBot);
    grad.addColorStop(0, 'rgba(38,48,52,0)'); grad.addColorStop(1, 'rgba(24,34,34,1)');
    g.fillStyle = grad; g.fillRect(0, lakeBot - H * 0.07, W, H * 0.07 + 4); g.restore();

    // big pines left & right, with reflections
    const pines = [
      [W * 0.06, H * 0.88, H * 0.5, W * 0.2, '#142019'],
      [W * 0.17, H * 0.86, H * 0.36, W * 0.15, '#1a2a22'],
      [W * 0.28, H * 0.84, H * 0.22, W * 0.1, '#243428'],
      [W * 0.01, H * 0.93, H * 0.62, W * 0.22, '#0f1915'],
      [W * 0.93, H * 0.89, H * 0.2, W * 0.12, '#17251e'],
      [W * 0.84, H * 0.85, H * 0.13, W * 0.08, '#223229'],
      [W * 0.98, H * 0.93, H * 0.3, W * 0.15, '#101b16'],
    ];
    for (const [x, by, h, w, col] of pines) {
      // reflection (faint)
      g.save(); g.globalAlpha = 0.28; g.translate(0, by * 2 - H * 0.02); g.scale(1, -0.5);
      g.translate(0, -by * 0.0); g.restore();
      g.save(); g.beginPath(); g.rect(0, hz, W, lakeBot - hz); g.clip();
      g.globalAlpha = 0.32;
      g.save(); g.translate(0, lakeBot * 2 - 0); g.scale(1, -0.55);
      g.translate(0, -(lakeBot * 2 - lakeBot * 2 * 0.0));
      g.restore();
      g.restore();
      tree(x, by, h, w, col, 11);
    }
    // sunlit rim on trees facing the sun: warm flecks on right sides
    for (let i = 0; i < 700; i++) {
      const p = pines[(R() * pines.length) | 0];
      const x = p[0] + (R() - 0.2) * p[3] * 0.4, y = p[1] - R() * p[2] * 0.85;
      g.fillStyle = `rgba(${150 + R() * 70},${110 + R() * 50},${50 + R() * 30},${0.12 + R() * 0.2})`;
      g.fillRect(x, y, 6 + R() * 10, 3 + R() * 4);
    }
    return { c, g, hz, lakeBot, sunX };
  }

  function paintStrokes(art) {
    const { c, g, hz, lakeBot, sunX } = art;
    const W = c.width, H = c.height;
    const R = rng(777);
    const snap = g.getImageData(0, 0, W, H).data;
    g.lineCap = 'round';
    const pass = (n, lenR, wR, alpha, jit) => {
      for (let i = 0; i < n; i++) {
        const x = R() * W, y = R() * H;
        const idx = ((y | 0) * W + (x | 0)) * 4;
        const j = (R() - 0.5) * jit, k = (R() - 0.5) * jit * 0.6;
        g.strokeStyle = `rgb(${snap[idx] + j + k},${snap[idx + 1] + j},${snap[idx + 2] + j - k})`;
        g.globalAlpha = alpha * (0.6 + R() * 0.6);
        const inScene = y < lakeBot;
        const horiz = y < hz || (y > hz && y < lakeBot);
        const ang = horiz ? (R() - 0.5) * 0.35 : (R() - 0.5) * 2.2 - 1.1;
        const len = lenR[0] + R() * (lenR[1] - lenR[0]);
        g.lineWidth = wR[0] + R() * (wR[1] - wR[0]);
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + (R() - 0.5) * 4,
          x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        g.stroke();
      }
    };
    pass(30000, [14, 46], [6, 13], 0.5, 22);
    pass(55000, [8, 26], [3, 8], 0.45, 26);
    // ripples + sun glitter on lake
    for (let i = 0; i < 1500; i++) {
      const y = hz + 8 + Math.pow(R(), 1.3) * (lakeBot - hz - 20);
      const x = sunX + (R() - 0.5) * W * (0.1 + 0.25 * (y - hz) / (lakeBot - hz)) * (R() < 0.8 ? 1 : 3);
      g.globalAlpha = 0.18 + R() * 0.25;
      g.strokeStyle = R() < 0.7 ? '#fbe1a0' : '#e6a46c';
      g.lineWidth = 2 + R() * 3.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + R() * 60, y + (R() - 0.5) * 2); g.stroke();
    }
    pass(40000, [3, 10], [2, 4.5], 0.4, 30);
    // vignette
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(30,15,5,0)'); vg.addColorStop(1, 'rgba(30,15,5,0.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  function weaveNormal() {
    const s = 128;
    const Hc = paint(s, s, (u, v, x, y) => {
      const t = 8; // threads per tile
      const a = Math.sin(((x / s) * t) * Math.PI * 2) * 0.5 + 0.5;
      const b = Math.sin(((y / s) * t) * Math.PI * 2) * 0.5 + 0.5;
      const over = (Math.floor((x / s) * t) + Math.floor((y / s) * t)) % 2 === 0;
      const n = valueNoise(u * 64, v * 64, 64, 5) * 0.2;
      return (over ? a * 0.8 + b * 0.2 : b * 0.8 + a * 0.2) * 200 + n * 50;
    });
    return heightToNormal(Hc, 1.6);
  }

  function framePiece(pts, depth, bevel) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 2 });
    g.translate(0, 0, bevel);
    return g;
  }
  function frameSides(W, H, f, depth, bevel) {
    const w2 = W / 2, h2 = H / 2;
    const sides = {
      top: [[-w2, h2], [w2, h2], [w2 - f, h2 - f], [-w2 + f, h2 - f]],
      bottom: [[-w2, -h2], [-w2 + f, -h2 + f], [w2 - f, -h2 + f], [w2, -h2]],
      left: [[-w2, h2], [-w2 + f, h2 - f], [-w2 + f, -h2 + f], [-w2, -h2]],
      right: [[w2, h2], [w2, -h2], [w2 - f, -h2 + f], [w2 - f, h2 - f]],
    };
    const out = [];
    for (const k in sides) {
      const g = framePiece(sides[k], depth, bevel);
      if (k === 'top' || k === 'bottom') { // grain across the width for horizontal sides
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
      }
      out.push(g);
    }
    return mergeGeometries(out);
  }

  function buildPainting() {
    const P = A.painting;
    const grp = new THREE.Group(); grp.name = 'painting';
    // local frame: face +z, back at z=0; rotate so +z -> world +x
    const W = P.w, H = P.h;
    const f = 0.03, depth = 0.04, matB = 0.06;
    const inner = new THREE.Group();
    grp.add(inner);

    const frameMat = mats.walnut.clone();
    frameMat.color = new THREE.Color(0x7a5a46);
    frameMat.clearcoat = 0.35; frameMat.clearcoatRoughness = 0.35;
    frameMat.roughness = 1;
    const sideGeo = frameSides(W, H, f, depth, 0.0015);
    mesh(sideGeo, frameMat, inner, 'frame');

    // brass-bronze inner lip (slip) stepped slightly lower than the frame face
    const lipMat = new THREE.MeshPhysicalMaterial({ color: 0x9c7a46, metalness: 1, roughness: 0.4 });
    mesh(frameSides(W - 2 * f + 0.004, H - 2 * f + 0.004, 0.008, 0.03, 0.001), lipMat, inner, 'lip');

    // backing
    const back = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * f + 0.004, H - 2 * f + 0.004, 0.004),
      new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.9 }));
    back.position.z = 0.004; inner.add(back);

    // artwork
    const cw = 1664, ch = 2048;
    const art = paintArtwork(cw, ch);
    paintStrokes(art);
    const map = tex(art.c, { color: true, aniso: 16 });
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    const nm = tex(weaveNormal(), { repeat: [36, 44], aniso: 8 });
    const artMat = new THREE.MeshPhysicalMaterial({ map, normalMap: nm, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.62, clearcoat: 0.05, clearcoatRoughness: 0.5 });
    const aw = W - 2 * f - 2 * matB + 0.016, ah = H - 2 * f - 2 * matB + 0.016;
    const artM = new THREE.Mesh(new THREE.PlaneGeometry(aw, ah), artMat);
    artM.position.z = 0.0115; artM.receiveShadow = true; inner.add(artM);

    // mat board with window and bevelled cut
    const mw = W - 2 * f, mh = H - 2 * f;
    const ms = new THREE.Shape();
    ms.moveTo(-mw / 2, -mh / 2); ms.lineTo(mw / 2, -mh / 2); ms.lineTo(mw / 2, mh / 2); ms.lineTo(-mw / 2, mh / 2); ms.closePath();
    const hw = mw / 2 - matB, hh = mh / 2 - matB;
    const hole = new THREE.Path();
    hole.moveTo(-hw, -hh); hole.lineTo(-hw, hh); hole.lineTo(hw, hh); hole.lineTo(hw, -hh); hole.closePath();
    ms.holes.push(hole);
    const matGeo = new THREE.ExtrudeGeometry(ms, { depth: 0.0015, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 1 });
    // uv for extrude are in meters (OK for fibrous paper)
    const matMat = new THREE.MeshPhysicalMaterial({ color: 0xf0e8d6, roughness: 0.92, normalMap: nm, normalScale: new THREE.Vector2(0.08, 0.08) });
    const matM = mesh(matGeo, matMat, inner, 'mat');
    matM.position.z = 0.0155;
    // thin inner bevel core (white) to hint paper thickness
    const innerLip = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 0.001, 2 * hh + 0.001, 0.0008), new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.9 }));
    innerLip.position.z = 0.0132; inner.add(innerLip);
    innerLip.visible = false;

    // hanging hardware (small wire hint on the back, invisible, skip) -> position
    grp.rotation.y = Math.PI / 2;
    grp.position.set(P.wallX + 0.010, P.yCenter, P.zCenter);
    return grp;
  }

  // =====================================================================
  // 2. SCONCE
  // =====================================================================
  function buildSconce() {
    const S = A.sconce;
    const grp = new THREE.Group(); grp.name = 'sconce';
    const brass = mats.brass, brushed = mats.brushedBrass;

    // wall plate (axis along +x)
    const plateProf = [[0.0, 0], [0.050, 0], [0.0545, 0.002], [0.0555, 0.006], [0.0525, 0.011], [0.044, 0.0145], [0.0, 0.0155]].map(([r, y]) => new THREE.Vector2(r, y));
    const plate = mesh(new THREE.LatheGeometry(plateProf, 40), brushed, grp, 'plate');
    plate.rotation.z = -Math.PI / 2;
    // boss
    const bossProf = [[0.0, 0.0], [0.026, 0.0], [0.0265, 0.012], [0.022, 0.0195], [0.0, 0.02]].map(([r, y]) => new THREE.Vector2(r, y));
    const boss = mesh(new THREE.LatheGeometry(bossProf, 28), brass, grp, 'boss');
    boss.rotation.z = -Math.PI / 2; boss.position.x = 0.0145;

    // arm
    const dir = new THREE.Vector3(0.38, -0.52, 0.76).normalize();
    const B = new THREE.Vector3(0.108, 0.02, -0.03);
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.03, 0, 0), new THREE.Vector3(0.07, 0, 0), new THREE.Vector3(0.098, 0.006, -0.012), B.clone(),
    ]);
    mesh(new THREE.TubeGeometry(armCurve, 20, 0.0085, 14), brass, grp, 'arm');
    // elbow ball
    const ball = mesh(new THREE.SphereGeometry(0.0125, 18, 12), brass, grp);
    ball.position.copy(B);

    // shade (lathe open cylinder)
    const L = 0.115, R0 = 0.042;
    const prof = [[0.0, 0.0], [0.034, 0.0], [R0 - 0.003, 0.004], [R0, 0.011], [R0, L - 0.004], [R0 - 0.0012, L], [R0 - 0.004, L], [R0 - 0.0045, L - 0.004], [R0 - 0.0045, 0.014], [0.0, 0.013]].map(([r, y]) => new THREE.Vector2(r, y));
    const shadeG = new THREE.Group();
    mesh(new THREE.LatheGeometry(prof, 48), brass, shadeG, 'shade');
    // inner paint (satin) so the interior reads warm
    const diff = new THREE.Mesh(new THREE.CircleGeometry(R0 - 0.0055, 40), mats.ledDiffuser.clone());
    diff.rotation.x = -Math.PI / 2; diff.position.y = L - 0.016; diff.material.emissiveIntensity = 14;
    shadeG.add(diff);
    // small upper opening glow ring (light leaking up) : a thin emissive band near the back
    const ring = mesh(new THREE.TorusGeometry(R0 - 0.001, 0.0016, 8, 40), brushed, shadeG);
    ring.rotation.x = Math.PI / 2; ring.position.y = L * 0.52;
    shadeG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shadeG.position.copy(B).addScaledVector(dir, -0.01);
    grp.add(shadeG);

    grp.position.set(S.wallX + 0.0, S.y, S.z);
    return grp;
  }

  // =====================================================================
  // 3. AC UNIT
  // =====================================================================
  function buildAC() {
    const U = A.acUnit;
    const grp = new THREE.Group(); grp.name = 'acUnit';
    const bev = 0.006;
    const w = U.w - 2 * bev, h = U.h - 2 * bev, d = U.d - 2 * bev;
    const s = new THREE.Shape();
    // profile in (z, y): back at 0, front at d
    s.moveTo(0, -h / 2);
    s.lineTo(d * 0.72, -h / 2);
    s.quadraticCurveTo(d * 0.96, -h / 2 + 0.002, d * 0.985, -h / 2 + 0.05);
    s.quadraticCurveTo(d * 1.01, 0.0, d * 0.99, h / 2 - 0.06);
    s.quadraticCurveTo(d * 0.97, h / 2, d * 0.8, h / 2);
    s.lineTo(0, h / 2);
    s.closePath();
    const bodyG = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 4, curveSegments: 14 });
    bodyG.rotateY(-Math.PI / 2);
    bodyG.translate(w / 2, 0, bev);
    const plastic = mats.whitePlastic.clone();
    plastic.roughness = 0.34; plastic.clearcoat = 0.25; plastic.clearcoatRoughness = 0.3;
    mesh(bodyG, plastic, grp, 'body');

    const dark = mats.darkPlastic.clone(); dark.color.set(0x1a1a1b); dark.roughness = 0.6;
    const zf = U.d; // approx front
    // front panel seam: shallow darker groove
    const seam = new THREE.Mesh(new THREE.BoxGeometry(U.w * 0.97, 0.0016, 0.004), new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.6 }));
    seam.position.set(0, -h / 2 + 0.06, zf - 0.0045); grp.add(seam);
    // top grille slots (front face upper band)
    for (let i = 0; i < 6; i++) {
      const sl = new THREE.Mesh(new RoundedBoxGeometry(U.w * 0.7, 0.0028, 0.003, 1, 0.0008), dark);
      sl.position.set(0, h / 2 - 0.02 - i * 0.0075, zf - 0.0055 + 0.001 + Math.min(i, 3) * 0.0 - 0.003 * (i > 2 ? 0.5 : 0));
      grp.add(sl);
    }
    // indicator window (logo-free)
    const win = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.022, 0.003, 2, 0.0012), dark);
    win.position.set(U.w * 0.31, -h / 2 + 0.105, zf - 0.0035); grp.add(win);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff9a40, emissiveIntensity: 1.2, roughness: 0.5 }));
    dot.position.set(U.w * 0.31 + 0.035, -h / 2 + 0.105, zf - 0.0018); grp.add(dot);

    // air outlet: dark slot under the body, louver flap angled down
    const slot = new THREE.Mesh(new RoundedBoxGeometry(U.w * 0.9, 0.006, d * 0.5, 1, 0.002), dark);
    slot.position.set(0, -U.h / 2 - 0.0005, d * 0.5); grp.add(slot);
    const flapG = new RoundedBoxGeometry(U.w * 0.88, 0.0055, d * 0.4, 2, 0.0022);
    const flap = new THREE.Mesh(flapG, plastic); flap.castShadow = true;
    flap.position.set(0, -U.h / 2 - 0.012, d * 0.66);
    flap.rotation.x = 0.42;
    grp.add(flap);
    // end blades of the louver (side stops)
    for (const sx of [-1, 1]) {
      const st = new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.014, d * 0.42, 1, 0.002), plastic);
      st.position.set(sx * (U.w * 0.44 + 0.002), -U.h / 2 - 0.005, d * 0.66); st.rotation.x = 0.2; grp.add(st);
    }

    grp.position.set(U.x, U.y, 0.04);
    return grp;
  }

  // =====================================================================
  // 4. OLIVE TREE
  // =====================================================================
  function taperedTube(curve, r0, r1, seg, radial, R) {
    const frames = curve.computeFrenetFrames(seg, false);
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg; const p = curve.getPointAt(t);
      const r = r0 + (r1 - r0) * t + 0.0015 * Math.sin(t * 28) * (r0 > 0.006 ? 1 : 0);
      const N = frames.normals[i], Bn = frames.binormals[i];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const n = new THREE.Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(Bn, Math.sin(a));
        const rr = r * (1 + 0.1 * Math.sin(a * 3 + t * 5));
        pos.push(p.x + n.x * rr, p.y + n.y * rr, p.z + n.z * rr);
        nor.push(n.x, n.y, n.z); uv.push(t, j / radial);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  function buildPlant() {
    const P = A.plant;
    const grp = new THREE.Group(); grp.name = 'plant';
    const R = rng(4242);
    const pw = (a, b) => a + R() * (b - a);

    // ---- pot ----
    const potSet = mats.sets.plasterSet({ color: [178, 176, 169], seed: 33, repeat: [3, 2], size: 512 });
    const potMat = new THREE.MeshPhysicalMaterial({ ...potSet, roughness: 0.82, normalScale: new THREE.Vector2(1.4, 1.4) });
    const potProf = [
      [0.0, 0.0], [0.082, 0.0], [0.092, 0.004], [0.096, 0.010],
      [0.112, 0.07], [0.128, 0.15], [0.136, 0.205], [0.145, 0.232], [0.147, 0.247], [0.141, 0.256], [0.132, 0.254],
      [0.128, 0.244], [0.122, 0.2], [0.0, 0.2],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const pot = mesh(new THREE.LatheGeometry(potProf, 72), potMat, grp, 'pot');
    // soil
    const soilSet = mats.sets.plasterSet({ color: [60, 44, 32], seed: 41, repeat: [3, 3] });
    const soilMat = new THREE.MeshPhysicalMaterial({ ...soilSet, roughness: 0.98, normalScale: new THREE.Vector2(2.5, 2.5) });
    const soil = mesh(new THREE.CircleGeometry(0.128, 48), soilMat, grp, 'soil');
    soil.rotation.x = -Math.PI / 2; soil.position.y = 0.22;
    // pebbles
    const pebs = [];
    for (let i = 0; i < 90; i++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.118;
      const g = new THREE.IcosahedronGeometry(1, 1);
      const s = pw(0.006, 0.014);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * rr, 0.222 + s * 0.15, Math.sin(a) * rr),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)),
        new THREE.Vector3(s, s * pw(0.45, 0.7), s * pw(0.8, 1.1)));
      g.applyMatrix4(m);
      const col = [0.62 + R() * 0.2, 0.6 + R() * 0.18, 0.55 + R() * 0.15];
      const arr = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < arr.length; k += 3) { arr[k] = col[0]; arr[k + 1] = col[1]; arr[k + 2] = col[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      pebs.push(g);
    }
    mesh(mergeGeometries(pebs), new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75 }), grp, 'pebbles');

    // ---- bark ----
    const Hb = paint(256, 256, (u, v) => {
      const n = valueNoise(u * 6, v * 32, 32, 3) * 0.6 + valueNoise(u * 14, v * 64, 64, 9) * 0.3 + valueNoise(u * 3, v * 16, 16, 5) * 0.3;
      return Math.min(255, n * 200);
    });
    const barkMat = new THREE.MeshPhysicalMaterial({
      color: 0x75665a, roughness: 0.9,
      normalMap: tex(heightToNormal(Hb, 3.0), { aniso: 8 }), normalScale: new THREE.Vector2(1.2, 1.2),
    });
    const woodGeos = [];
    const base = new THREE.Vector3(0, 0.215, 0);

    // ---- leaf pools ----
    const top = { pos: [], nor: [], uv: [], col: [], idx: [] };
    const bot = { pos: [], nor: [], uv: [], col: [], idx: [] };
    const ROWS = 7;
    const leafBase = []; // template (unit leaf, length 1 along +y)
    for (let i = 0; i <= ROWS; i++) {
      const t = i / ROWS;
      const wdt = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85) * 0.5 + (i === 0 ? 0 : 0);
      for (let j = 0; j < 3; j++) {
        const sx = (j - 1);
        const x = sx * wdt * 0.2; // unit width 0.2 of length
        const fold = (j === 1 ? 0 : 1) * 0.35 * wdt * 0.2;
        const curl = -0.16 * t * t + 0.03 * sx * sx * t * 0 + (sx * 0.04 * t);
        leafBase.push([x, t, fold + curl, (j) / 2, t]);
      }
    }
    const tris = [];
    for (let i = 0; i < ROWS; i++) {
      const a = i * 3, b = (i + 1) * 3;
      tris.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
    // template normals via temp geometry
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(leafBase.flatMap(p => [p[0], p[1], p[2]]), 3));
    tg.setIndex(tris);
    tg.computeVertexNormals();
    const tnor = tg.attributes.normal.array;
    let leafCount = 0;
    const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), nv = new THREE.Vector3();
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

    function addLeaf(origin, d, len) {
      Y.copy(d).normalize();
      Z.copy(UP).addScaledVector(Y, -UP.dot(Y));
      if (Z.lengthSq() < 1e-4) Z.set(0, 0, 1);
      Z.normalize();
      // roll around Y
      const roll = pw(-0.9, 0.9);
      Z.applyAxisAngle(Y, roll);
      X.crossVectors(Y, Z).normalize();
      m4.makeBasis(X, Y, Z);
      const rotOnly = m4.clone();
      const k = 0.82 + R() * 0.3, hue = R();
      const col = [k * (0.93 + hue * 0.1), k * (0.98 + R() * 0.04), k * (0.9 + hue * 0.14)];
      const vi = top.pos.length / 3;
      for (let i = 0; i < leafBase.length; i++) {
        const p = leafBase[i];
        v3.set(p[0] * len, p[1] * len, p[2] * len).applyMatrix4(rotOnly).add(origin);
        nv.set(tnor[i * 3], tnor[i * 3 + 1], tnor[i * 3 + 2]).transformDirection(rotOnly);
        top.pos.push(v3.x, v3.y, v3.z); top.nor.push(nv.x, nv.y, nv.z); top.uv.push(p[3], p[4]); top.col.push(...col);
        bot.pos.push(v3.x - nv.x * 0.0004, v3.y - nv.y * 0.0004, v3.z - nv.z * 0.0004);
        bot.nor.push(-nv.x, -nv.y, -nv.z); bot.uv.push(p[3], p[4]); bot.col.push(...col);
      }
      for (let i = 0; i < tris.length; i += 3) {
        top.idx.push(vi + tris[i], vi + tris[i + 1], vi + tris[i + 2]);
        bot.idx.push(vi + tris[i], vi + tris[i + 2], vi + tris[i + 1]);
      }
      leafCount++;
    }

    // add a stem along a curve; scatters leaves toward the tip
    function addStem(pts, r0, r1, leaves, leafStart, opts = {}) {
      const curve = new THREE.CatmullRomCurve3(pts);
      woodGeos.push(taperedTube(curve, r0, r1, Math.max(8, pts.length * 5), 8, R));
      const phi0 = R() * 6.28;
      for (let i = 0; i < leaves; i++) {
        const t = leafStart + (1 - leafStart) * Math.pow(i / leaves, 0.7) + R() * 0.02;
        const tt = Math.min(1, t);
        const p = curve.getPointAt(tt);
        const T = curve.getTangentAt(tt);
        // perpendicular basis around tangent
        const a1 = new THREE.Vector3().crossVectors(T, UP);
        if (a1.lengthSq() < 1e-4) a1.set(1, 0, 0);
        a1.normalize();
        const a2 = new THREE.Vector3().crossVectors(T, a1).normalize();
        const phi = phi0 + i * 2.399 + (R() - 0.5) * 0.6; // golden-angle phyllotaxis, opposite-ish
        const out = a1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(a2, Math.sin(phi));
        const ang = pw(0.7, 1.15);
        const d = T.clone().multiplyScalar(Math.cos(ang)).addScaledVector(out, Math.sin(ang));
        d.y += pw(-0.1, 0.16) + (opts.upward || 0);
        const len = pw(0.06, 0.08) * (0.8 + 0.3 * (1 - Math.abs(tt - 0.8)));
        addLeaf(p.clone().addScaledVector(out, 0.003), d, len);
      }
      // terminal leaf
      const tip = curve.getPointAt(1), Tt = curve.getTangentAt(1);
      addLeaf(tip.clone(), Tt.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.065);
      return curve;
    }

    // trunk
    const trunkPts = [
      base.clone(), new THREE.Vector3(0.006, 0.4, 0.004), new THREE.Vector3(-0.014, 0.62, -0.004),
      new THREE.Vector3(-0.004, 0.82, 0.01), new THREE.Vector3(0.012, 1.0, 0.004), new THREE.Vector3(0.0, 1.12, -0.004),
    ];
    const trunk = addStem(trunkPts, 0.0165, 0.004, 90, 0.72, { upward: 0.15 });

    // main branches
    const branches = [
      { t: 0.48, dir: [-0.55, 0.62, 0.15], len: 0.34, n: 150 },
      { t: 0.58, dir: [0.6, 0.55, -0.2], len: 0.36, n: 160 },
      { t: 0.72, dir: [0.15, 0.55, 0.6], len: 0.3, n: 130 },
      { t: 0.8, dir: [-0.25, 0.6, -0.55], len: 0.32, n: 140 },
      { t: 0.9, dir: [0.4, 0.8, 0.25], len: 0.22, n: 100 },
    ];
    const br = [];
    for (const b of branches) {
      const p0 = trunk.getPointAt(b.t);
      const dv = new THREE.Vector3(...b.dir).normalize();
      const pts = [p0.clone()];
      let cur = p0.clone();
      for (let s = 1; s <= 4; s++) {
        cur = cur.clone().addScaledVector(dv, b.len / 4);
        cur.y += (s * 0.012) * (s > 2 ? 1.5 : 0.5);
        cur.x += (R() - 0.5) * 0.02; cur.z += (R() - 0.5) * 0.02;
        pts.push(cur);
      }
      br.push(addStem(pts, 0.0072, 0.0025, b.n, 0.4, { upward: 0.1 }));
    }
    // twigs off branches and trunk
    const sources = [...br, trunk];
    for (let i = 0; i < 42; i++) {
      const src = sources[(R() * sources.length) | 0];
      const t0 = src === trunk ? pw(0.55, 0.95) : pw(0.35, 0.9);
      const p0 = src.getPointAt(t0), T = src.getTangentAt(t0);
      const dv = new THREE.Vector3(pw(-1, 1), pw(0.2, 0.9), pw(-1, 1)).add(T).normalize();
      const L = pw(0.08, 0.18), pts = [p0.clone()];
      let c = p0.clone();
      for (let s = 1; s <= 3; s++) {
        c = c.clone().addScaledVector(dv, L / 3); c.y += 0.012 * s; pts.push(c);
      }
      addStem(pts, 0.0032, 0.0012, 38, 0.2, { upward: 0.12 });
    }

    mesh(mergeGeometries(woodGeos), barkMat, grp, 'wood');

    // leaf textures: silvery-green top w/ pale midrib; pale underside
    const leafTex = (topSide) => {
      const cv = paint(32, 128, (u, v) => {
        const mid = Math.exp(-Math.pow((u - 0.5) / 0.05, 2));
        const edge = Math.pow(Math.abs(u - 0.5) * 2, 2);
        const shade = fbm(u, v, { period: 4, seed: 3, octaves: 3 });
        if (topSide) {
          const base = [110, 132, 92], silver = [168, 182, 152];
          const t = Math.min(1, 0.25 + edge * 0.15 + shade * 0.4);
          return [base[0] + (silver[0] - base[0]) * t + mid * 40, base[1] + (silver[1] - base[1]) * t + mid * 35, base[2] + (silver[2] - base[2]) * t + mid * 25];
        }
        return [182 + mid * 20 + shade * 20, 192 + mid * 18 + shade * 18, 168 + mid * 14 + shade * 16];
      });
      return tex(cv, { color: true, aniso: 8 });
    };
    const mkLeafGeo = (L) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(L.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
      g.setIndex(L.idx);
      return g;
    };
    const topMat = new THREE.MeshPhysicalMaterial({ map: leafTex(true), vertexColors: true, roughness: 0.48, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xc8d4c0), side: THREE.FrontSide });
    const botMat = new THREE.MeshPhysicalMaterial({ map: leafTex(false), vertexColors: true, roughness: 0.62, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xe0e6dc), side: THREE.FrontSide });
    mesh(mkLeafGeo(top), topMat, grp, 'leavesTop');
    mesh(mkLeafGeo(bot), botMat, grp, 'leavesUnder');

    grp.userData.leafCount = leafCount;
    grp.position.set(P.x, P.y, P.z);
    return grp;
  }
}
