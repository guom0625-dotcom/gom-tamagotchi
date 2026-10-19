// 복셀(상자) 그리기 — 숙제앱 미니미(homework/app/src/lib/avatar.ts)와 같은 아이소메트릭 카메라.
// 미니미는 90° 단위로만 돌지만, 펫은 아무 각도(yaw)로나 돌려 그릴 수 있다 (정면 보기, 부드럽게 돌아서기).
//
// 좌표 단위는 복셀 한 칸. y 는 위, 펫의 얼굴은 -z 쪽. 카메라는 (+x, +y, +z) 쪽에서 45° 내려다본다.
// 화면: sx = (x - z)·C,  sy = (x + z)/2 - y·C   (C = 1/√2), 여기에 kv(복셀 한 칸의 픽셀)를 곱한다.

export const C = Math.SQRT1_2;

export type Vec3 = [number, number, number];

/** 상자 [x0, y0, z0, x1, y1, z1]. decal 이면 얇은 무늬(눈·코·배)라 앞(-z)면만, 보일 때만 그린다 */
export interface Box {
    b: [number, number, number, number, number, number];
    c: string;
    decal?: boolean;
}

export interface Part {
    boxes: Box[];
    pivot: Vec3;     // 이 부위가 돌거나 늘어날 때의 기준점
}

export interface Poly { points: string; fill: string }

export interface PartRender {
    polys: Poly[];
    depth: number;           // 클수록 카메라에 가깝다 → 나중에 그린다
    pivot: [number, number]; // 화면 위치 (px, 원점 기준)
}

export function shade(hex: string, f: number): string {
    const n = parseInt(hex.slice(1), 16);
    const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))).toString(16).padStart(2, '0');
    return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** y축으로 yaw(라디안) 돌리기. yaw = 0 이면 얼굴이 -z, 얼굴 방향 = (-sin, -cos) */
export function rotY(x: number, z: number, yaw: number): [number, number] {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [x * c + z * s, -x * s + z * c];
}

/** 얼굴이 (dx, dz) 쪽을 보게 하는 yaw */
export const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export const project = (x: number, y: number, z: number, kv: number): [number, number] =>
    [(x - z) * C * kv, ((x + z) * 0.5 - y * C) * kv];

// 카메라 쪽 방향 (1, √2, 1) 으로 잰 깊이
const depthOf = (x: number, y: number, z: number) => x + Math.SQRT2 * y + z;

// 상자의 옆면 4개: [바깥 방향 (nx, nz), 네 꼭짓점을 고르는 함수]
type Corner = (b: Box['b']) => Vec3[];
const SIDES: [number, number, Corner][] = [
    [0, -1, ([x0, y0, z0, x1, y1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]],
    [0, 1, ([x0, y0, , x1, y1, z1]) => [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [-1, 0, ([x0, y0, z0, , y1, z1]) => [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [1, 0, ([, y0, z0, x1, y1, z1]) => [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]],
];

/** 부위 하나를 yaw 로 돌려 그린 다각형 목록 */
export function renderPart(part: Part, yaw: number, kv: number): PartRender {
    const pt = ([x, y, z]: Vec3) => {
        const [rx, rz] = rotY(x, z, yaw);
        return project(rx, y, rz, kv);
    };
    const pts = (list: Vec3[]) => list.map(p => pt(p).map(v => v.toFixed(1)).join(',')).join(' ');

    // 보통 상자는 깊이 순, 무늬는 정의한 순서대로 맨 나중에
    const solid = part.boxes.filter(bx => !bx.decal).map(bx => {
        const [x0, y0, z0, x1, y1, z1] = bx.b;
        const [cx, cz] = rotY((x0 + x1) / 2, (z0 + z1) / 2, yaw);
        return { bx, d: depthOf(cx, (y0 + y1) / 2, cz) };
    }).sort((a, b) => a.d - b.d);

    const polys: Poly[] = [];
    for (const { bx } of solid) {
        const [x0, , z0, x1, y1, z1] = bx.b;
        polys.push({ points: pts([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]), fill: bx.c });
        for (const [nx, nz, corners] of SIDES) {
            const [rx, rz] = rotY(nx, nz, yaw);
            if (rx + rz <= 0.001) continue;   // 카메라 반대쪽 면
            // 미니미와 같은 음영: +z 면 0.86, +x 면 0.72, 그 사이는 고르게
            polys.push({ points: pts(corners(bx.b)), fill: shade(bx.c, 0.79 + 0.07 * (rz - rx)) });
        }
    }
    const [fx, fz] = rotY(0, -1, yaw);
    if (fx + fz > 0.001) {
        const f = 0.79 + 0.07 * (fz - fx);
        for (const bx of part.boxes) {
            if (bx.decal) polys.push({ points: pts(SIDES[0][2](bx.b)), fill: shade(bx.c, f) });
        }
    }

    // 부위 전체의 깊이: 보통 상자의 부피 가중 중심
    let vol = 0, sx = 0, sy = 0, sz = 0;
    for (const bx of part.boxes) {
        if (bx.decal) continue;
        const [x0, y0, z0, x1, y1, z1] = bx.b;
        const v = (x1 - x0) * (y1 - y0) * (z1 - z0);
        vol += v; sx += v * (x0 + x1) / 2; sy += v * (y0 + y1) / 2; sz += v * (z0 + z1) / 2;
    }
    const [px, py, pz] = vol ? [sx / vol, sy / vol, sz / vol] : part.pivot;
    const [rcx, rcz] = rotY(px, pz, yaw);

    return { polys, depth: depthOf(rcx, py, rcz), pivot: pt(part.pivot) };
}
