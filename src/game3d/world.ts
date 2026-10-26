// 얼음길 달리기의 3D 세상 — 하늘·먼 산·눈밭·길·나무·장애물. 길은 30m 조각(chunk)으로 만들어
// 펫이 지나가면 뒤 조각을 버리고 앞에 새로 붙인다. 장애물은 미리 만든 것을 돌려쓴다.
import * as THREE from 'three';
import { BoxBuilder, outlineMaterial, voxelMaterial } from './boxes';
import { BANK, BANK_H, HW, cxAt, headingAt, yAt } from './track';

export const CHUNK = 30;
const STEP = 2;                 // 길 그물의 앞뒤 간격 (m)
const AHEAD = 190;              // 앞으로 만들어 둘 거리
const BEHIND = 40;              // 시작할 때 카메라가 앞에서 펫을 보므로 뒤쪽 길도 보인다
export const SKY = '#CDEBFF';

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
const ICE = '#9ED8F5', ICE2 = '#8ACDEF', SNOW = '#F7FBFF', SNOW2 = '#E4F0F8';
function profile(): [number, number, string][] {
    const half: [number, number, string][] = [
        [0, 0, ICE], [HW * 0.5, 0, ICE], [HW, 0, ICE2],
        [HW + 0.5, 0.55, SNOW], [HW + BANK, BANK_H, SNOW], [HW + BANK + 4, BANK_H + 0.5, SNOW2],
        [HW + BANK + 18, BANK_H + 2.5, SNOW], [HW + BANK + 60, BANK_H + 9, SNOW2],
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

const tmpC = new THREE.Color();
/** 길 한 조각: 얼음길 + 눈 둑 + 눈밭 + 나무·깃대 */
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
        const band = Math.floor(s / 8) % 2 === 0;
        for (let j = 0; j < cols; j++) {
            const [off, h, c] = PROFILE[j];
            const outer = Math.abs(off) > HW + BANK;
            // 눈밭은 살짝 울퉁불퉁
            const bump = outer ? (Math.sin(s * 0.21 + off * 0.37) + Math.sin(s * 0.07 - off * 0.11)) * 0.35 : 0;
            pos.push(cx + off, y + h + bump, -s);
            tmpC.setStyle(c === ICE && band ? ICE2 : c);
            if (outer) tmpC.offsetHSL(0, 0, (r() - 0.5) * 0.03);
            col.push(tmpC.r, tmpC.g, tmpC.b);
        }
    }
    const idx: number[] = [];
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, c = a + cols;
        // 앞이 -z 라서 이 순서가 위를 본다
        idx.push(a, a + 1, c + 1, a, c + 1, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.addRaw(pos, Array.from(g.getAttribute('normal').array as Float32Array), col, idx);
    g.dispose();

    // 둑 위 깃대 (빨강·흰색 줄무늬), 10m 마다
    for (let s = s0 + (10 - (s0 % 10)) % 10; s < s0 + CHUNK; s += 10) {
        for (const side of [-1, 1]) {
            const x = cxAt(s) + side * (HW + 0.9), y = yAt(s) + groundOff(HW + 0.9), z = -s;
            for (let k = 0; k < 4; k++) b.add(x - 0.12, y + k * 0.45, z - 0.12, x + 0.12, y + (k + 1) * 0.45, z + 0.12, k % 2 ? '#FFFFFF' : '#FF5A5A');
            b.add(x - 0.18, y + 1.8, z - 0.18, x + 0.18, y + 2.0, z + 0.18, '#FFD84A');
        }
    }

    // 나무 (눈 덮인 소나무)
    const trees = 7 + Math.floor(r() * 5);
    for (let n = 0; n < trees; n++) {
        const s = s0 + r() * CHUNK;
        const side = r() < 0.5 ? -1 : 1;
        const off = HW + BANK + 2 + Math.pow(r(), 1.6) * 34;
        const x = cxAt(s) + side * off, y = yAt(s) + groundOff(off) - 0.2, z = -s;
        const k = 0.9 + r() * 1.1;
        b.add(x - 0.3 * k, y, z - 0.3 * k, x + 0.3 * k, y + 1.1 * k, z + 0.3 * k, '#8A5A3B');
        const layers: [number, number][] = [[1.9, 1.0], [1.45, 2.0], [1.0, 3.0], [0.55, 4.0]];
        for (const [w, h0] of layers) {
            b.add(x - w * k, y + h0 * k, z - w * k, x + w * k, y + (h0 + 1.05) * k, z + w * k, r() < 0.5 ? '#2F8F5B' : '#2A7F52', '#F5FBFF');
        }
    }
    // 얼음 결정·바위
    const rocks = Math.floor(r() * 4);
    for (let n = 0; n < rocks; n++) {
        const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1, off = HW + BANK + 1.5 + r() * 20;
        const x = cxAt(s) + side * off, y = yAt(s) + groundOff(off) - 0.2, z = -s;
        if (r() < 0.5) {
            const h = 1.5 + r() * 2.5;
            b.add(x - 0.4, y, z - 0.4, x + 0.4, y + h, z + 0.4, '#8FD3F5', '#DFF5FF');
            b.add(x + 0.3, y, z - 0.25, x + 0.8, y + h * 0.6, z + 0.25, '#A8DEF7', '#E8F8FF');
        } else {
            b.add(x - 1, y, z - 0.8, x + 1, y + 0.9, z + 0.8, '#8C97A3', '#F2F7FB');
            b.add(x - 0.5, y + 0.9, z - 0.4, x + 0.6, y + 1.4, z + 0.5, '#9AA5B0', '#F7FBFF');
        }
    }
    // 이글루 가끔
    if (r() < 0.3) {
        const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1, off = HW + BANK + 6 + r() * 10;
        const x = cxAt(s) + side * off, y = yAt(s) + groundOff(off) - 0.2, z = -s;
        const m = new THREE.Matrix4().makeRotationY(headingAt(s) + (side < 0 ? Math.PI / 2 : -Math.PI / 2)).setPosition(x, y, z);
        b.add(-2.2, 0, -2.2, 2.2, 1.4, 2.2, '#F4FAFF', '#FFFFFF', m);
        b.add(-1.6, 1.4, -1.6, 1.6, 2.4, 1.6, '#EEF6FC', '#FFFFFF', m);
        b.add(-0.9, 2.4, -0.9, 0.9, 2.9, 0.9, '#F4FAFF', '#FFFFFF', m);
        b.add(-0.6, 0, 2.0, 0.6, 1.2, 3.0, '#E6F1F9', '#FFFFFF', m);
        b.add(-0.4, 0, 2.95, 0.4, 0.9, 3.05, '#4A6A88', undefined, m);
    }
    return b;
}
const OUT = 0.05;   // 테두리 두께 (m)

// ── 장애물·물고기 ────────────────────────────────
export type ObjKind = 'ice' | 'snowman' | 'hole' | 'fish' | 'ramp' | 'seed';
/** 부딪힘 반폭 (m) */
export const OBJ_HALF: Record<ObjKind, number> = { ice: 1.15, snowman: 0.85, hole: 1.4, fish: 0.6, ramp: 1.3, seed: 0.8 };

function iceGeom() {
    return new BoxBuilder()
        .add(-1.15, 0, -0.75, 1.15, 1.5, 0.75, '#3FA6E0', '#D6F1FF')
        .add(-0.8, 1.5, -0.55, 0.7, 2.2, 0.5, '#7CC8F0', '#EAF8FF')
        .add(-0.95, 0.3, 0.75, -0.55, 1.1, 0.8, '#D9F3FF')   // 반짝
        ;
}
function snowmanGeom() {
    return new BoxBuilder()
        .add(-0.85, 0, -0.85, 0.85, 1.5, 0.85, '#FFFFFF')
        .add(-0.62, 1.5, -0.62, 0.62, 2.55, 0.62, '#FAFDFF')
        .add(-0.66, 2.35, -0.66, 0.66, 2.6, 0.66, '#E8483F')          // 목도리
        .add(0.3, 1.6, 0.6, 0.62, 2.4, 0.75, '#E8483F')
        .add(-0.45, 2.6, -0.45, 0.45, 3.35, 0.45, '#FFFFFF')
        .add(-0.25, 2.95, 0.45, -0.1, 3.1, 0.5, '#222222')             // 눈 (+z 가 카메라 쪽)
        .add(0.1, 2.95, 0.45, 0.25, 3.1, 0.5, '#222222')
        .add(-0.08, 2.75, 0.45, 0.08, 2.88, 0.95, '#FF8A1E')           // 당근 코
        .add(-0.5, 3.35, -0.5, 0.5, 3.45, 0.5, '#2B2B33')              // 모자
        .add(-0.32, 3.45, -0.32, 0.32, 3.95, 0.32, '#2B2B33')
        .add(-0.07, 1.0, 0.85, 0.07, 1.14, 0.9, '#222222')             // 단추
        .add(-0.07, 0.6, 0.85, 0.07, 0.74, 0.9, '#222222')
        ;
}
function fishGeom() {
    return new BoxBuilder()
        .add(-0.45, -0.22, -0.1, 0.35, 0.22, 0.1, '#FFB21F')
        .add(-0.3, -0.15, -0.12, 0.15, 0.15, 0.12, '#FFD15A')
        .add(0.35, -0.3, -0.06, 0.62, 0.3, 0.06, '#FF8F1F')            // 꼬리
        .add(-0.35, 0.03, -0.13, -0.22, 0.13, 0.13, '#222222')         // 눈
        ;
}
function rampGeom() {
    const b = new BoxBuilder();
    const n = 6;
    for (let i = 0; i < n; i++) {
        const z0 = 1.6 - i * 0.55, h = 0.18 + i * 0.2;
        b.add(-1.3, 0, z0 - 0.55, 1.3, h, z0, i % 2 ? '#FF5A5A' : '#FFC83A', i % 2 ? '#FF7A7A' : '#FFE070');
    }
    return b;
}
function seedGeom() {
    return new BoxBuilder()
        .add(-0.06, 0, -0.06, 0.06, 0.9, 0.06, '#3E9B4F')
        .add(-0.55, 0.9, -0.08, 0.55, 1.9, 0.08, '#FFD23A')
        .add(-0.25, 1.15, -0.1, 0.25, 1.65, 0.1, '#7A4A22')
        ;
}

export interface Obj { kind: ObjKind; s: number; u: number; mesh: THREE.Object3D; done: boolean }

export class World {
    scene = new THREE.Scene();
    camera: THREE.PerspectiveCamera;
    private chunkMat = voxelMaterial();
    private lineMat = outlineMaterial();
    private chunks = new Map<number, THREE.Mesh>();
    private far = new THREE.Group();     // 하늘·산 (카메라를 따라간다)
    private snow: THREE.Points;
    private snowPos: Float32Array;
    private pools = new Map<ObjKind, THREE.Object3D[]>();
    private disposables: { dispose: () => void }[] = [];
    shadow: THREE.Mesh;

    constructor(aspect: number) {
        const scene = this.scene;
        scene.background = new THREE.Color(SKY);
        scene.fog = new THREE.Fog(SKY, 60, 185);
        this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 900);

        scene.add(new THREE.HemisphereLight('#F2FAFF', '#7FA3BD', 1.8));
        const sun = new THREE.DirectionalLight('#FFF8EC', 1.7);
        sun.position.set(-0.6, 1, 0.35);
        scene.add(sun);
        scene.add(sun.target);

        // 하늘 (위는 진한 파랑, 지평선은 밝게)
        const sky = new THREE.SphereGeometry(600, 24, 16);
        const sc: number[] = [];
        const top = new THREE.Color('#4DA8EE'), hor = new THREE.Color(SKY);
        const p = sky.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
            const t = Math.max(0, Math.min(1, p.getY(i) / 300));
            const c = hor.clone().lerp(top, Math.pow(t, 0.7));
            sc.push(c.r, c.g, c.b);
        }
        sky.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
        const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
        this.far.add(new THREE.Mesh(sky, skyMat));
        // 해
        const sunMesh = new THREE.Mesh(new THREE.CircleGeometry(22, 24), new THREE.MeshBasicMaterial({ color: '#FFF7DA', fog: false }));
        sunMesh.position.set(-170, 230, -420);
        sunMesh.lookAt(0, 0, 0);
        this.far.add(sunMesh);
        // 먼 설산 (둥글게 둘러싼다)
        const r = rng(99);
        const mountMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
        for (let i = 0; i < 16; i++) {
            const h = 70 + r() * 110, rad = 60 + r() * 70;
            const cone = new THREE.ConeGeometry(rad, h, 5 + Math.floor(r() * 3), 3);
            const cp = cone.getAttribute('position');
            const cc: number[] = [];
            for (let k = 0; k < cp.count; k++) {
                const t = (cp.getY(k) + h / 2) / h;
                tmpC.set(t > 0.55 ? '#FFFFFF' : t > 0.3 ? '#D5E6F3' : '#A9C3D8');
                cc.push(tmpC.r, tmpC.g, tmpC.b);
            }
            cone.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
            const m = new THREE.Mesh(cone, mountMat);
            const ang = Math.PI * (0.15 + 0.7 * (i / 15)) + (r() - 0.5) * 0.15;   // 앞쪽 반원
            const dist = 380 + r() * 120;
            m.position.set(Math.cos(ang) * dist, h / 2 - 60, -Math.sin(ang) * dist);
            m.rotation.y = r() * Math.PI;
            this.far.add(m);
            this.disposables.push(cone);
        }
        scene.add(this.far);
        this.disposables.push(sky, skyMat, sunMesh.geometry, sunMesh.material as THREE.Material, mountMat, this.chunkMat, this.lineMat);

        // 날리는 눈
        const N = 260;
        this.snowPos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            this.snowPos[i * 3] = (Math.random() - 0.5) * 50;
            this.snowPos[i * 3 + 1] = Math.random() * 22;
            this.snowPos[i * 3 + 2] = -Math.random() * 60 + 5;
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
        const sm = new THREE.PointsMaterial({ color: '#FFFFFF', size: 0.22, transparent: true, opacity: 0.9, depthWrite: false });
        this.snow = new THREE.Points(sg, sm);
        this.snow.frustumCulled = false;
        scene.add(this.snow);
        this.disposables.push(sg, sm);

        // 펫 그림자 (둥근 얼룩)
        const shGeo = new THREE.CircleGeometry(1, 20);
        const shMat = new THREE.MeshBasicMaterial({ color: '#1B3A55', transparent: true, opacity: 0.22, depthWrite: false });
        this.shadow = new THREE.Mesh(shGeo, shMat);
        this.shadow.rotation.x = -Math.PI / 2;
        scene.add(this.shadow);
        this.disposables.push(shGeo, shMat);

        // 장애물 칸 미리 만들기
        const objMat = voxelMaterial();
        const fishMat = voxelMaterial({ emissive: new THREE.Color('#5A3A00') });
        const holeMat = new THREE.MeshLambertMaterial({ color: '#1F5E9C' });
        const rimMat = new THREE.MeshLambertMaterial({ color: '#F2FAFF' });
        const builders = { ice: iceGeom(), snowman: snowmanGeom(), fish: fishGeom(), ramp: rampGeom(), seed: seedGeom() };
        type K = keyof typeof builders;
        const geo = Object.fromEntries(Object.entries(builders).map(([k, b]) => [k, b.build()])) as Record<K, THREE.BufferGeometry>;
        const line = Object.fromEntries(Object.entries(builders).map(([k, b]) => [k, b.buildOutline(k === 'fish' ? 0.035 : OUT)])) as Record<K, THREE.BufferGeometry>;
        const holeGeo = new THREE.CircleGeometry(1.4, 22), rimGeo = new THREE.RingGeometry(1.4, 1.75, 22);
        this.disposables.push(objMat, fishMat, holeMat, rimMat, holeGeo, rimGeo, ...Object.values(geo), ...Object.values(line));
        const make = (kind: ObjKind): THREE.Object3D => {
            if (kind === 'hole') {
                const g = new THREE.Group();
                const w = new THREE.Mesh(holeGeo, holeMat); w.rotation.x = -Math.PI / 2; w.position.y = 0.03;
                const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.05;
                g.add(w, rim);
                return g;
            }
            const m = new THREE.Mesh(geo[kind], kind === 'fish' || kind === 'seed' ? fishMat : objMat);
            m.add(new THREE.Mesh(line[kind], this.lineMat));
            return m;
        };
        const counts: Record<ObjKind, number> = { ice: 12, snowman: 8, hole: 8, fish: 30, ramp: 4, seed: 2 };
        for (const kind of Object.keys(counts) as ObjKind[]) {
            const list: THREE.Object3D[] = [];
            for (let i = 0; i < counts[kind]; i++) { const o = make(kind); o.visible = false; scene.add(o); list.push(o); }
            this.pools.set(kind, list);
        }
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
        // 눈: 카메라 둘레에서 천천히 떨어진다
        this.snow.position.set(cam.x, cam.y - 6, cam.z);
        const p = this.snowPos;
        for (let i = 0; i < p.length; i += 3) {
            p[i + 1] -= dt * 2.2;
            p[i + 2] += dt * 6;          // 앞으로 달리니 뒤로 흘러간다
            if (p[i + 1] < 0 || p[i + 2] > 6) { p[i] = (Math.random() - 0.5) * 50; p[i + 1] = 8 + Math.random() * 14; p[i + 2] = -55 + Math.random() * 10; }
        }
        (this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
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

    private makeChunk(i: number) {
        const b = buildChunk(i);
        const m = new THREE.Mesh(b.build(), this.chunkMat);
        m.add(new THREE.Mesh(b.buildOutline(OUT), this.lineMat));   // 나무·깃대 테두리
        return m;
    }
    private freeChunk(m: THREE.Mesh) {
        m.geometry.dispose();
        for (const c of m.children) (c as THREE.Mesh).geometry.dispose();
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
