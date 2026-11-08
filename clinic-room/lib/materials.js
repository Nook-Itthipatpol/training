// Shared PBR materials + procedural texture helpers.
// All textures are generated on <canvas> (no external downloads needed),
// except the oak floor which uses vendored three.js example textures.
// Path-tracer note: use normalMap (not bumpMap) for surface relief.

import * as THREE from 'three';

// ---------- deterministic noise ----------
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Tileable value noise on a period grid.
export function valueNoise(x, y, period = 8, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % period) + period) % period;
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Tileable fBm. (x, y) in [0,1) texture space.
export function fbm(x, y, { octaves = 5, period = 4, seed = 0, gain = 0.5 } = {}) {
  let amp = 0.5, sum = 0, norm = 0, p = period;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * p, y * p, p, seed + o * 17);
    norm += amp; amp *= gain; p *= 2;
  }
  return sum / norm;
}

// ---------- canvas helpers ----------
export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Fill a canvas per-pixel. fn(u, v, x, y) -> [r,g,b] (0..255) or number (gray).
export function paint(w, h, fn) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = fn(x / w, y / h, x, y);
      const i = (y * w + x) * 4;
      if (typeof r === 'number') { d[i] = d[i + 1] = d[i + 2] = r; }
      else { d[i] = r[0]; d[i + 1] = r[1]; d[i + 2] = r[2]; }
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Convert a grayscale height canvas into a tangent-space normal map canvas.
export function heightToNormal(heightCanvas, strength = 2) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  return paint(w, h, (u, v, x, y) => {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const n = new THREE.Vector3(-dx, dy, 1).normalize();
    return [(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255];
  });
}

// Wrap canvas as a texture. color=true → sRGB (for albedo maps only).
export function tex(canvas, { color = false, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---------- procedural texture sets ----------
// Each returns { map, roughnessMap, normalMap } textures.

// Straight-grain wood veneer (grain runs along v).
export function woodSet({ size = 512, light = [176, 128, 86], dark = [122, 80, 48],
  seed = 1, rings = 14, roughBase = 0.55, normal = 1.5, repeat = [1, 1] } = {}) {
  const h = (u, v) => {
    const warp = fbm(u, v, { period: 2, seed, octaves: 4 }) * 2.0;
    const g = Math.sin((u * rings + warp) * Math.PI * 2) * 0.5 + 0.5;
    const fine = fbm(u * 1, v * 0.05, { period: 64, seed: seed + 3, octaves: 2 });
    const pores = valueNoise(u * 256, v * 24, 256, seed + 9);
    return clamp01(g * 0.55 + fine * 0.35 + pores * 0.1);
  };
  const H = paint(size, size, (u, v) => h(u, v) * 255);
  const map = paint(size, size, (u, v) => {
    const t = h(u, v);
    const tone = fbm(u, v, { period: 1, seed: seed + 5, octaves: 3 });
    return mix3(dark, light, clamp01(t * 0.85 + tone * 0.3 - 0.05));
  });
  const rough = paint(size, size, (u, v) => (roughBase + (h(u, v) - 0.5) * 0.15) * 255);
  return {
    map: tex(map, { color: true, repeat }),
    roughnessMap: tex(rough, { repeat }),
    normalMap: tex(heightToNormal(H, normal), { repeat }),
  };
}

// Beige marble with soft veins.
export function marbleSet({ size = 1024, base = [226, 214, 196], vein = [168, 146, 120],
  seed = 7, repeat = [1, 1] } = {}) {
  const veinAt = (u, v) => {
    const w = fbm(u, v, { period: 2, seed, octaves: 6 }) * 6;
    const s = Math.abs(Math.sin((u * 2.2 + v * 1.1 + w) * Math.PI));
    return Math.pow(1 - s, 10);
  };
  const map = paint(size, size, (u, v) => {
    const cloud = fbm(u, v, { period: 3, seed: seed + 2, octaves: 5 });
    const c = mix3(base, [base[0] - 18, base[1] - 20, base[2] - 22], cloud);
    return mix3(c, vein, clamp01(veinAt(u, v) * 0.9));
  });
  const rough = paint(size, size, (u, v) => (0.12 + fbm(u, v, { period: 8, seed: seed + 4 }) * 0.08) * 255);
  const H = paint(size, size, (u, v) => (0.5 + fbm(u, v, { period: 16, seed: seed + 6 }) * 0.1) * 255);
  return {
    map: tex(map, { color: true, repeat }),
    roughnessMap: tex(rough, { repeat }),
    normalMap: tex(heightToNormal(H, 0.6), { repeat }),
  };
}

// Pebbled leather grain (Voronoi-ish cells via noise).
export function leatherSet({ size = 512, color = [138, 112, 86], seed = 3, repeat = [4, 4] } = {}) {
  const cell = (u, v) => {
    const n = valueNoise(u * 96, v * 96, 96, seed);
    const m = valueNoise(u * 48, v * 48, 48, seed + 1);
    return clamp01(Math.pow(n * 0.7 + m * 0.3, 1.6));
  };
  const H = paint(size, size, (u, v) => cell(u, v) * 255);
  const map = paint(size, size, (u, v) => {
    const t = fbm(u, v, { period: 2, seed: seed + 2, octaves: 3 });
    const k = 0.9 + t * 0.15 - (1 - cell(u, v)) * 0.08;
    return [color[0] * k, color[1] * k, color[2] * k];
  });
  const rough = paint(size, size, (u, v) => (0.42 + (1 - cell(u, v)) * 0.2) * 255);
  return {
    map: tex(map, { color: true, repeat }),
    roughnessMap: tex(rough, { repeat }),
    normalMap: tex(heightToNormal(H, 1.2), { repeat }),
  };
}

// Fine matte plaster / paint.
export function plasterSet({ size = 512, color = [206, 196, 184], seed = 11, repeat = [3, 3] } = {}) {
  const map = paint(size, size, (u, v) => {
    const k = 0.97 + fbm(u, v, { period: 4, seed, octaves: 5 }) * 0.06;
    return [color[0] * k, color[1] * k, color[2] * k];
  });
  const H = paint(size, size, (u, v) => (0.5 + valueNoise(u * 128, v * 128, 128, seed + 1) * 0.5) * 255);
  const rough = paint(size, size, (u, v) => (0.85 + fbm(u, v, { period: 8, seed: seed + 2 }) * 0.1) * 255);
  return {
    map: tex(map, { color: true, repeat }),
    roughnessMap: tex(rough, { repeat }),
    normalMap: tex(heightToNormal(H, 0.25), { repeat }),
  };
}

// Woven fabric (for upholstery).
export function fabricSet({ size = 256, color = [196, 176, 150], seed = 5, repeat = [8, 8] } = {}) {
  const H = paint(size, size, (u, v, x, y) => {
    const a = Math.sin(x * Math.PI / 2) * 0.5 + 0.5, b = Math.sin(y * Math.PI / 2) * 0.5 + 0.5;
    return ((x + y) % 4 < 2 ? a : b) * 255;
  });
  const map = paint(size, size, (u, v) => {
    const k = 0.92 + fbm(u, v, { period: 4, seed }) * 0.12;
    return [color[0] * k, color[1] * k, color[2] * k];
  });
  return {
    map: tex(map, { color: true, repeat }),
    roughnessMap: null,
    normalMap: tex(heightToNormal(H, 0.8), { repeat }),
  };
}

// ---------- material library ----------
// Call createMaterials(loaders) once; parts read from the returned object.
// Parts may clone() a material and change texture repeat on the clone's maps
// (clone the textures too: m.map = m.map.clone(); m.map.repeat.set(..)).

export function createMaterials({ textureLoader }) {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);

  const oakTex = woodSet({ light: [196, 150, 104], dark: [140, 96, 60], seed: 2, rings: 10, roughBase: 0.5 });
  const walnutTex = woodSet({ light: [140, 96, 62], dark: [84, 54, 32], seed: 4, rings: 16, roughBase: 0.45 });
  const veneerTex = woodSet({ light: [178, 132, 92], dark: [128, 88, 56], seed: 8, rings: 8, roughBase: 0.5, size: 1024 });
  const marbleTex = marbleSet({});
  const leatherTex = leatherSet({});
  const plasterTex = plasterSet({});
  const fabricTex = fabricSet({});

  // Floor: vendored hardwood textures (sRGB albedo).
  const floorMap = textureLoader.load('assets/textures/hardwood2_diffuse.jpg');
  floorMap.colorSpace = THREE.SRGBColorSpace;
  const floorRough = textureLoader.load('assets/textures/hardwood2_roughness.jpg');
  const floorNormal = textureLoader.load('assets/textures/hardwood2_normal.png');
  for (const t of [floorMap, floorRough, floorNormal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.repeat.set(2, 3);
  }

  return {
    floorOak: P({ map: floorMap, roughnessMap: floorRough, roughness: 0.75, color: 0xd8b48a,
      clearcoat: 0.25, clearcoatRoughness: 0.35, normalMap: floorNormal, normalScale: new THREE.Vector2(0.5, 0.5) }),
    oak: P({ ...oakTex, roughness: 1, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    walnut: P({ ...walnutTex, roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    veneer: P({ ...veneerTex, roughness: 1, clearcoat: 0.12, clearcoatRoughness: 0.45 }),
    marble: P({ ...marbleTex, roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.08 }),
    leather: P({ ...leatherTex, roughness: 1, sheen: 0.3, sheenRoughness: 0.6, sheenColor: 0xd9c2a5 }),
    plaster: P({ ...plasterTex, roughness: 1 }),
    plasterCeiling: P({ ...plasterSet({ color: [228, 222, 214], seed: 21 }), roughness: 1 }),
    fabric: P({ ...fabricTex, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.8, sheenColor: 0xffffff }),
    brass: P({ color: 0xc9a46a, metalness: 1, roughness: 0.28 }),
    brushedBrass: P({ color: 0xc09a60, metalness: 1, roughness: 0.42 }),
    chrome: P({ color: 0xf2f2f2, metalness: 1, roughness: 0.06 }),
    blackMetal: P({ color: 0x141312, metalness: 0.6, roughness: 0.45 }),
    ceramic: P({ color: 0xf4f2ee, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }),
    whitePlastic: P({ color: 0xeeebe4, roughness: 0.38 }),
    darkPlastic: P({ color: 0x2a2a2a, roughness: 0.5 }),
    terracotta: P({ color: 0xbfae98, roughness: 0.85 }),
    soil: P({ color: 0x3a2a1e, roughness: 1 }),
    canvasPaper: P({ color: 0xf1ebdf, roughness: 0.9 }),
    glass: P({ color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.003, ior: 1.5 }),
    // Emissive LED material (warm 2700 K). Clone + set emissiveIntensity per use.
    led: P({ color: 0x000000, emissive: 0xffc58a, emissiveIntensity: 8, roughness: 1 }),
    ledDiffuser: P({ color: 0xffffff, emissive: 0xffd1a0, emissiveIntensity: 12, roughness: 0.6 }),
    // helpers for custom sets
    sets: { woodSet, marbleSet, leatherSet, plasterSet, fabricSet },
  };
}

// Warm light color for a color temperature (approx, Kelvin).
export function kelvin(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (x) => Math.min(255, Math.max(0, x)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

// Rounded box helper with bevel (meters). Parts use this a lot.
export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
