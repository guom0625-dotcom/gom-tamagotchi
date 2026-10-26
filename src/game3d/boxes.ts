// 상자 여러 개를 한 덩어리(BufferGeometry)로 묶는다. 색은 꼭짓점 색으로 넣어서 재질 하나로 그린다.
// 펫 그림(복셀 상자)·나무·얼음 덩어리 모두 이걸로 만든다 — 그리기 호출이 적어 폰에서도 가볍다.
import * as THREE from 'three';

// 면: 바깥 방향, 네 꼭짓점 (x0..x1 → 0/1)
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const tmpC = new THREE.Color();
const v = new THREE.Vector3();
const nm = new THREE.Matrix3();

export class BoxBuilder {
    private pos: number[] = [];
    private nor: number[] = [];
    private col: number[] = [];
    private idx: number[] = [];
    /** 테두리용으로 상자들을 기억해 둔다 (조금 크게 다시 만든다) */
    private boxes: { lo: number[]; hi: number[]; m?: THREE.Matrix4 }[] = [];

    /** 상자 하나. top 을 주면 윗면만 그 색 (눈 덮인 나무). m 이 있으면 그 변환을 건다 */
    add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, top?: string, m?: THREE.Matrix4, outline = true) {
        if (m) nm.getNormalMatrix(m);
        const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
        const hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
        if (outline) this.boxes.push({ lo, hi, m: m?.clone() });
        for (const f of FACES) {
            const base = this.pos.length / 3;
            tmpC.setStyle(top && f.n[1] === 1 ? top : color);
            const n = new THREE.Vector3(...f.n);
            if (m) n.applyMatrix3(nm).normalize();
            for (const c of f.c) {
                v.set(c[0] ? hi[0] : lo[0], c[1] ? hi[1] : lo[1], c[2] ? hi[2] : lo[2]);
                if (m) v.applyMatrix4(m);
                this.pos.push(v.x, v.y, v.z);
                this.nor.push(n.x, n.y, n.z);
                this.col.push(tmpC.r, tmpC.g, tmpC.b);
            }
            this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        return this;
    }

    /** 이미 만든 삼각형 묶음 (길·눈밭처럼 상자가 아닌 것) */
    addRaw(pos: number[], nor: number[], col: number[], idx: number[]) {
        const base = this.pos.length / 3;
        this.pos.push(...pos); this.nor.push(...nor); this.col.push(...col);
        for (const i of idx) this.idx.push(base + i);
        return this;
    }

    get empty() { return this.idx.length === 0; }

    /** 검정 테두리: 상자마다 e 만큼 큰 상자. 뒷면만 그리면(BackSide) 바깥 둘레만 선처럼 보인다 */
    buildOutline(e: number): THREE.BufferGeometry {
        const o = new BoxBuilder();
        for (const { lo, hi, m } of this.boxes) o.add(lo[0] - e, lo[1] - e, lo[2] - e, hi[0] + e, hi[1] + e, hi[2] + e, '#000000', undefined, m);
        return o.build();
    }

    build(): THREE.BufferGeometry {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        g.setIndex(this.idx);
        g.computeBoundingSphere();
        return g;
    }
}

/** 테두리 재질 (뒷면만, 빛 안 받음) */
export const outlineMaterial = () => new THREE.MeshBasicMaterial({ color: '#1A2433', side: THREE.BackSide });

/** 꼭짓점 색을 쓰는 기본 재질 (빛을 받아 면마다 밝기가 다르다) */
export const voxelMaterial = (opts: THREE.MeshLambertMaterialParameters = {}) =>
    new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
