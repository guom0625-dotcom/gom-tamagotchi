// 🐍 놀아주기(뱀 게임) 마당: 울타리 친 잔디 칸판 + 둘레의 나무·꽃. 카메라는 고정 (판 전체가 보이게 남쪽 위에서).
import * as THREE from 'three';
import { BoxBuilder, outlineMaterial, voxelMaterial } from './boxes';
import { bush, flower, leafTree, mushroom, pineTree, rng, SKY } from './world';

export const COLS = 11;
export const ROWS = 15;
/** 칸 → 월드 (칸 한 변 = 1m, 판 가운데가 원점, 0행이 먼 쪽) */
export const cellX = (c: number) => c - (COLS - 1) / 2;
export const cellZ = (r: number) => r - (ROWS - 1) / 2;

const OUT = 0.04;
const HX = COLS / 2, HZ = ROWS / 2;   // 판 반 너비·반 깊이

function appleGeom() {
    return new BoxBuilder()
        .add(-0.27, -0.25, -0.27, 0.27, 0.25, 0.27, '#E8403A', '#F25A50')
        .add(-0.17, -0.3, -0.17, 0.17, -0.25, 0.17, '#C9302B')
        .add(-0.035, 0.25, -0.035, 0.035, 0.42, 0.035, '#6B4226')
        .add(0.035, 0.32, -0.04, 0.26, 0.39, 0.07, '#4FB54A')
        .add(-0.17, 0.07, 0.27, -0.07, 0.17, 0.29, '#FFB0A8', undefined, undefined, false);
}

export class Yard {
    scene = new THREE.Scene();
    camera: THREE.PerspectiveCamera;
    apple: THREE.Group;
    private disposables: { dispose: () => void }[] = [];
    private shGeo = new THREE.CircleGeometry(1, 18);
    private shMat = new THREE.MeshBasicMaterial({ color: '#2E4A1C', transparent: true, opacity: 0.22, depthWrite: false });

    constructor(aspect: number) {
        const scene = this.scene;
        scene.background = new THREE.Color(SKY);
        this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 200);
        this.fit(aspect);

        scene.add(new THREE.HemisphereLight('#F4FBFF', '#6C8A4E', 1.9));
        const sun = new THREE.DirectionalLight('#FFF4DE', 1.7);
        sun.position.set(-0.6, 1, 0.45);
        scene.add(sun, sun.target);

        const mat = voxelMaterial(), line = outlineMaterial();
        this.disposables.push(mat, line, this.shGeo, this.shMat);
        const add = (b: BoxBuilder, outline = true) => {
            const g = b.build();
            const m = new THREE.Mesh(g, mat);
            this.disposables.push(g);
            if (outline) { const og = b.buildOutline(OUT); m.add(new THREE.Mesh(og, line)); this.disposables.push(og); }
            scene.add(m);
        };

        // 바깥 풀밭 + 잔디 칸판 (두 가지 초록 바둑판)
        const ground = new BoxBuilder();
        ground.add(-40, -0.4, -40, 40, -0.02, 30, '#6DB84A', undefined, undefined, false);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const x = cellX(c), z = cellZ(r);
            ground.add(x - 0.5, -0.1, z - 0.5, x + 0.5, 0, z + 0.5, (r + c) % 2 ? '#8ACF5E' : '#9AD96C', undefined, undefined, false);
        }
        add(ground, false);

        // 나무 울타리 (판 둘레)
        const fence = new BoxBuilder();
        const post = (x: number, z: number) => fence.add(x - 0.12, -0.05, z - 0.12, x + 0.12, 0.85, z + 0.12, '#A9733F', '#C48A52');
        const E = 0.18;   // 울타리는 판 바로 바깥
        for (let i = 0; i <= COLS; i++) { const x = -HX + i; post(x, -HZ - E); post(x, HZ + E); }
        for (let i = 1; i < ROWS; i++) { const z = -HZ + i; post(-HX - E, z); post(HX + E, z); }
        for (const y of [0.32, 0.62]) {
            fence.add(-HX - E, y, -HZ - E - 0.05, HX + E, y + 0.13, -HZ - E + 0.05, '#C98F55');
            fence.add(-HX - E, y, HZ + E - 0.05, HX + E, y + 0.13, HZ + E + 0.05, '#C98F55');
            fence.add(-HX - E - 0.05, y, -HZ - E, -HX - E + 0.05, y + 0.13, HZ + E, '#C98F55');
            fence.add(HX + E - 0.05, y, -HZ - E, HX + E + 0.05, y + 0.13, HZ + E, '#C98F55');
        }
        add(fence);

        // 둘레의 숲 (늘 같은 모습)
        const r = rng(7);
        const deco = new BoxBuilder(), small = new BoxBuilder();
        const outside = (x: number, z: number) => Math.abs(x) > HX + 1.2 || Math.abs(z) > HZ + 1.2;
        for (let i = 0; i < 70; i++) {
            const x = (r() * 2 - 1) * 16, z = -HZ - 9 + r() * (ROWS + 13);
            if (!outside(x, z) || (Math.abs(x) < HX + 2.5 && z > HZ)) continue;   // 앞쪽(카메라 쪽)은 비워 둔다
            const k = 0.45 + r() * 0.3;
            const t = r();
            if (t < 0.45) leafTree(deco, x, 0, z, k, r);
            else if (t < 0.7) pineTree(deco, x, 0, z, k * 0.9, r);
            else bush(deco, x, 0, z, k);
        }
        for (let i = 0; i < 60; i++) {
            const x = (r() * 2 - 1) * 9, z = -HZ - 3 + r() * (ROWS + 6);
            if (!outside(x, z) || z > HZ + 0.8) continue;   // 카메라 바로 앞은 비운다
            if (r() < 0.85) flower(small, x, 0, z, r); else mushroom(small, x, 0, z);
        }
        add(deco); add(small);

        // 사과 (하나를 옮겨 쓴다)
        this.apple = new THREE.Group();
        const ag = appleGeom();
        const am = new THREE.Mesh(ag.build(), mat);
        const aog = ag.buildOutline(OUT);
        am.add(new THREE.Mesh(aog, line));
        this.disposables.push(am.geometry, aog);
        am.scale.setScalar(1.3);
        am.position.y = 0.5;
        this.apple.add(am, this.makeShadow(0.32));
        scene.add(this.apple);
    }

    /** 판 전체가 화면에 들어오게 카메라를 놓는다 */
    fit(aspect: number) {
        const cam = this.camera;
        cam.aspect = aspect;
        // 남쪽 위에서 비스듬히 (약 62°). 판 너비·깊이 중 빠듯한 쪽에 맞춘다
        const tilt = (62 * Math.PI) / 180;
        const vfov = (cam.fov * Math.PI) / 180;
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
        const needW = (COLS + 1.9) / 2 / Math.tan(hfov / 2);
        const needH = ((ROWS + 1.4) * Math.sin(tilt) + 1.2) / 2 / Math.tan(vfov / 2);
        const d = Math.max(needW, needH) * 1.04;
        cam.position.set(0, Math.sin(tilt) * d, Math.cos(tilt) * d + 0.3);
        cam.lookAt(0, 0, 0.3);
        cam.updateProjectionMatrix();
    }

    /** 둥근 그림자 */
    makeShadow(radius: number) {
        const m = new THREE.Mesh(this.shGeo, this.shMat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.02;
        m.scale.setScalar(radius);
        return m;
    }

    dispose() { this.disposables.forEach(d => d.dispose()); }
}
