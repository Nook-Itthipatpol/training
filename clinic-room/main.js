// Main frame: renderer, camera, environment, lights, post, path tracer.
// URL params: ?mode=preview (raster, default) | ?mode=final (path traced)
//             &samples=N (final only, default 1500)  &scale=0.5 (render scale)

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WebGLPathTracer, DenoiseMaterial } from 'three-gpu-pathtracer';

import * as dims from './lib/dims.js';
import { createMaterials, kelvin } from './lib/materials.js';

const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'preview';
const SAMPLES = +(params.get('samples') || 1500); // CPU-only box: use ~250
const SCALE = +(params.get('scale') || 1);
const status = (s) => { window.__status = s; const el = document.getElementById('status'); if (el) el.textContent = s; };

const W = Math.round(dims.camera.width * SCALE);
const H = Math.round(dims.camera.height * SCALE);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = +(params.get('exposure') || 0.62);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// ---------- camera (level, with vertical lens shift like an architectural photo) ----------
function makeCamera() {
  const c = dims.camera;
  const f = c.focalPx * SCALE, w = W, h = H, horizon = c.horizonY * SCALE;
  const halfFull = Math.max(horizon, h - horizon);
  const fullH = halfFull * 2;
  const cam = new THREE.PerspectiveCamera(2 * THREE.MathUtils.radToDeg(Math.atan(halfFull / f)), w / fullH, 0.05, 50);
  cam.position.fromArray(c.position);
  cam.lookAt(new THREE.Vector3().fromArray(c.target));
  cam.setViewOffset(w, fullH, 0, halfFull - horizon, w, h);
  cam.updateProjectionMatrix();
  return cam;
}
const camera = makeCamera();

// ---------- scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const mats = createMaterials({ textureLoader });

// ---------- environment (HDR; low fill + reflections only, room is self-lit) ----------
async function loadEnvironment() {
  const hdr = await new HDRLoader().loadAsync('assets/hdr/venice_sunset_1k.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = params.get('env') === '0' ? null : hdr;
  scene.environmentIntensity = 0.12;
  scene.environmentRotation.y = 1.2;
}

// ---------- lights (2600–3300 K) ----------
// Intensities: spots in candela, rect lights in nits. Override via URL (e.g. &down=30).
const LIGHT = {
  down: +(params.get('down') || 22),
  cove: +(params.get('cove') || 10),
  strip: +(params.get('strip') || 4),
  sconce: +(params.get('sconce') || 9),
  emissive: +(params.get('emissive') || 0.18), // global scale on part emissive materials
};
const WHITE = params.get('white') === '1';
// Camera white balance: express light colors relative to a reference white (like a photographer setting WB).
const WB = kelvin(+(params.get('wb') || 4000));
const wbKelvin = (k) => { const c = kelvin(k); c.r /= WB.r; c.g /= WB.g; c.b /= WB.b; const m = Math.max(c.r, c.g, c.b); return c.multiplyScalar(1 / m); };
const warm = WHITE ? new THREE.Color(1, 1, 1) : wbKelvin(2900), warmer = WHITE ? new THREE.Color(1, 1, 1) : wbKelvin(2700), neutral = WHITE ? new THREE.Color(1, 1, 1) : wbKelvin(3600);
const lights = new THREE.Group(); lights.name = 'lights';
scene.add(lights);

function addSpot({ pos, target, color, intensity, angle, penumbra = 0.6, decay = 2, radius = 0.03, shadow = true }) {
  const s = new THREE.SpotLight(color, intensity, 0, angle, penumbra, decay);
  s.position.fromArray(pos);
  s.target.position.fromArray(target);
  s.castShadow = shadow;
  s.shadow.mapSize.set(2048, 2048);
  s.shadow.bias = -0.0002;
  s.shadow.radius = 4;
  s.radius = radius; // used by path tracer for soft shadows
  lights.add(s, s.target);
  return s;
}

function addRect({ pos, rot, w, h, color, intensity }) {
  const r = new THREE.RectAreaLight(color, intensity, w, h);
  r.position.fromArray(pos);
  r.rotation.set(...rot);
  lights.add(r);
  return r;
}

function buildLights() {
  RectAreaLightUniformsLib.init();
  const R = dims.room, FW = dims.featureWall;

  // Recessed ceiling downlights.
  dims.anchors.downlights.forEach((d, i) => {
    const front = d.z > 2;
    addSpot({ pos: [d.x, R.height - 0.06, d.z], target: [d.x, 0, d.z - (front ? 0.6 : 0)], color: neutral,
      intensity: LIGHT.down * (front ? 1.3 : 1), angle: THREE.MathUtils.degToRad(front ? 55 : 42),
      penumbra: 0.85, radius: 0.04 });
  });

  // Cove wash along the top of the feature wall (faces down, grazes the wood).
  addRect({ pos: [0, FW.coveY - 0.01, FW.panelDepth + 0.05], rot: [-Math.PI / 2, 0, 0],
    w: R.width - 0.02, h: 0.06, color: warmer, intensity: LIGHT.cove });

  // Vertical LED reveals (face +z).
  for (const x of FW.ledStripsX) {
    const h = FW.ledStripTop - FW.ledStripBottom;
    addRect({ pos: [x, FW.ledStripBottom + h / 2, FW.panelDepth + 0.006], rot: [0, 0, 0],
      w: 0.012, h, color: warmer, intensity: LIGHT.strip });
  }

  // Brass wall sconce: soft downlight onto the painting + uplight.
  const sc = dims.anchors.sconce;
  addSpot({ pos: [sc.wallX + 0.16, sc.y - 0.02, sc.z], target: [sc.wallX + 0.05, sc.y - 1.2, sc.z],
    color: warm, intensity: LIGHT.sconce, angle: THREE.MathUtils.degToRad(40), penumbra: 1, radius: 0.04 });
  addSpot({ pos: [sc.wallX + 0.16, sc.y + 0.04, sc.z], target: [sc.wallX + 0.05, R.height, sc.z],
    color: warm, intensity: LIGHT.sconce * 0.15, angle: THREE.MathUtils.degToRad(45), penumbra: 1, radius: 0.04, shadow: false });

  // Very soft bounce fill from the camera side (stands in for light from the door/corridor).
  const fill = new THREE.HemisphereLight(0xfff0e0, 0x6b5440, MODE === 'final' ? 0.0 : 0.15);
  lights.add(fill);
}

// ---------- parts ----------
const PARTS = ['shell', 'desk-chairs', 'bed-sink', 'decor'];

async function loadParts() {
  const ctx = { THREE, dims, mats, loaders: { texture: textureLoader, gltf: gltfLoader } };
  for (const name of PARTS) {
    try {
      const mod = await import(`./parts/${name}.js`);
      const g = await mod.build(ctx);
      g.name = name;
      g.traverse((o) => { if (o.isMesh) { o.castShadow ??= true; o.receiveShadow ??= true; } });
      scene.add(g);
    } catch (e) {
      console.error(`part ${name} failed`, e);
    }
  }
  // Scale emissives so LEDs read warm/bright but not blown out.
  const seen = new Set();
  scene.traverse((o) => {
    const ms = o.isMesh ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) if (m && m.emissiveIntensity && !seen.has(m)) {
      seen.add(m); m.emissiveIntensity *= LIGHT.emissive;
      // white-balance emissive colors too
      m.emissive.r /= WB.r; m.emissive.g /= WB.g; m.emissive.b /= WB.b;
      const mx = Math.max(m.emissive.r, m.emissive.g, m.emissive.b); if (mx > 0) m.emissive.multiplyScalar(1 / mx);
    }
  });
  // Default shadows on for every mesh (parts can opt out by setting userData.noShadow)
  scene.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; }
  });
}

// ---------- post ----------
const VignetteGrainShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.22 }, uGrain: { value: 0.012 }, uSeed: { value: 0.37 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uGrain, uSeed; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5; d.x *= 0.95;
      float v = 1.0 - uVignette * smoothstep(0.25, 0.85, length(d) * 1.35);
      c.rgb *= v;
      c.rgb *= 1.0 + (h(vUv * 1000.0) - 0.5) * uGrain; // luminance-proportional grain (linear HDR)
      gl_FragColor = c;
    }`,
};

function makeComposer(inputPass, denoise = false) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: MODE === 'preview' ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(inputPass);
  if (denoise) {
    const dn = new ShaderPass(new DenoiseMaterial(), 'map');
    dn.material.uniforms.sigma.value = +(params.get('dnSigma') || 4);
    dn.material.uniforms.kSigma.value = 1.0;
    dn.material.uniforms.threshold.value = +(params.get('dnThreshold') || 0.06);
    composer.addPass(dn);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.18, 0.55, 2.2); // subtle, only hot LEDs/lamps
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(VignetteGrainShader));
  composer.addPass(new OutputPass()); // ACES + sRGB
  return composer;
}

// ---------- run ----------
async function main() {
  status('loading');
  await loadEnvironment();
  buildLights();
  await loadParts();

  if (MODE === 'preview') {
    const composer = makeComposer(new RenderPass(scene, camera));
    composer.render();
    status('done');
    window.__renderDone = true;
    return;
  }

  // Path traced final.
  status('building BVH');
  const pt = new WebGLPathTracer(renderer);
  pt.renderToCanvas = false;
  pt.rasterizeScene = false;
  pt.minSamples = 0;
  pt.renderDelay = 0;
  pt.fadeDuration = 0;
  pt.bounces = +(params.get('bounces') || 5);
  pt.filterGlossyFactor = 0.5;
  pt.multipleImportanceSampling = true;
  pt.tiles.set(+(params.get('tiles') || 2), +(params.get('tiles') || 2));
  pt.textureSize.set(2048, 2048);
  pt.setScene(scene, camera);

  const texPass = new TexturePass(pt.target.texture);
  const composer = makeComposer(texPass, params.get('denoise') !== '0');
  const t0 = performance.now();
  const tick = () => {
    for (let i = 0; i < 4; i++) pt.renderSample();
    const s = Math.floor(pt.samples);
    status(`sampling ${s}/${SAMPLES} (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
    if (s >= SAMPLES) {
      texPass.map = pt.target.texture;
      composer.render();
      status('done');
      window.__renderDone = true;
      return;
    }
    // Show progress occasionally.
    if (s % 32 === 0) { texPass.map = pt.target.texture; composer.render(); }
    requestAnimationFrame(tick);
  };
  tick();
}

main().catch((e) => { console.error(e); status('error: ' + e.message); window.__renderError = String(e.stack || e); });
