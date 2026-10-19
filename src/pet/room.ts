// 펫이 사는 방 — 미니룸과 같은 카메라. 바닥은 ROOM x ROOM 칸(복셀 단위).
// x = 0 쪽이 왼쪽 벽, z = 0 쪽이 오른쪽 벽. 화면 아래쪽(x, z 가 큰 쪽)이 카메라에 가깝다.
import { C, type Part, type Box } from './voxel';

export const ROOM = 30;
export const WALL_H = 13;
/** 펫이 돌아다닐 수 있는 범위 (벽에서 조금 떨어져서) */
export const WALK_MIN = 6;
export const WALK_MAX = ROOM - 5;

export interface SceneLayout {
    kv: number;      // 복셀 한 칸 = kv 픽셀
    width: number;
    height: number;
    ox: number;      // 방 안쪽 구석 (x = z = 0, 바닥) 의 화면 위치
    oy: number;
}

export function makeSceneLayout(width: number): SceneLayout {
    const pad = 8;
    const kv = (width - pad * 2) / (2 * ROOM * C);
    const oy = WALL_H * C * kv + pad;
    return { kv, width, ox: width / 2, oy, height: oy + ROOM * kv + kv * 1.2 + pad };
}

/** 바닥 위 (x, z) 의 화면 위치 */
export const floorPoint = (l: SceneLayout, x: number, z: number, y = 0): [number, number] =>
    [l.ox + (x - z) * C * l.kv, l.oy + ((x + z) * 0.5 - y * C) * l.kv];

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string): Box =>
    ({ b: [x0, y0, z0, x1, y1, z1], c });

export interface Prop { key: 'cushion' | 'bowl' | 'ball'; part: Part; x: number; z: number; r: number }

export const CUSHION: Prop = {
    key: 'cushion', x: 9, z: 21, r: 5,
    part: {
        boxes: [
            box(-4.5, 0, -4.5, 4.5, 0.8, 4.5, '#E58FA6'),
            box(-3.8, 0.8, -3.8, 3.8, 1.2, 3.8, '#F5B8C8'),
        ],
        pivot: [0, 0, 0],
    },
};

export const BOWL: Prop = {
    key: 'bowl', x: 22, z: 8, r: 3.5,
    part: {
        boxes: [
            box(-2.6, 0, -2.6, 2.6, 0.4, 2.6, '#4A7CC9'),
            box(-2.6, 0.4, -2.6, 2.6, 1.6, -1.8, '#5B8EDB'),
            box(-2.6, 0.4, 1.8, 2.6, 1.6, 2.6, '#5B8EDB'),
            box(-2.6, 0.4, -1.8, -1.8, 1.6, 1.8, '#5B8EDB'),
            box(1.8, 0.4, -1.8, 2.6, 1.6, 1.8, '#5B8EDB'),
            box(-1.8, 0.4, -1.8, 1.8, 0.6, 1.8, '#3F6AAE'),   // 빈 그릇 바닥
        ],
        pivot: [0, 0, 0],
    },
};

/** 밥이 소복이 담긴 그릇 */
export const BOWL_FULL_PART: Part = {
    boxes: [
        ...BOWL.part.boxes.slice(0, 5),
        box(-1.8, 0.4, -1.8, 1.8, 1.5, 1.8, '#E9E1CF'),    // 흰 쌀밥 (똥과 헷갈리지 않게 하얗게)
        box(-1.3, 1.5, -1.3, 1.3, 2.1, 1.3, '#F6F1E6'),    // 위로 봉긋
        box(-0.7, 2.1, -0.9, 0.5, 2.4, 0.4, '#FFFFFF'),
        box(-1.6, 1.5, 0.6, -1.2, 1.7, 1.0, '#FFFFFF'),    // 밥알 몇 개
        box(1.3, 1.5, -1.0, 1.6, 1.7, -0.7, '#FFFFFF'),
        box(0.5, 2.1, 0.5, 1.0, 2.5, 1.0, '#F08A3C'),      // 당근
        box(-1.0, 2.1, 0.6, -0.5, 2.45, 1.1, '#6CC24A'),   // 완두콩
    ],
    pivot: [0, 0, 0],
};

// 공 — 가운데 상자에 여섯 면마다 얇은 덮개를 붙여 둥글게 (상자끼리 겹치지 않게)
const RED = '#FF6B6B', YEL = '#FFD45A';
export const BALL_PART: Part = {
    boxes: [
        box(-1.1, 0.4, -1.1, 1.1, 2.6, 1.1, RED),
        box(1.1, 0.7, -0.8, 1.5, 2.3, 0.8, YEL), box(-1.5, 0.7, -0.8, -1.1, 2.3, 0.8, YEL),
        box(-0.8, 0.7, 1.1, 0.8, 2.3, 1.5, RED), box(-0.8, 0.7, -1.5, 0.8, 2.3, -1.1, RED),
        box(-0.8, 2.6, -0.8, 0.8, 3, 0.8, YEL), box(-0.8, 0, -0.8, 0.8, 0.4, 0.8, RED),
    ],
    pivot: [0, 1.5, 0],
};
export const BALL_START = { x: 17, z: 18, r: 2.5 };

// 똥 — 세 층으로 쌓은 소용돌이
export const POOP_PART: Part = {
    boxes: [
        box(-1.6, 0, -1.6, 1.6, 0.9, 1.6, '#7A5230'),
        box(-1.1, 0.9, -1.1, 1.1, 1.7, 1.1, '#8A5D38'),
        box(-0.6, 1.7, -0.6, 0.6, 2.4, 0.6, '#7A5230'),
        box(-0.25, 2.4, -0.25, 0.25, 2.8, 0.25, '#8A5D38'),
    ],
    pivot: [0, 1, 0],
};

// 떠나며 남긴 편지 (바닥에 놓인 봉투)
export const LETTER_PART: Part = {
    boxes: [
        box(-2.8, 0, -2, 2.8, 0.3, 2, '#FFFDF6'),
        box(-0.5, 0.3, -0.5, 0.5, 0.45, 0.5, '#E2574C'),   // 봉인
    ],
    pivot: [0, 0, 0],
};
