// 펫 복셀 모델(PetModel, 방에서 쓰는 그 그림)을 three.js 3D 덩어리로 옮긴다.
// 부위마다 Group 을 기준점(pivot)에 두고, 달리기·점프·넘어지기를 부위 회전으로 움직인다.
import * as THREE from 'three';
import type { PartId, PetModel } from '../pet/model';
import { BoxBuilder, outlineMaterial, voxelMaterial } from './boxes';

export interface PetRig {
    root: THREE.Group;        // 월드에 놓는 자리 (방향 포함)
    body: THREE.Group;        // 들썩임·점프 자세
    parts: Record<PartId, THREE.Group>;
    head: THREE.Group;
    hipY: number;
    scale: number;
    dispose: () => void;
}

const HEAD_PARTS: PartId[] = ['eyeL', 'eyeR', 'earL', 'earR'];
const OUTLINE = 0.035;   // 테두리 두께 (m)

/** height = 펫 키를 이 높이(m)로 맞춘다 (단계와 상관없이 비슷하게) */
export function buildPet(model: PetModel, height: number): PetRig {
    const mat = voxelMaterial();
    const line = outlineMaterial();
    const geoms: THREE.BufferGeometry[] = [];
    const scale = height / model.height;
    const root = new THREE.Group();
    const scaled = new THREE.Group();
    scaled.scale.setScalar(scale);
    root.add(scaled);
    const body = new THREE.Group();
    scaled.add(body);

    const pivotOf = (id: PartId): [number, number, number] => {
        const p = model.parts[id].pivot;
        // 다리는 엉덩이에서 앞뒤로 흔든다 (그림에서는 위아래로만 움직였다)
        if (id === 'legL' || id === 'legR') return [p[0], model.hipY, p[2]];
        return [p[0], p[1], p[2]];
    };
    const mesh = (id: PartId, origin: [number, number, number]) => {
        const b = new BoxBuilder();
        for (const bx of model.parts[id].boxes) {
            let [x0, y0, z0, x1, y1, z1] = bx.b;
            // 앞면 무늬(눈·코·배)는 두께가 없으니 앞(-z)으로 아주 얇게 내민다
            if (bx.decal) { const z = Math.min(z0, z1); z0 = z - 0.06; z1 = z + 0.01; }
            // 얼굴 무늬에는 테두리를 두르지 않는다
            b.add(x0 - origin[0], y0 - origin[1], z0 - origin[2], x1 - origin[0], y1 - origin[1], z1 - origin[2], bx.c, undefined, undefined, !bx.decal);
        }
        const g = b.build(), og = b.buildOutline(OUTLINE / scale);
        geoms.push(g, og);
        const m = new THREE.Mesh(g, mat);
        m.add(new THREE.Mesh(og, line));   // 얇은 검정 테두리 (2026-10-26 사용자 제안)
        return m;
    };

    const parts = {} as Record<PartId, THREE.Group>;
    const headPivot = pivotOf('head');
    const head = new THREE.Group();
    head.position.set(...headPivot);
    head.add(mesh('head', headPivot));
    body.add(head);
    parts.head = head;
    for (const id of HEAD_PARTS) {
        const p = pivotOf(id);
        const g = new THREE.Group();
        g.position.set(p[0] - headPivot[0], p[1] - headPivot[1], p[2] - headPivot[2]);
        g.add(mesh(id, p));
        head.add(g);
        parts[id] = g;
    }
    for (const id of ['legL', 'legR', 'body', 'tail', 'armL', 'armR'] as PartId[]) {
        const p = pivotOf(id);
        const g = new THREE.Group();
        g.position.set(...p);
        g.add(mesh(id, p));
        body.add(g);
        parts[id] = g;
    }
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
    return {
        root, body, parts, head, hipY: model.hipY, scale,
        dispose: () => { geoms.forEach(g => g.dispose()); mat.dispose(); line.dispose(); },
    };
}

/** 달리기 자세. phase 는 걸음 주기(라디안), lean 은 좌우 기울기(-1~1), air 는 공중이면 true */
export function poseRun(r: PetRig, phase: number, lean: number, air: boolean) {
    const P = r.parts;
    const swing = air ? 0.5 : Math.sin(phase) * 0.9;
    P.legL.rotation.x = air ? -0.6 : swing;
    P.legR.rotation.x = air ? 0.3 : -swing;
    P.armL.rotation.x = air ? 2.5 : -swing * 0.9;   // + 가 앞으로 (공중에서는 만세)
    P.armR.rotation.x = air ? 2.5 : swing * 0.9;
    P.tail.rotation.y = Math.sin(phase * 2) * 0.35;
    P.earL.rotation.z = air ? 0.4 : Math.sin(phase * 2) * 0.12;
    P.earR.rotation.z = air ? -0.4 : -Math.sin(phase * 2) * 0.12;
    r.body.position.y = air ? 0 : Math.abs(Math.sin(phase)) * 0.5;
    r.body.rotation.x = air ? 0.1 : -0.14;              // 달릴 때 조금 앞으로 숙인다 (- 가 앞)
    r.body.rotation.z = -lean * 0.25;                     // 도는 쪽으로 몸을 기울인다
    r.head.rotation.z = lean * 0.12;
}

/** 서 있기 (3·2·1 동안). t 초 */
export function poseIdle(r: PetRig, t: number) {
    const P = r.parts;
    for (const id of ['legL', 'legR', 'armL', 'armR'] as PartId[]) P[id].rotation.x = 0;
    P.armR.rotation.z = -0.3 - Math.max(0, Math.sin(t * 6)) * 1.2;   // 손 흔들기
    P.tail.rotation.y = Math.sin(t * 8) * 0.4;
    r.body.position.y = Math.sin(t * 4) * 0.15;
    r.body.rotation.set(0, 0, 0);
}

/** 넘어짐: f = 0 → 1 */
export function poseFall(r: PetRig, f: number) {
    r.body.rotation.x = -Math.min(1, f * 1.6) * 1.45;
    r.body.position.y = Math.sin(Math.min(1, f) * Math.PI) * 2;
    r.parts.armL.rotation.x = r.parts.armR.rotation.x = 2.8;
    r.parts.legL.rotation.x = r.parts.legR.rotation.x = 0.4;
}
