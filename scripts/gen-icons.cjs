// 앱 아이콘 생성 — 픽셀(복셀풍) 알. 외부 패키지 없이 PNG를 직접 쓴다.
// 실행: node scripts/gen-icons.cjs
const fs = require('fs');
const zlib = require('zlib');

function png(w, h, px) {
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];

// 알 모양 격자 (GW x GH). 위가 좁은 달걀형.
const GW = 14, GH = 18;
function eggCell(i, j) {
  const x = (i + 0.5 - GW / 2) / (GW / 2), y = (j + 0.5 - GH * 0.56) / (GH / 2);
  const k = y < 0 ? 1 + 0.35 * -y : 1;   // 위로 갈수록 좁게
  return (x * k) ** 2 + y * y <= 1;
}
const SPOTS = new Set(['4,5', '5,5', '9,8', '10,8', '9,9', '5,12', '6,12', '10,13']);
// 면 음영 1 / 0.86 / 0.72 — 숙제앱 복셀 렌더와 같은 비율
const shade = (c, f) => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f), 255];

function draw(size, egg, bg) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= size || y >= size) return; px.set(c, (y * size + x) * 4); };
  if (bg) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, bg);
  const cell = Math.floor(size * egg / GH);
  const ox = Math.floor((size - cell * GW) / 2), oy = Math.floor((size - cell * GH) / 2);
  const depth = Math.max(2, Math.round(cell * 0.28));
  const shell = hex('#fff6e2'), spot = hex('#ffb21f');
  // 아래·오른쪽 옆면(어두운 면) 먼저, 그 위에 앞면
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (!eggCell(i, j)) continue;
    const base = SPOTS.has(`${i},${j}`) ? spot : shell;
    for (let d = 1; d <= depth; d++) for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const f = (x + d >= cell || y + d >= cell) ? 0.72 : 0.86;
      put(ox + i * cell + x + d, oy + j * cell + y + d, shade(base, f));
    }
  }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (!eggCell(i, j)) continue;
    const base = SPOTS.has(`${i},${j}`) ? spot : shell;
    const light = i < GW / 2 && j < GH / 2 ? 1 : (i + j > GW + 4 ? 0.9 : 0.96);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const edge = x === 0 || y === 0;
      put(ox + i * cell + x, oy + j * cell + y, edge ? shade(base, light * 0.94) : shade(base, light));
    }
  }
  return png(size, size, px);
}

fs.writeFileSync('assets/icon.png', draw(1024, 0.72, hex('#ffe9a8')));
fs.writeFileSync('assets/adaptive-icon.png', draw(1024, 0.5, null));   // 가장자리가 잘리므로 작게
fs.writeFileSync('assets/splash-icon.png', draw(512, 0.7, null));
fs.writeFileSync('assets/favicon.png', draw(48, 0.8, hex('#ffe9a8')));
console.log('icons written');
