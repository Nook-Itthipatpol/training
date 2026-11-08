// Room dimensions and anchor points (meters). Single source of truth.
// Axes: x = right, y = up, z = toward camera. Back (feature) wall at z = 0,
// floor at y = 0, room centered on x = 0. Door/camera wall at z = room.length.

export const room = {
  width: 2.75,   // x: -1.375 .. 1.375
  length: 4.1,   // z: 0 .. 4.1
  height: 3.0,   // y: 0 .. 3.0
  wallLineY: 0.9, // shadow-gap line on side walls
  skirtingH: 0.08,
};

export const half = room.width / 2;

export const camera = {
  position: [0, 1.36, 3.9],
  target: [0, 1.36, 0], // level look (verticals stay straight)
  // Horizon sits above frame center (architectural shift lens)
  focalPx: 830,         // focal length in pixels at output size
  horizonY: 494,        // horizon row in output image (px from top)
  width: 1064,
  height: 1140,
};

// Feature wall (back wall, z = 0). Wood panels stand slightly proud.
export const featureWall = {
  panelDepth: 0.04,             // panels occupy z 0 .. 0.04
  coveY: 2.88,                  // LED cove line below ceiling
  ledStripsX: [-0.82, -0.57, 0.48, 0.95], // vertical LED reveals
  ledStripBottom: 1.1,
  ledStripTop: 2.88,
};

// Furniture anchors: center of footprint on the floor unless noted.
export const anchors = {
  examBed:  { x: 0.30, z: 0.38, w: 1.85, d: 0.62, h: 0.72 }, // against back wall
  vanity:   { x: -1.075, z: 0.26, w: 0.58, d: 0.44, h: 0.82 }, // against left wall + back wall
  desk:     { x: 0.30, z: 1.35, w: 1.65, d: 0.62, h: 0.76 },
  chairBehind: { x: 0.30, z: 0.85, rotY: 0 },                  // faces camera (+z)
  chairsFront: [                                              // face back wall (-z)
    { x: -0.38, z: 2.10, rotY: Math.PI },
    { x: 0.30, z: 2.12, rotY: Math.PI },
    { x: 0.98, z: 2.10, rotY: Math.PI },
  ],
  plant:    { x: 1.12, z: 0.62, y: 0.0 },                     // pot on floor, right corner
  painting: { wallX: -half, zCenter: 1.0, yCenter: 1.65, w: 1.05, h: 1.25 }, // on left wall
  sconce:   { wallX: -half, z: 1.0, y: 2.55 },                // above painting
  acUnit:   { x: -0.05, y: 2.58, w: 0.82, h: 0.28, d: 0.21 }, // on feature wall
  downlights: [ { x: -0.70, z: 0.45 }, { x: 0.80, z: 0.45 } ], // ceiling
};
