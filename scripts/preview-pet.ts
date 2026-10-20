// 펫 미리보기 — 여러 방향으로 그려 PNG 로 저장한다 (앱과 같은 그리기 코드).
// 종류·변종: SPECIES=cat VARIANT=2   단계·옷: STAGE=baby TOP=top_tee_red HAT=hat_cap_blue npx tsx scripts/preview-pet.ts out.png 10 12
// 실행: npx tsx scripts/preview-pet.ts out.png 10 12 14 0 6        (숫자 = 방향 번호 0~15, 10 = 정면)
//       npx tsx scripts/preview-pet.ts out.png happy sad angry 10   (표정 이름을 섞으면 표정 x 방향으로 그린다)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { petModel, type BodyStage, type Expr } from '../src/pet/model';
import type { Species } from '../src/pet/species';
import { petLayers, FACE_CAMERA } from '../src/pet/layers';

const out = process.argv[2];
const args = process.argv.slice(3);
const exprs = (args.filter(a => isNaN(Number(a))) as Expr[]);
const dirs = args.filter(a => !isNaN(Number(a))).map(Number);
const idxs: [Expr, number][] = (exprs.length ? exprs : ['normal' as Expr]).flatMap(e => (dirs.length ? dirs : [10]).map(d => [e, d] as [Expr, number]));
const KV = 12, CW = 180, CH = 240;
const W = CW * idxs.length, H = CH;
const px = new Uint8Array(W * H * 3).fill(250);
const hex = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
function fill(poly: [number, number][], c: number[]) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++)
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y + .5) !== (yj > y + .5) && x + .5 < (xj - xi) * (y + .5 - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) px.set(c, (y * W + x) * 3);
    }
}
idxs.forEach(([expr, idx], n) => {
  const env = process.env;
  const stage = (env.STAGE ?? 'teen') as BodyStage;
  const sp = (env.SPECIES ?? 'bear') as Species, v = Number(env.VARIANT ?? 0);
  const L = petLayers(petModel(sp, v, expr, stage, { top: env.TOP, hat: env.HAT }), [sp, v, expr, stage, env.TOP, env.HAT].join('-'), idx, KV);
  const ox = n * CW + CW / 2, oy = CH - 50;
  const draw = (id: keyof typeof L.parts) => {
    for (const p of L.parts[id].polys) fill(p.points.split(' ').map(s => { const [a, b] = s.split(',').map(Number); return [a + ox, b + oy] as [number, number]; }), hex(p.fill));
  };
  for (const id of L.order) { if (id === 'headGroup') L.headOrder.forEach(draw); else draw(id); }
});
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('FACE_CAMERA', FACE_CAMERA);
