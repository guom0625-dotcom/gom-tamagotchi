// 숲길 달리기의 3D 세상 — 하늘·먼 산·초록 언덕·흙길·풀 둑·울타리·나무·꽃·버섯·장애물.
// (2026-10-26 사용자 결정: 빙판 대신 숲길 — 곰·강아지·고양이·다람쥐에게 어울리게)
// 길은 30m 조각(chunk)으로 만들어 펫이 지나가면 뒤 조각을 버리고 앞에 새로 붙인다. 장애물은 미리 만든 것을 돌려쓴다.
import * as THREE from 'three';
import { BoxBuilder, outlineMaterial, voxelMaterial } from './boxes';
import { BANK, BANK_H, HW, cxAt, headingAt, yAt } from './track';

export const CHUNK = 30;
const STEP = 2;                 // 길 그물의 앞뒤 간격 (m)
const AHEAD = 190;              // 앞으로 만들어 둘 거리
const BEHIND = 40;              // 시작할 때 카메라가 앞에서 펫을 보므로 뒤쪽 길도 보인다
export const SKY = '#BFE6FF';
const OUT = 0.05;               // 테두리 두께 (m)

// 정해진 씨앗으로 늘 같은 무작위 (같은 조각은 같은 모습)
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 길 가로 단면: [가운데에서 떨어진 거리(m), 높이, 색]
const DIRT = '#CDA26A', DIRT2 = '#C1955E', EDGE = '#A98450', GRASS = '#7DC657', GRASS2 = '#6DB84A', MEADOW = '#8ACF5E';
function profile(): [number, number, string][] {
    const half: [number, number, string][] = [
        [0, 0, DIRT], [HW * 0.5, 0, DIRT], [HW, 0, EDGE],
        [HW + 0.5, 0.35, GRASS], [HW + BANK, BANK_H, GRASS2], [HW + BANK + 4, BANK_H + 0.3, GRASS],
        [HW + BANK + 18, BANK_H + 1.5, MEADOW], [HW + BANK + 60, BANK_H + 6, GRASS2],
    ];
    const left = half.slice(1).reverse().map(([x, y, c]) => [-x, y, c] as [number, number, string]);
    return [...left, ...half];
}
const PROFILE = profile();
/** 길 가운데에서 off(m) 떨어진 곳의 땅 높이 (길 높이 기준) */
export function groundOff(off: number) {
    const a = Math.abs(off);
    const half = PROFILE.filter(p => p[0] >= 0);
    for (let i = 1; i < half.length; i++) {
        const [x0, y0] = half[i - 1], [x1, y1] = half[i];
        if (a <= x1) return y0 + (y1 - y0) * (a - x0) / (x1 - x0);
    }
    return half[half.length - 1][1];
}

// ── 숲 꾸밈 ─────────────────────────────────────
function leafTree(b: BoxBuilder, x: number, y: number, z: number, k: number, r: () => number) {
    b.add(x - 0.35 * k, y, z - 0.35 * k, x + 0.35 * k, y + 2.4 * k, z + 0.35 * k, '#7A5236');
    const pal = r() < 0.15 ? ['#F2A23A', '#E8873A'] : r() < 0.3 ? ['#9BD36A', '#86C657'] : ['#4FA84A', '#43983F'];
    const top = y + 2.2 * k;
    b.add(x - 1.6 * k, top, z - 1.6 * k, x + 1.6 * k, top + 2.0 * k, z + 1.6 * k, pal[0]);
    b.add(x - 1.1 * k, top + 2.0 * k, z - 1.1 * k, x + 1.1 * k, top + 2.8 * k, z + 1.1 * k, pal[1]);
    b.add(x + 0.9 * k, top + 0.4 * k, z - 0.6 * k, x + 2.0 * k, top + 1.5 * k, z + 0.6 * k, pal[1]);
    b.add(x - 2.0 * k, top + 0.6 * k, z - 0.5 * k, x - 1.0 * k, top + 1.6 * k, z + 0.7 * k, pal[1]);
    if (pal[0] === '#4FA84A' && r() < 0.4) b.add(x + 0.5 * k, top + 0.8 * k, z + 1.55 * k, x + 0.9 * k, top + 1.2 * k, z + 1.75 * k, '#E8483F');   // 사과
}
function pineTree(b: BoxBuilder, x: number, y: number, z: number, k: number, r: () => number) {
    b.add(x - 0.3 * k, y, z - 0.3 * k, x + 0.3 * k, y + 1.1 * k, z + 0.3 * k, '#7A5236');
    const layers: [number, number][] = [[1.9, 1.0], [1.45, 2.0], [1.0, 3.0], [0.55, 4.0]];
    for (const [w, h0] of layers) b.add(x - w * k, y + h0 * k, z - w * k, x + w * k, y + (h0 + 1.05) * k, z + w * k, r() < 0.5 ? '#2F8F5B' : '#2A7F52', '#3AA066');
}
function flower(b: BoxBuilder, x: number, y: number, z: number, r: () => number) {
    const c = ['#FF6B8A', '#FFD23A', '#FFFFFF', '#B58CFF', '#FF8A3D'][Math.floor(r() * 5)];
    b.add(x - 0.04, y, z - 0.04, x + 0.04, y + 0.45, z + 0.04, '#3E9B4F', undefined, undefined, false);
    b.add(x - 0.18, y + 0.42, z - 0.18, x + 0.18, y + 0.62, z + 0.18, c, undefined, undefined, false);
}
function mushroom(b: BoxBuilder, x: number, y: number, z: number) {
    b.add(x - 0.15, y, z - 0.15, x + 0.15, y + 0.45, z + 0.15, '#F5EBDD');
    b.add(x - 0.42, y + 0.45, z - 0.42, x + 0.42, y + 0.75, z + 0.42, '#E8483F');
    b.add(x - 0.1, y + 0.75, z + 0.1, x + 0.08, y + 0.78, z + 0.28, '#FFFFFF', undefined, undefined, false);
}
function bush(b: BoxBuilder, x: number, y: number, z: number, k: number) {
    b.add(x - 0.9 * k, y, z - 0.7 * k, x + 0.9 * k, y + 0.9 * k, z + 0.7 * k, '#4FA84A');
    b.add(x - 0.5 * k, y + 0.9 * k, z - 0.4 * k, x + 0.6 * k, y + 1.3 * k, z + 0.5 * k, '#5DB955');
}

const tmpC = new THREE.Color();
/** 길 한 조각: 흙길 + 풀 둑 + 풀밭 + 울타리·나무·꽃·버섯·바위 */
function buildChunk(index: number): BoxBuilder {
    const s0 = index * CHUNK;
    const r = rng(index * 7919 + 13);
    const b = new BoxBuilder();

    // 땅 그물
    const rows = CHUNK / STEP + 1, cols = PROFILE.length;
    const pos: number[] = [], col: number[] = [];
    for (let i = 0; i < rows; i++) {
        const s = s0 + i * STEP;
        const cx = cxAt(s), y = yAt(s);
        const band = Math.floor(s / 6) % 2 === 0;
        for (let j = 0; j < cols; j++) {
            const [off, h, c] = PROFILE[j];
            const outer = Math.abs(off) > HW + BANK;
            // 풀밭은 살짝 울퉁불퉁
            const bump = outer ? (Math.sin(s * 0.21 + off * 0.37) + Math.sin(s * 0.07 - off * 0.11)) * 0.35 : 0;
            pos.push(cx + off, y + h + bump, -s);
            tmpC.setStyle(c === DIRT && band ? DIRT2 : c);
            if (outer || c === GRASS || c === GRASS2) tmpC.offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.05);
            col.push(tmpC.r, tmpC.g, tmpC.b);
        }
    }
    const idx: number[] = [];
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, c = a + cols;
        idx.push(a, a + 1, c + 1, a, c + 1, c);   // 앞이 -z 라서 이 순서가 위를 본다
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.addRaw(pos, Array.from(g.getAttribute('normal').array as Float32Array), col, idx);
    g.dispose();

    const at = (s: number, off: number): [number, number, number] => [cxAt(s) + off, yAt(s) + groundOff(off) - 0.1, -s];

    // 길 위 작은 돌멩이·풀포기 (흙길이 밋밋하지 않게)
    for (let n = 0; n < 10; n++) {
        const s = s0 + r() * CHUNK, off = (r() * 2 - 1) * HW * 0.95;
        const x = cxAt(s) + off, y = yAt(s), z = -s;
        if (r() < 0.6) b.add(x - 0.12, y, z - 0.1, x + 0.12, y + 0.07, z + 0.1, '#A68A68', undefined, undefined, false);
        else b.add(x - 0.15, y, z - 0.05, x + 0.15, y + 0.14, z + 0.05, '#7DBF55', undefined, undefined, false);
    }

    // 둑 위 나무 울타리 (기둥 4m 마다, 가로대 두 줄)
    for (const side of [-1, 1]) {
        const off = side * (HW + 1.0);
        let prev: [number, number, number] | null = null;
        for (let s = s0 + (4 - (s0 % 4)) % 4; s <= s0 + CHUNK; s += 4) {
            const [x, y, z] = at(s, off);
            b.add(x - 0.13, y, z - 0.13, x + 0.13, y + 1.2, z + 0.13, '#9C6B43', '#B88358');
            if (prev) {
                // 기둥 사이 가로대: 두 기둥을 잇는 방향으로 돌린 상자
                const dx = x - prev[0], dz = z - prev[2], len = Math.hypot(dx, dz);
                const m = new THREE.Matrix4().makeRotationY(Math.atan2(-dx, -dz) + Math.PI / 2).setPosition((x + prev[0]) / 2, (y + prev[1]) / 2, (z + prev[2]) / 2);
                for (const hy of [0.45, 0.9]) b.add(-len / 2, hy, -0.06, len / 2, hy + 0.14, 0.06, '#B07A4E', undefined, m);
            }
            prev = [x, y, z];
        }
    }

    // 나무 (활엽수·소나무)
    const trees = 8 + Math.floor(r() * 5);
    for (let n = 0; n < trees; n++) {
        const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1;
        const off = side * (HW + BANK + 2.5 + Math.pow(r(), 1.5) * 34);
        const [x, y, z] = at(s, off), k = 0.8 + r() * 0.9;
        if (r() < 0.65) leafTree(b, x, y, z, k, r); else pineTree(b, x, y, z, k * 1.1, r);
    }
    // 덤불 (둑 바로 바깥)
    for (let n = 0; n < 4; n++) {
        const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1;
        const [x, y, z] = at(s, side * (HW + BANK + 0.8 + r() * 2));
        bush(b, x, y, z, 0.7 + r() * 0.6);
    }
    // 꽃·버섯
    for (let n = 0; n < 16; n++) {
        const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1;
        const [x, y, z] = at(s, side * (HW + 0.6 + r() * 12));
        if (r() < 0.85) flower(b, x, y + 0.05, z, r); else mushroom(b, x, y, z);
    }
    // 바위
    const rocks = Math.floor(r() * 3);
    for (let n = 0; n < rocks; n++) {
        const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1;
        const [x, y, z] = at(s, side * (HW + BANK + 1.5 + r() * 20));
        b.add(x - 1, y, z - 0.8, x + 1, y + 0.9, z + 0.8, '#8E9196', '#7FB25A');
        b.add(x - 0.5, y + 0.9, z - 0.4, x + 0.6, y + 1.4, z + 0.5, '#9A9DA2', '#8CC063');
    }
    // 가끔 버섯 집
    if (r() < 0.25) {
        const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1;
        const [x, y, z] = at(s, side * (HW + BANK + 7 + r() * 8));
        const m = new THREE.Matrix4().makeRotationY(headingAt(s) + (side < 0 ? Math.PI / 2 : -Math.PI / 2)).setPosition(x, y, z);
        b.add(-1.4, 0, -1.4, 1.4, 2.2, 1.4, '#F5EBDD', undefined, m);
        b.add(-2.3, 2.2, -2.3, 2.3, 3.3, 2.3, '#E8483F', undefined, m);
        b.add(-1.4, 3.3, -1.4, 1.4, 4.0, 1.4, '#E8483F', undefined, m);
        b.add(-0.4, 0, 1.38, 0.4, 1.3, 1.45, '#8A5A3B', undefined, m, false);
        b.add(0.6, 1.2, 1.38, 1.1, 1.7, 1.45, '#7FC7F2', undefined, m, false);
        b.add(-1.0, 3.0, 2.25, -0.5, 3.4, 2.32, '#FFFFFF', undefined, m, false);
    }
    return b;
}

// ── 장애물·모을 것 ───────────────────────────────
// friend = 우리에 갇힌 친구 (구하면 파워업), creek = 길 전체를 가로지르는 시냇물 (꼭 뛰어넘어야 한다)
export type ObjKind = 'rock' | 'stump' | 'puddle' | 'fruit' | 'ramp' | 'seed' | 'friend' | 'creek';
/** 부딪힘 반폭 (m). creek 은 길 전체 */
export const OBJ_HALF: Record<ObjKind, number> = { rock: 1.15, stump: 0.85, puddle: 1.4, fruit: 0.6, ramp: 1.3, seed: 0.8, friend: 1.2, creek: HW };
/** 시냇물 앞뒤 길이 (m) */
export const CREEK_LEN = 5;

function rockGeom() {
    return new BoxBuilder()
        .add(-1.15, 0, -0.8, 1.15, 1.2, 0.8, '#8E9196', '#7FB25A')
        .add(-0.8, 1.2, -0.55, 0.7, 1.9, 0.5, '#A0A3A8', '#8CC063')
        .add(0.5, 0, 0.5, 1.3, 0.6, 1.0, '#868A8F', '#7FB25A');
}
function stumpGeom() {
    return new BoxBuilder()
        .add(-0.8, 0, -0.8, 0.8, 1.3, 0.8, '#8A5A3B', '#E3C08A')
        .add(-0.55, 1.3, -0.55, 0.55, 1.32, 0.55, '#C99A62', undefined, undefined, false)      // 나이테
        .add(-0.25, 1.32, -0.25, 0.25, 1.34, 0.25, '#B5844F', undefined, undefined, false)
        .add(-1.15, 0, -0.25, -0.8, 0.35, 0.25, '#7A4F33')                                       // 뿌리
        .add(0.8, 0, -0.2, 1.1, 0.3, 0.2, '#7A4F33')
        .add(0.4, 0.7, 0.8, 0.75, 1.0, 0.95, '#E8483F')                                          // 버섯 하나
        .add(0.52, 0.5, 0.82, 0.62, 0.7, 0.9, '#F5EBDD');
}
function fruitGeom() {
    return new BoxBuilder()
        .add(-0.32, -0.3, -0.32, 0.32, 0.3, 0.32, '#E8403A', '#F25A50')
        .add(-0.2, -0.36, -0.2, 0.2, -0.3, 0.2, '#C9302B')
        .add(-0.04, 0.3, -0.04, 0.04, 0.5, 0.04, '#6B4226')
        .add(0.04, 0.38, -0.05, 0.3, 0.46, 0.08, '#4FB54A')
        .add(-0.2, 0.08, 0.32, -0.08, 0.2, 0.34, '#FFB0A8', undefined, undefined, false);       // 반짝
}
function rampGeom() {
    const b = new BoxBuilder();
    for (let i = 0; i < 6; i++) {
        const z0 = 1.6 - i * 0.55, h = 0.18 + i * 0.2;
        b.add(-1.3, 0, z0 - 0.55, 1.3, h, z0, i % 2 ? '#B07A45' : '#C98E55', i % 2 ? '#C48A55' : '#DDA56A');
    }
    b.add(-1.45, 0, -1.7, -1.3, 1.3, 1.6, '#8A5A3B').add(1.3, 0, -1.7, 1.45, 1.3, 1.6, '#8A5A3B');
    return b;
}
function seedGeom() {
    return new BoxBuilder()
        .add(-0.06, 0, -0.06, 0.06, 0.9, 0.06, '#3E9B4F')
        .add(-0.55, 0.9, -0.08, 0.55, 1.9, 0.08, '#FFD23A')
        .add(-0.25, 1.15, -0.1, 0.25, 1.65, 0.1, '#7A4A22');
}
/** 시냇물: 길 폭 전체 물 + 물살 + 양쪽 흙 턱 + 노랑 표지판 */
function creekGeom() {
    const w = HW + 0.3, L = CREEK_LEN / 2;
    const b = new BoxBuilder()
        .add(-w, -0.02, -L, w, 0.04, L, '#3C8FD6', undefined, undefined, false)
        .add(-w, -0.02, L - 0.6, w, 0.05, L - 0.3, '#2A6FB0', undefined, undefined, false);
    for (let i = 0; i < 7; i++) {   // 물살
        const x = -w + 0.6 + i * (2 * w - 1.2) / 6, z = ((i * 37) % 5) / 5 * (2 * L - 1.2) - L + 0.6;
        b.add(x - 0.5, 0.04, z - 0.06, x + 0.5, 0.06, z + 0.06, '#BFE6FF', undefined, undefined, false);
    }
    b.add(-w, 0, L, w, 0.2, L + 0.4, '#A98450', '#B8935D')                                      // 이쪽 흙 턱
        .add(-w, 0, -L - 0.5, w, 0.5, -L, '#9A7748', '#7DC657');                                 // 건너편 둑
    for (const sx of [-1, 1]) {
        const x = sx * (w + 0.1);
        b.add(x - 0.1, 0, L + 0.7, x + 0.1, 1.6, L + 0.9, '#8A5A3B')
            .add(x - 0.55, 1.1, L + 0.6, x + 0.55, 1.6, L + 0.72, '#FFC83A');
    }
    return b;
}
/** 친구를 가둔 나무 우리 (창살 사이로 친구가 보인다) */
function cageGeom() {
    const b = new BoxBuilder(), x = 1.2, h = 2.5, t = 0.08, c = '#9C6B43';
    b.add(-x - 0.1, 0, -x - 0.1, x + 0.1, 0.18, x + 0.1, '#8A5A3B', '#B88358');                    // 바닥
    b.add(-x - 0.2, h, -x - 0.2, x + 0.2, h + 0.25, x + 0.2, '#8A5A3B', '#B88358');                 // 지붕
    for (let i = 0; i <= 6; i++) {
        const p = -x + (2 * x * i) / 6;
        for (const sz of [-1, 1]) b.add(p - t, 0.18, sz * x - t, p + t, h, sz * x + t, c);         // 앞뒤 창살
        if (i > 0 && i < 6) for (const sx of [-1, 1]) b.add(sx * x - t, 0.18, p - t, sx * x + t, h, p + t, c);   // 옆 창살
    }
    b.add(0.5, 1.0, x + 0.05, 0.9, 1.4, x + 0.2, '#C9C9C9', '#E0E0E0');                            // 자물쇠
    return b;
}

export interface Obj { kind: ObjKind; s: number; u: number; mesh: THREE.Object3D; done: boolean }

export class World {
    scene = new THREE.Scene();
    camera: THREE.PerspectiveCamera;
    private chunkMat = voxelMaterial();
    private lineMat = outlineMaterial();
    private chunks = new Map<number, THREE.Mesh>();
    private far = new THREE.Group();     // 하늘·산 (카메라를 따라간다)
    private leaves: THREE.Points;
    private leafPos: Float32Array;
    private pools = new Map<ObjKind, THREE.Object3D[]>();
    private disposables: { dispose: () => void }[] = [];
    shadow: THREE.Mesh;

    constructor(aspect: number) {
        const scene = this.scene;
        scene.background = new THREE.Color(SKY);
        scene.fog = new THREE.Fog(SKY, 60, 185);
        this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 900);

        scene.add(new THREE.HemisphereLight('#F4FBFF', '#6C8A4E', 1.9));
        const sun = new THREE.DirectionalLight('#FFF4DE', 1.8);
        sun.position.set(-0.6, 1, 0.35);
        scene.add(sun);
        scene.add(sun.target);

        // 하늘 (위는 진한 파랑, 지평선은 밝게)
        const sky = new THREE.SphereGeometry(600, 24, 16);
        const sc: number[] = [];
        const top = new THREE.Color('#3E9BEA'), hor = new THREE.Color(SKY);
        const p = sky.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
            const t = Math.max(0, Math.min(1, p.getY(i) / 300));
            const c = hor.clone().lerp(top, Math.pow(t, 0.7));
            sc.push(c.r, c.g, c.b);
        }
        sky.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
        const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
        this.far.add(new THREE.Mesh(sky, skyMat));
        // 해와 뭉게구름
        const sunMesh = new THREE.Mesh(new THREE.CircleGeometry(22, 24), new THREE.MeshBasicMaterial({ color: '#FFF7DA', fog: false }));
        sunMesh.position.set(-170, 230, -420);
        sunMesh.lookAt(0, 0, 0);
        this.far.add(sunMesh);
        const r = rng(99);
        const cloudB = new BoxBuilder();
        for (let i = 0; i < 9; i++) {
            const ang = Math.PI * (0.1 + 0.8 * r()), dist = 330 + r() * 120, cy = 120 + r() * 90;
            const cx = Math.cos(ang) * dist, cz = -Math.sin(ang) * dist, k = 10 + r() * 12;
            cloudB.add(cx - 2.2 * k, cy, cz - k, cx + 2.2 * k, cy + 1.1 * k, cz + k, '#FFFFFF', undefined, undefined, false)
                .add(cx - 1.2 * k, cy + 1.1 * k, cz - 0.8 * k, cx + 1.0 * k, cy + 1.9 * k, cz + 0.8 * k, '#FFFFFF', undefined, undefined, false);
        }
        const cloudG = cloudB.build();
        const cloudM = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 });
        this.far.add(new THREE.Mesh(cloudG, cloudM));
        // 먼 산 (푸른 산 + 앞쪽 초록 언덕)
        const mountMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
        const ring = (n: number, dist: [number, number], h: [number, number], rad: [number, number], low: string, mid: string, high: string, sink: number) => {
            for (let i = 0; i < n; i++) {
                const hh = h[0] + r() * (h[1] - h[0]), rr = rad[0] + r() * (rad[1] - rad[0]);
                const cone = new THREE.ConeGeometry(rr, hh, 6 + Math.floor(r() * 3), 3);
                const cp = cone.getAttribute('position');
                const cc: number[] = [];
                for (let k = 0; k < cp.count; k++) {
                    const t = (cp.getY(k) + hh / 2) / hh;
                    tmpC.set(t > 0.7 ? high : t > 0.35 ? mid : low);
                    cc.push(tmpC.r, tmpC.g, tmpC.b);
                }
                cone.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
                const m = new THREE.Mesh(cone, mountMat);
                const ang = Math.PI * (0.12 + 0.76 * (i / (n - 1))) + (r() - 0.5) * 0.12;
                const d = dist[0] + r() * (dist[1] - dist[0]);
                m.position.set(Math.cos(ang) * d, hh / 2 - sink, -Math.sin(ang) * d);
                m.rotation.y = r() * Math.PI;
                this.far.add(m);
                this.disposables.push(cone);
            }
        };
        ring(14, [420, 520], [90, 170], [70, 120], '#7FA9C4', '#9CC0D6', '#E9F4FA', 70);     // 먼 푸른 산 (꼭대기 눈)
        ring(16, [300, 360], [40, 75], [70, 110], '#4E9A4A', '#62AE55', '#7CC264', 45);      // 초록 언덕
        scene.add(this.far);
        this.disposables.push(sky, skyMat, sunMesh.geometry, sunMesh.material as THREE.Material, cloudG, cloudM, mountMat, this.chunkMat, this.lineMat);

        // 날리는 나뭇잎
        const N = 140;
        this.leafPos = new Float32Array(N * 3);
        const lc = new Float32Array(N * 3);
        const leafColors = ['#F2B33D', '#E8873A', '#8CCB5E', '#F5D34A'];
        for (let i = 0; i < N; i++) {
            this.leafPos[i * 3] = (Math.random() - 0.5) * 50;
            this.leafPos[i * 3 + 1] = Math.random() * 18;
            this.leafPos[i * 3 + 2] = -Math.random() * 60 + 5;
            tmpC.set(leafColors[i % leafColors.length]);
            lc.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(this.leafPos, 3));
        lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
        const lm = new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
        this.leaves = new THREE.Points(lg, lm);
        this.leaves.frustumCulled = false;
        scene.add(this.leaves);
        this.disposables.push(lg, lm);

        // 펫 그림자 (둥근 얼룩)
        const shGeo = new THREE.CircleGeometry(1, 20);
        const shMat = new THREE.MeshBasicMaterial({ color: '#3A2A14', transparent: true, opacity: 0.25, depthWrite: false });
        this.shadow = new THREE.Mesh(shGeo, shMat);
        this.shadow.rotation.x = -Math.PI / 2;
        scene.add(this.shadow);
        this.disposables.push(shGeo, shMat);

        // 장애물 칸 미리 만들기
        const objMat = voxelMaterial();
        const fruitMat = voxelMaterial({ emissive: new THREE.Color('#3A0A00') });
        const puddleMat = new THREE.MeshLambertMaterial({ color: '#6E8FA8' });
        const rimMat = new THREE.MeshLambertMaterial({ color: '#8A6A45' });
        const builders = { rock: rockGeom(), stump: stumpGeom(), fruit: fruitGeom(), ramp: rampGeom(), seed: seedGeom(), creek: creekGeom(), friend: cageGeom() };
        type K = keyof typeof builders;
        const geo = Object.fromEntries(Object.entries(builders).map(([k, b]) => [k, b.build()])) as Record<K, THREE.BufferGeometry>;
        const line = Object.fromEntries(Object.entries(builders).map(([k, b]) => [k, b.buildOutline(k === 'fruit' || k === 'friend' ? 0.03 : OUT)])) as Record<K, THREE.BufferGeometry>;
        const puddleGeo = new THREE.CircleGeometry(1.4, 22), rimGeo = new THREE.RingGeometry(1.4, 1.75, 22);
        this.disposables.push(objMat, fruitMat, puddleMat, rimMat, puddleGeo, rimGeo, ...Object.values(geo), ...Object.values(line));
        const make = (kind: ObjKind): THREE.Object3D => {
            if (kind === 'puddle') {
                const g = new THREE.Group();
                const w = new THREE.Mesh(puddleGeo, puddleMat); w.rotation.x = -Math.PI / 2; w.position.y = 0.03;
                const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.05;
                g.add(w, rim);
                return g;
            }
            const m = new THREE.Mesh(geo[kind], kind === 'fruit' || kind === 'seed' ? fruitMat : objMat);
            m.add(new THREE.Mesh(line[kind], this.lineMat));
            if (kind === 'friend') {
                // 안에 들어갈 친구(펫 그림)는 놓을 때 RunGame 이 'inside' 에 넣는다
                const inside = new THREE.Group(); inside.name = 'inside';
                const g = new THREE.Group();
                g.add(inside, m);
                return g;
            }
            return m;
        };
        const counts: Record<ObjKind, number> = { rock: 12, stump: 8, puddle: 8, fruit: 40, ramp: 4, seed: 2, friend: 2, creek: 3 };
        for (const kind of Object.keys(counts) as ObjKind[]) {
            const list: THREE.Object3D[] = [];
            for (let i = 0; i < counts[kind]; i++) { const o = make(kind); o.visible = false; scene.add(o); list.push(o); }
            this.pools.set(kind, list);
        }
    }

    private makeChunk(i: number) {
        const b = buildChunk(i);
        const m = new THREE.Mesh(b.build(), this.chunkMat);
        m.add(new THREE.Mesh(b.buildOutline(OUT), this.lineMat));   // 나무·울타리 테두리
        return m;
    }
    private freeChunk(m: THREE.Mesh) {
        m.geometry.dispose();
        for (const c of m.children) (c as THREE.Mesh).geometry.dispose();
    }

    /** 펫 자리(s)에 맞춰 길 조각을 붙이고 버린다 */
    update(s: number, cam: THREE.Vector3, dt: number) {
        const from = Math.floor((s - BEHIND) / CHUNK), to = Math.floor((s + AHEAD) / CHUNK);
        for (const [i, m] of this.chunks) if (i < from || i > to) { this.scene.remove(m); this.freeChunk(m); this.chunks.delete(i); }
        for (let i = from; i <= to; i++) {
            if (this.chunks.has(i)) continue;
            const m = this.makeChunk(i);
            this.chunks.set(i, m);
            this.scene.add(m);
            break;   // 한 프레임에 하나씩만 (멈칫하지 않게)
        }
        this.far.position.set(cam.x, cam.y, cam.z);
        // 나뭇잎: 카메라 둘레에서 하늘하늘 떨어진다
        this.leaves.position.set(cam.x, cam.y - 6, cam.z);
        const p = this.leafPos, t = Date.now() / 1000;
        for (let i = 0; i < p.length; i += 3) {
            p[i] += Math.sin(t * 1.7 + i) * dt * 0.8;
            p[i + 1] -= dt * 1.4;
            p[i + 2] += dt * 6;          // 앞으로 달리니 뒤로 흘러간다
            if (p[i + 1] < 0 || p[i + 2] > 6) { p[i] = (Math.random() - 0.5) * 50; p[i + 1] = 8 + Math.random() * 12; p[i + 2] = -55 + Math.random() * 10; }
        }
        (this.leaves.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    /** 처음에 보이는 조각을 한 번에 다 만든다 */
    prepare(s: number) {
        for (let i = Math.floor((s - BEHIND) / CHUNK); i <= Math.floor((s + AHEAD) / CHUNK); i++) {
            if (this.chunks.has(i)) continue;
            const m = this.makeChunk(i);
            this.chunks.set(i, m);
            this.scene.add(m);
        }
    }

    take(kind: ObjKind): THREE.Object3D | null {
        const o = this.pools.get(kind)!.find(x => !x.visible);
        if (!o) return null;
        o.visible = true;
        return o;
    }
    give(o: THREE.Object3D) { o.visible = false; }

    dispose() {
        for (const m of this.chunks.values()) this.freeChunk(m);
        this.disposables.forEach(d => d.dispose());
    }
}
