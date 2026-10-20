// 펫이 사는 방 — 미니룸과 같은 카메라. 바닥은 ROOM x ROOM 칸(복셀 단위).
// x = 0 쪽이 왼쪽 벽, z = 0 쪽이 오른쪽 벽. 화면 아래쪽(x, z 가 큰 쪽)이 카메라에 가깝다.
import { C, type Part, type Box } from './voxel';

export const WALL_H = 13;
/** 방 크기 단계별 바닥 칸 수 (작은 방 · 중간 방 · 큰 방) */
export const ROOM_SIZES = [30, 34, 38];

export interface Spot { x: number; z: number; r: number }

/** 방 크기에 따라 정해지는 자리들 */
export interface RoomSpec {
    size: number;
    walkMin: number;     // 펫이 돌아다닐 수 있는 범위 (벽에서 조금 떨어져서)
    walkMax: number;
    cushion: Spot;
    bowl: Spot;
    ball: Spot;
    /** 장난감 자리. tunnel 은 z0~z1 로 뻗고, slide 는 z0(사다리) → z1(내려오는 끝) */
    toys: {
        doll: Spot;
        bubbles: Spot;
        tunnel: Spot & { z0: number; z1: number };
        slide: Spot & { z0: number; z1: number };
    };
    rug: Spot;
    plant: Spot;
    /** 능력 물건 자리 */
    gadgets: { robot: Spot; feeder: Spot; firstaid: Spot; bed: Spot };
}

export type GadgetKey = keyof RoomSpec['gadgets'];
export const GADGET_KEYS: GadgetKey[] = ['robot', 'feeder', 'firstaid', 'bed'];

export type ToyKey = keyof RoomSpec['toys'];
export const TOY_KEYS: ToyKey[] = ['doll', 'bubbles', 'tunnel', 'slide'];

export function roomSpec(level: number): RoomSpec {
    const size = ROOM_SIZES[Math.max(0, Math.min(ROOM_SIZES.length - 1, level))];
    return {
        size,
        walkMin: 6,
        walkMax: size - 5,
        cushion: { x: 9, z: size - 9, r: 5 },
        bowl: { x: size - 8, z: 8, r: 3.5 },
        ball: { x: Math.round(size * 0.57), z: Math.round(size * 0.6), r: 2.5 },
        toys: {
            doll: { x: 11.5, z: 7, r: 1.8 },
            bubbles: { x: Math.round(size * 0.55), z: 6.5, r: 2 },
            tunnel: { x: 7.5, z: size * 0.42, r: 3, z0: size * 0.42 - 3, z1: size * 0.42 + 3 },
            slide: { x: size - 7, z: size * 0.5 + 3.5, r: 4, z0: size * 0.5, z1: size * 0.5 + 7 },
        },
        rug: { x: size / 2 + 1, z: size / 2 + 1, r: 7 },
        plant: { x: 2.5, z: 2.5, r: 2 },
        gadgets: {
            robot: { x: size - 4, z: size - 4, r: 2 },
            feeder: { x: size - 8, z: 3.2, r: 2 },
            firstaid: { x: 2.6, z: size - 4, r: 2 },
            bed: { x: 17, z: size - 3.5, r: 3 },
        },
    };
}

/** 서버의 똥 자리(u, v: 0~1)를 방 바닥 위로 펼친다. 쿠션·밥그릇 위면 반대쪽으로 옮긴다 */
export function poopSpot(r: RoomSpec, u: number, v: number): { x: number; z: number } {
    const at = (u: number, v: number) => ({ x: r.walkMin + u * (r.walkMax - r.walkMin), z: r.walkMin + v * (r.walkMax - r.walkMin) });
    const clear = (p: { x: number; z: number }) =>
        [r.cushion, r.bowl].every(o => Math.hypot(p.x - o.x, p.z - o.z) > o.r + 2.5);
    for (const [a, b] of [[u, v], [1 - u, v], [u, 1 - v], [1 - u, 1 - v], [0.5, 0.5]]) {
        const p = at(a, b);
        if (clear(p)) return p;
    }
    return at(0.5, 0.5);
}

export interface SceneLayout {
    kv: number;      // 복셀 한 칸 = kv 픽셀
    width: number;
    height: number;
    ox: number;      // 방 안쪽 구석 (x = z = 0, 바닥) 의 화면 위치
    oy: number;
    room: RoomSpec;
}

export function makeSceneLayout(width: number, level = 0): SceneLayout {
    const room = roomSpec(level);
    const pad = 8;
    const kv = (width - pad * 2) / (2 * room.size * C);
    const oy = WALL_H * C * kv + pad;
    return { kv, width, ox: width / 2, oy, height: oy + room.size * kv + kv * 1.2 + pad, room };
}

/** 바닥 위 (x, z) 의 화면 위치 */
export const floorPoint = (l: SceneLayout, x: number, z: number, y = 0): [number, number] =>
    [l.ox + (x - z) * C * l.kv, l.oy + ((x + z) * 0.5 - y * C) * l.kv];

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string): Box =>
    ({ b: [x0, y0, z0, x1, y1, z1], c });

export const CUSHION_PART: Part = {
    boxes: [
        box(-4.5, 0, -4.5, 4.5, 0.8, 4.5, '#E58FA6'),
        box(-3.8, 0.8, -3.8, 3.8, 1.2, 3.8, '#F5B8C8'),
    ],
    pivot: [0, 0, 0],
};

export const BOWL_PART: Part = {
    boxes: [
        box(-2.6, 0, -2.6, 2.6, 0.4, 2.6, '#4A7CC9'),
        box(-2.6, 0.4, -2.6, 2.6, 1.6, -1.8, '#5B8EDB'),
        box(-2.6, 0.4, 1.8, 2.6, 1.6, 2.6, '#5B8EDB'),
        box(-2.6, 0.4, -1.8, -1.8, 1.6, 1.8, '#5B8EDB'),
        box(1.8, 0.4, -1.8, 2.6, 1.6, 1.8, '#5B8EDB'),
        box(-1.8, 0.4, -1.8, 1.8, 0.6, 1.8, '#3F6AAE'),   // 빈 그릇 바닥
    ],
    pivot: [0, 0, 0],
};

/** 밥이 소복이 담긴 그릇 */
export const BOWL_FULL_PART: Part = {
    boxes: [
        ...BOWL_PART.boxes.slice(0, 5),
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

// 알 — 크림색 바탕에 주황 점. 점은 보이는 두 옆면(+x, +z)에 살짝 튀어나오게 붙인다
const EGG = '#FFF3D6', SPOT = '#F2B66D';
export const EGG_PART: Part = {
    boxes: [
        box(-1.5, 0, -1.5, 1.5, 0.6, 1.5, EGG),
        box(-2.1, 0.6, -2.1, 2.1, 1.5, 2.1, EGG),
        box(-2.4, 1.5, -2.4, 2.4, 4.0, 2.4, EGG),
        box(-2.1, 4.0, -2.1, 2.1, 5.4, 2.1, EGG),
        box(-1.6, 5.4, -1.6, 1.6, 6.5, 1.6, EGG),
        box(-0.9, 6.5, -0.9, 0.9, 7.2, 0.9, EGG),
        box(2.4, 1.9, -1.5, 2.5, 2.9, -0.5, SPOT),
        box(2.4, 2.9, 0.7, 2.5, 3.7, 1.5, SPOT),
        box(-1.3, 2.6, 2.4, -0.3, 3.6, 2.5, SPOT),
        box(0.8, 1.7, 2.4, 1.6, 2.5, 2.5, SPOT),
        box(2.1, 4.5, -0.5, 2.2, 5.1, 0.3, SPOT),
        box(-0.4, 4.6, 2.1, 0.5, 5.2, 2.2, SPOT),
    ],
    pivot: [0, 0, 0],
};

// 떠나며 남긴 편지 (바닥에 놓인 봉투)
export const LETTER_PART: Part = {
    boxes: [
        box(-2.8, 0, -2, 2.8, 0.3, 2, '#FFFDF6'),
        box(-0.5, 0.3, -0.5, 0.5, 0.45, 0.5, '#E2574C'),   // 봉인
    ],
    pivot: [0, 0, 0],
};

// ── 장난감 ─────────────────────────────────
const INK = '#2A2420';
// 분홍 곰 인형 (얼굴은 +z 쪽)
const DOLL = '#F4A6B8';
export const DOLL_PART: Part = {
    boxes: [
        box(-1, 0, -0.9, 1, 1.8, 0.9, DOLL),
        box(-1.4, 0.8, -0.4, -1, 1.6, 0.4, DOLL),
        box(1, 0.8, -0.4, 1.4, 1.6, 0.4, DOLL),
        box(-1.1, 1.8, -1, 1.1, 3.6, 1, DOLL),
        box(-1.1, 3.6, -0.3, -0.5, 4.1, 0.3, DOLL),
        box(0.5, 3.6, -0.3, 1.1, 4.1, 0.3, DOLL),
        box(-0.6, 2.6, 1, -0.3, 2.9, 1.08, INK),
        box(0.3, 2.6, 1, 0.6, 2.9, 1.08, INK),
        box(-0.25, 2.15, 1, 0.25, 2.45, 1.12, '#7A3B4A'),
        box(-0.6, 0.4, 0.9, 0.6, 1.4, 0.98, '#FFE0E8'),
    ],
    pivot: [0, 0, 0],
};

// 비눗방울 기계: 하늘색 통 위에 비눗방울 고리
export const BUBBLES_PART: Part = {
    boxes: [
        box(-1.5, 0, -1.5, 1.5, 1.6, 1.5, '#7CC6F2'),
        box(-1, 1.6, -1, 1, 2, 1, '#5AA9D6'),
        box(-0.15, 2, -0.15, 0.15, 3.4, 0.15, '#9AA3AE'),
        box(-0.9, 3.4, -0.15, 0.9, 3.7, 0.15, '#FF9EC4'),
        box(-0.9, 4.9, -0.15, 0.9, 5.2, 0.15, '#FF9EC4'),
        box(-0.9, 3.7, -0.15, -0.6, 4.9, 0.15, '#FF9EC4'),
        box(0.6, 3.7, -0.15, 0.9, 4.9, 0.15, '#FF9EC4'),
        box(1.5, 0.5, -0.6, 1.6, 1.1, 0.6, '#FFFFFF'),
    ],
    pivot: [0, 0, 0],
};

// 터널: z 로 6칸 뻗은 아치. 세 마디 색을 번갈아
function tunnelPart(): Part {
    const boxes: Box[] = [];
    const cols = ['#F2B84B', '#F29B4B', '#F2B84B'];
    for (let i = 0; i < 3; i++) {
        const z0 = -3 + i * 2, z1 = z0 + 2, c = cols[i];
        boxes.push(box(-2, 0, z0, -1.6, 3, z1, c), box(1.6, 0, z0, 2, 3, z1, c), box(-2, 3, z0, 2, 3.5, z1, c));
    }
    return { boxes, pivot: [0, 0, 0] };
}
export const TUNNEL_PART = tunnelPart();

// 미끄럼틀: -z 쪽 사다리로 올라가서 +z 쪽으로 내려온다 (가운데가 원점, 길이 7)
export const SLIDE_TOP = 5;
function slidePart(): Part {
    const boxes: Box[] = [];
    const RAIL = '#5B8EDB', STEP = '#8FB4EA', SLOPE = '#FF8A65';
    boxes.push(box(-1.5, 0, -3.5, -1.2, SLOPE_TOP_Y, -3.2, RAIL), box(1.2, 0, -3.5, 1.5, SLOPE_TOP_Y, -3.2, RAIL));
    for (let y = 1; y < SLOPE_TOP_Y; y += 1.1) boxes.push(box(-1.2, y, -3.45, 1.2, y + 0.25, -3.25, STEP));
    boxes.push(box(-1.5, SLOPE_TOP_Y - 0.4, -3.2, 1.5, SLOPE_TOP_Y, -2, RAIL));                // 꼭대기 발판
    boxes.push(box(-1.5, 0, -2.3, -1.2, SLOPE_TOP_Y - 0.4, -2, RAIL), box(1.2, 0, -2.3, 1.5, SLOPE_TOP_Y - 0.4, -2, RAIL));
    const n = 6;
    for (let i = 0; i < n; i++) {
        const h = (SLOPE_TOP_Y - 0.4) * (1 - i / n);
        boxes.push(box(-1.5, Math.max(0, h - 1.4), -2 + i * (5.5 / n), 1.5, h, -2 + (i + 1) * (5.5 / n), i % 2 ? SLOPE : '#FF7A50'));
    }
    return { boxes, pivot: [0, 0, 0] };
}
const SLOPE_TOP_Y = SLIDE_TOP;
export const SLIDE_PART = slidePart();

// ── 가구 ───────────────────────────────────
export const RUG_PART: Part = {
    boxes: [
        box(-6, 0, -6, 6, 0.15, 6, '#9FD3C7'),
        box(-4.5, 0.15, -4.5, 4.5, 0.2, 4.5, '#C9EBE2'),
        box(-2, 0.2, -2, 2, 0.25, 2, '#9FD3C7'),
    ],
    pivot: [0, 0, 0],
};

export const PLANT_PART: Part = {
    boxes: [
        box(-1.3, 0, -1.3, 1.3, 2, 1.3, '#C8764B'),
        box(-1.5, 2, -1.5, 1.5, 2.4, 1.5, '#B5653C'),
        box(-1.1, 2.4, -1.1, 1.1, 4.2, 1.1, '#5DBB63'),
        box(-1.8, 3.4, -0.6, -1.1, 4.6, 0.6, '#4CA552'),
        box(1.1, 3.6, -0.6, 1.8, 5, 0.6, '#4CA552'),
        box(-0.6, 4.2, -0.6, 0.6, 5.8, 0.6, '#6CCB72'),
        box(-0.5, 3.8, 1.1, 0.5, 5.2, 1.7, '#4CA552'),
    ],
    pivot: [0, 0, 0],
};

/** 쿠션 색 (가구 'cushion_blue') */
export const CUSHION_BLUE_PART: Part = {
    boxes: [
        box(-4.5, 0, -4.5, 4.5, 0.8, 4.5, '#7FA8E0'),
        box(-3.8, 0.8, -3.8, 3.8, 1.2, 3.8, '#B3CCF0'),
    ],
    pivot: [0, 0, 0],
};

/** 벽지 색: 바탕, 무늬 */
export const WALLPAPERS: Record<string, { base: string; pattern: string; kind: 'stripe' | 'dot' }> = {
    wall_sky: { base: '#d3e9f8', pattern: '#e8f4fc', kind: 'stripe' },
    wall_pink: { base: '#f8dbe3', pattern: '#fdf0f3', kind: 'dot' },
    wall_mint: { base: '#d3efe3', pattern: '#e9f8f1', kind: 'stripe' },
};

// ── 능력 물건 ──────────────────────────────
// 자동 청소기: 납작한 원반 로봇
export const ROBOT_PART: Part = {
    boxes: [
        box(-1.6, 0, -1.2, 1.6, 0.7, 1.2, '#E8ECF2'),
        box(-1.2, 0, -1.6, 1.2, 0.7, 1.6, '#E8ECF2'),
        box(-0.9, 0.7, -0.9, 0.9, 0.95, 0.9, '#5B6B80'),
        box(1.6, 0.25, -0.5, 1.7, 0.45, 0.5, '#3FC1C9'),
        box(-0.2, 0.95, -0.2, 0.2, 1.05, 0.2, '#3FC1C9'),
    ],
    pivot: [0, 0, 0],
};

// 자동 급식기: 사료통이 달린 기둥
export const FEEDER_PART: Part = {
    boxes: [
        box(-1.4, 0, -1.4, 1.4, 0.6, 1.4, '#9AA3AE'),
        box(-0.9, 0.6, -0.9, 0.9, 2.6, 0.9, '#C9D1DB'),
        box(-1.3, 2.6, -1.3, 1.3, 4.6, 1.3, '#BFE3FF'),
        box(-1, 2.8, -1, 1, 3.8, 1, '#B5793F'),
        box(-1.4, 4.6, -1.4, 1.4, 5, 1.4, '#7C8794'),
        box(0.9, 1.2, -0.4, 1.2, 1.8, 0.4, '#FF8A65'),
    ],
    pivot: [0, 0, 0],
};

// 구급상자: 흰 상자에 빨간 십자 (보이는 옆면 +x, +z 에)
export const FIRSTAID_PART: Part = {
    boxes: [
        box(-1.5, 0, -1.1, 1.5, 2, 1.1, '#FFFFFF'),
        box(-0.4, 2, -0.3, 0.4, 2.3, 0.3, '#9AA3AE'),
        box(-0.25, 0.5, 1.1, 0.25, 1.5, 1.15, '#E2574C'),
        box(-0.5, 0.75, 1.1, 0.5, 1.25, 1.15, '#E2574C'),
        box(1.5, 0.5, -0.25, 1.55, 1.5, 0.25, '#E2574C'),
        box(1.5, 0.75, -0.5, 1.55, 1.25, 0.5, '#E2574C'),
    ],
    pivot: [0, 0, 0],
};

// 포근한 침대: 나무 틀에 이불과 베개
export const BED_PART: Part = {
    boxes: [
        box(-2.5, 0, -1.8, 2.5, 0.8, 1.8, '#C8956A'),
        box(-2.5, 0.8, -1.8, -2.1, 2.4, 1.8, '#B5794F'),
        box(-2.1, 0.8, -1.6, 2.4, 1.3, 1.6, '#FFFFFF'),
        box(-2, 1.3, -1.4, -0.9, 1.8, 1.4, '#FFF3D6'),
        box(-0.6, 1.3, -1.6, 2.4, 1.6, 1.6, '#8EC5FF'),
        box(-0.6, 1.6, -1.2, 2.2, 1.7, 1.2, '#A8D4FF'),
    ],
    pivot: [0, 0, 0],
};
