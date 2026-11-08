export function build({ THREE, dims, mats }) {
  const g = new THREE.Group(); const R = dims.room;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.width, R.length), mats.floorOak); floor.rotation.x = -Math.PI/2; floor.position.set(0,0,R.length/2); g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(R.width, R.length), mats.plasterCeiling); ceil.rotation.x = Math.PI/2; ceil.position.set(0,R.height,R.length/2); g.add(ceil);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(R.width, R.height), mats.veneer); back.position.set(0,R.height/2,0); g.add(back);
  for (const s of [-1,1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(R.length, R.height), mats.plaster); w.rotation.y = -s*Math.PI/2; w.position.set(s*R.width/2,R.height/2,R.length/2); g.add(w); }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(R.width, R.height), mats.plaster); front.rotation.y = Math.PI; front.position.set(0,R.height/2,R.length); g.add(front);
  const a = dims.anchors;
  for (const k of ['examBed','vanity','desk']) { const b=a[k]; const m=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d), k==='desk'?mats.marble:mats.walnut); m.position.set(b.x,b.h/2,b.z); g.add(m); }
  for (const c of [a.chairBehind, ...a.chairsFront]) { const m=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.85,0.55), mats.leather); m.position.set(c.x,0.425,c.z); g.add(m); }
  return g;
}
