// three.js 장면을 소프트웨어로 그려 PNG 로 (빛: 반구광 + 방향광, Lambert, 안개). 폰 없이 화면 구성을 보려고.
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export function renderPNG(scene: THREE.Scene, cam: THREE.PerspectiveCamera, W: number, H: number, out: string) {
  scene.updateMatrixWorld(true); cam.updateMatrixWorld(true);
  const col = new Float32Array(W * H * 3), zb = new Float32Array(W * H).fill(Infinity);
  const bg = (scene.background as THREE.Color) ?? new THREE.Color(0, 0, 0);
  for (let i = 0; i < W * H; i++) { col[i * 3] = bg.r; col[i * 3 + 1] = bg.g; col[i * 3 + 2] = bg.b; }
  const lights: { type: string; l: THREE.Light }[] = [];
  scene.traverse(o => { if ((o as THREE.Light).isLight) lights.push({ type: o.type, l: o as THREE.Light }); });
  const fog = scene.fog as THREE.Fog | null;
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const camPos = cam.getWorldPosition(new THREE.Vector3());
  const shadeV = (albedo: THREE.Color, n: THREE.Vector3, lit: boolean) => {
    if (!lit) return albedo.clone();
    const c = new THREE.Color(0, 0, 0);
    for (const { type, l } of lights) {
      if (type === 'HemisphereLight') {
        const h = l as THREE.HemisphereLight; const t = 0.5 * n.y + 0.5;
        const irr = h.groundColor.clone().lerp(h.color, t).multiplyScalar(h.intensity);
        c.add(irr);
      } else if (type === 'DirectionalLight') {
        const d = l as THREE.DirectionalLight; const L = d.position.clone().sub(d.target.position).normalize();
        c.add(d.color.clone().multiplyScalar(d.intensity * Math.max(0, n.dot(L))));
      }
    }
    return new THREE.Color(albedo.r * c.r / Math.PI, albedo.g * c.g / Math.PI, albedo.b * c.b / Math.PI);
  };
  const meshes: THREE.Mesh[] = [];
  scene.traverseVisible(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  // 투명한 것은 나중에
  meshes.sort((a, b) => Number((a.material as THREE.Material).transparent) - Number((b.material as THREE.Material).transparent));
  for (const m of meshes) {
    const mat = m.material as THREE.MeshLambertMaterial & THREE.MeshBasicMaterial;
    const lit = (mat as THREE.Material).type === 'MeshLambertMaterial';
    const g = m.geometry; const P = g.getAttribute('position'); const N = g.getAttribute('normal'); const Cc = g.getAttribute('color');
    const idx = g.index ? Array.from(g.index.array) : [...Array(P.count).keys()];
    const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    const vs: { clip: THREE.Vector4; c: THREE.Color; wz: number }[] = [];
    const emis = (mat as THREE.MeshLambertMaterial).emissive ?? new THREE.Color(0, 0, 0);
    for (let i = 0; i < P.count; i++) {
      const wp = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m.matrixWorld);
      const n = N ? new THREE.Vector3(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize() : new THREE.Vector3(0, 1, 0);
      const alb = mat.vertexColors && Cc ? new THREE.Color(Cc.getX(i), Cc.getY(i), Cc.getZ(i)) : mat.color.clone();
      let c = shadeV(alb, n, lit).add(emis);
      if (fog && mat.fog !== false) { const d = wp.distanceTo(camPos); const f = Math.max(0, Math.min(1, (d - fog.near) / (fog.far - fog.near))); c = c.lerp(fog.color, f); }
      const clip = new THREE.Vector4(wp.x, wp.y, wp.z, 1).applyMatrix4(vp);
      vs.push({ clip, c, wz: 0 });
    }
    const side = mat.side;
    const alpha = mat.transparent ? mat.opacity : 1;
    for (let t = 0; t < idx.length; t += 3) {
      let poly = [vs[idx[t]], vs[idx[t + 1]], vs[idx[t + 2]]].map(v => ({ p: v.clip.clone(), c: v.c.clone() }));
      // 가까운 면 자르기 (w > 0.05)
      const clipped: typeof poly = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ina = a.p.w > 0.05, inb = b.p.w > 0.05;
        if (ina) clipped.push(a);
        if (ina !== inb) { const k = (0.05 - a.p.w) / (b.p.w - a.p.w); clipped.push({ p: a.p.clone().lerp(b.p, k), c: a.c.clone().lerp(b.c, k) }); }
      }
      if (clipped.length < 3) continue;
      const sp = clipped.map(v => ({ x: (v.p.x / v.p.w * 0.5 + 0.5) * W, y: (1 - (v.p.y / v.p.w * 0.5 + 0.5)) * H, z: v.p.w, c: v.c }));
      for (let k = 1; k < sp.length - 1; k++) {
        const A = sp[0], B = sp[k], Cv = sp[k + 1];
        const area = (B.x - A.x) * (Cv.y - A.y) - (Cv.x - A.x) * (B.y - A.y);
        if (side === THREE.FrontSide && area >= 0) continue;
        if (side === THREE.BackSide && area <= 0) continue;
        if (area === 0) continue;
        const x0 = Math.max(0, Math.floor(Math.min(A.x, B.x, Cv.x))), x1 = Math.min(W - 1, Math.ceil(Math.max(A.x, B.x, Cv.x)));
        const y0 = Math.max(0, Math.floor(Math.min(A.y, B.y, Cv.y))), y1 = Math.min(H - 1, Math.ceil(Math.max(A.y, B.y, Cv.y)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((B.x - px) * (Cv.y - py) - (Cv.x - px) * (B.y - py)) / area;
          const w1 = ((Cv.x - px) * (A.y - py) - (A.x - px) * (Cv.y - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w0 / A.z + w1 / B.z + w2 / Cv.z);
          const o = y * W + x;
          if (mat.depthTest !== false && z >= zb[o]) continue;
          if (mat.depthWrite !== false) zb[o] = z;
          const r = (w0 * A.c.r / A.z + w1 * B.c.r / B.z + w2 * Cv.c.r / Cv.z) * z;
          const gg = (w0 * A.c.g / A.z + w1 * B.c.g / B.z + w2 * Cv.c.g / Cv.z) * z;
          const bb = (w0 * A.c.b / A.z + w1 * B.c.b / B.z + w2 * Cv.c.b / Cv.z) * z;
          col[o * 3] = col[o * 3] * (1 - alpha) + r * alpha; col[o * 3 + 1] = col[o * 3 + 1] * (1 - alpha) + gg * alpha; col[o * 3 + 2] = col[o * 3 + 2] * (1 - alpha) + bb * alpha;
        }
      }
    }
  }
  const toS = (v: number) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3, q = y * (W * 3 + 1) + 1 + x * 3; raw[q] = toS(col[o]); raw[q + 1] = toS(col[o + 1]); raw[q + 2] = toS(col[o + 2]); }
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
