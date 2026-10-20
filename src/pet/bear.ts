// 곰 — 두 발로 서는 곰. 발밑 가운데가 원점, 얼굴은 -z.
// 머리 크기는 단계마다 같고, 몸·다리·팔 길이가 달라진다 (유아는 머리가 크고 통통, 성인은 길쭉하고 어깨가 넓다).
// 옷(상의·모자)은 몸 치수에 맞춰 부위에 상자를 덧붙여 그린다 — 그래서 숨쉬기·걷기를 그대로 따라간다.
// 부위마다 따로 그려서 따로 움직인다 (숨쉬기·걷기·눈 깜빡임·귀 쫑긋).
import { shade, type Box, type Part } from './voxel';

export type PartId =
    | 'legL' | 'legR' | 'body' | 'tail' | 'armL' | 'armR'
    | 'head' | 'eyeL' | 'eyeR' | 'earL' | 'earR';

/** 머리에 붙어서 같이 움직이는 부위 */
export const HEAD_GROUP: PartId[] = ['head', 'eyeL', 'eyeR', 'earL', 'earR'];
export const BODY_PARTS: PartId[] = ['legL', 'legR', 'body', 'tail', 'armL', 'armR'];

export interface PetModel {
    parts: Record<PartId, Part>;
    height: number;      // 귀 끝까지 (칸)
    radius: number;      // 위에서 봤을 때 가장 먼 곳까지 (칸)
    neckY: number;
    hipY: number;
}

const FUR = '#A8754A';
const PAW = '#8A5D38';
const TAN = '#E8C79F';
const INK = '#2A2420';
const PINK = '#F0A3A3';
const EAR_IN = '#E3A089';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string, decal = false): Box =>
    ({ b: [x0, y0, z0, x1, y1, z1], c, decal });
// 왼쪽(-x) 상자를 오른쪽으로 뒤집기
const mirror = (bx: Box): Box => ({ ...bx, b: [-bx.b[3], bx.b[1], bx.b[2], -bx.b[0], bx.b[4], bx.b[5]] });
const mirrorPart = (p: Part): Part => ({ boxes: p.boxes.map(mirror), pivot: [-p.pivot[0], p.pivot[1], p.pivot[2]] });

/** 표정: 기분 4가지 + 상태 3가지 */
export type Expr = 'normal' | 'happy' | 'sad' | 'angry' | 'hungry' | 'sleep' | 'sick';

const earL: Part = {
    boxes: [box(-3.7, 13, -0.8, -1.9, 14.9, 0.8, FUR), box(-3.3, 13.3, -0.9, -2.3, 14.5, -0.8, EAR_IN, true)],
    pivot: [-2.8, 13, 0],
};

// 얼굴 무늬는 머리 앞면(z = -3)에 붙는다. 왼쪽 눈 자리: x -2.3 ~ -1.2, y 9.8 ~ 11.3
const F0 = -3.1, F1 = -3;
const eyeBoxes: Record<Expr, Box[]> = {
    normal: [box(-2.3, 9.8, F0, -1.2, 11.3, F1, INK, true), box(-2.0, 10.6, -3.15, -1.6, 11.0, F0, '#FFFFFF', true)],
    // ^ 모양 눈웃음
    happy: [box(-2.4, 10.8, F0, -1.1, 11.2, F1, INK, true), box(-2.4, 10.2, F0, -2.0, 10.8, F1, INK, true), box(-1.5, 10.2, F0, -1.1, 10.8, F1, INK, true)],
    sad: [box(-2.2, 9.8, F0, -1.3, 10.9, F1, INK, true), box(-1.95, 10.4, -3.15, -1.6, 10.75, F0, '#FFFFFF', true)],
    angry: [box(-2.3, 9.8, F0, -1.2, 10.9, F1, INK, true)],
    hungry: [box(-2.3, 9.8, F0, -1.2, 11.3, F1, INK, true), box(-2.0, 10.6, -3.15, -1.6, 11.0, F0, '#FFFFFF', true)],
    // 감은 눈
    sleep: [box(-2.4, 10.1, F0, -1.1, 10.45, F1, INK, true)],
    sick: [box(-2.4, 10.2, F0, -1.1, 10.55, F1, INK, true), box(-2.2, 9.7, F0, -1.3, 9.95, F1, '#8C7BA8', true)],
};
// 눈썹 (머리에 붙인다 — 눈을 깜빡여도 같이 찌그러지지 않게). 왼쪽만, 오른쪽은 뒤집는다
const BROW = '#3E2716';
const browBoxes: Partial<Record<Expr, Box[]>> = {
    // 안쪽이 올라간 八 모양 (우울·배고픔·아픔)
    sad: [box(-2.8, 11.5, F0, -2.0, 11.95, F1, BROW, true), box(-2.0, 11.9, F0, -1.1, 12.45, F1, BROW, true)],
    hungry: [box(-2.8, 11.6, F0, -2.0, 12.05, F1, BROW, true), box(-2.0, 12.0, F0, -1.1, 12.5, F1, BROW, true)],
    sick: [box(-2.8, 11.6, F0, -2.0, 12.0, F1, BROW, true), box(-2.0, 11.95, F0, -1.1, 12.4, F1, BROW, true)],
    // 안쪽이 내려간 V 모양 (화남)
    angry: [box(-2.9, 12.0, F0, -2.1, 12.5, F1, BROW, true), box(-2.1, 11.4, F0, -1.0, 11.95, F1, BROW, true)],
};
// 입 (주둥이 앞면 z = -3.9, 코 아래)
const M0 = -4.0, M1 = -3.9;
const mouthBoxes: Record<Expr, Box[]> = {
    normal: [box(-0.15, 7.9, M0, 0.15, 8.8, M1, INK, true)],
    happy: [box(-0.15, 8.3, M0, 0.15, 8.8, M1, INK, true), box(-0.7, 7.7, M0, 0.7, 8.3, M1, '#8C3B3B', true)],
    sad: [box(-0.15, 8.3, M0, 0.15, 8.8, M1, INK, true), box(-0.6, 7.8, M0, 0.6, 8.05, M1, INK, true)],
    angry: [box(-0.15, 8.3, M0, 0.15, 8.8, M1, INK, true), box(-0.8, 7.85, M0, 0.8, 8.15, M1, INK, true)],
    hungry: [box(-0.45, 7.6, M0, 0.45, 8.5, M1, '#8C3B3B', true), box(0.55, 7.0, M0, 0.85, 7.9, M1, '#9ED3F0', true)],
    sleep: [box(-0.15, 8.0, M0, 0.15, 8.8, M1, INK, true)],
    sick: [box(-0.7, 7.95, M0, -0.1, 8.2, M1, INK, true), box(-0.1, 7.75, M0, 0.6, 8.0, M1, INK, true)],
};


/** 성장 단계별 몸 치수 (칸). 머리는 y 7~13 기준으로 그려 두고 neck 만큼 옮긴다 */
export type BodyStage = 'baby' | 'teen' | 'adult';
interface Dims { leg: number; neck: number; bw: number; bd: number; arm: number; armW: number }
const DIMS: Record<BodyStage, Dims> = {
    baby: { leg: 1.1, neck: 5.6, bw: 2.5, bd: 2.3, arm: 2.4, armW: 1.1 },
    teen: { leg: 2.2, neck: 7, bw: 2.6, bd: 2, arm: 3.2, armW: 1.2 },
    adult: { leg: 3.3, neck: 9.1, bw: 3.0, bd: 2.3, arm: 4.0, armW: 1.35 },
};

/** 옷 색 (서버 COLORS 와 같은 이름) */
export const CLOTH_COLORS: Record<string, string> = {
    red: '#E25B5B', blue: '#4E86D8', yellow: '#F2C94C', green: '#5DBB78', pink: '#F29CC0',
};
const WHITE = '#F7F4EE';
const GOLD = '#F0BE3A';
const STRAW = '#E9CF8A';
/** 입은 옷: 'top_tee_red', 'hat_cap_blue' */
export interface Outfit { top?: string | null; hat?: string | null }
const parseCloth = (key?: string | null) => {
    const m = key ? /^(top|hat)_([a-z]+)_([a-z]+)$/.exec(key) : null;
    return m ? { shape: m[2], color: CLOTH_COLORS[m[3]] ?? CLOTH_COLORS.red } : null;
};

const shiftY = (bx: Box, dy: number): Box => ({ ...bx, b: [bx.b[0], bx.b[1] + dy, bx.b[2], bx.b[3], bx.b[4] + dy, bx.b[5]] });
const shiftPart = (p: Part, dy: number): Part => ({ boxes: p.boxes.map(b => shiftY(b, dy)), pivot: [p.pivot[0], p.pivot[1] + dy, p.pivot[2]] });

/** 모자 상자 (머리 y 7~13 기준, 나중에 같이 옮긴다) */
function hatBoxes(shape: string, c: string): Box[] {
    const dark = shade(c, 0.82);
    switch (shape) {
        case 'beanie': return [
            box(-3.75, 12.3, -3.25, 3.75, 12.9, 3.25, dark),          // 접은 단
            box(-3.6, 12.9, -3.1, 3.6, 13.9, 3.1, c),
            box(-0.7, 13.9, -0.7, 0.7, 14.9, 0.7, WHITE),             // 방울
        ];
        case 'cap': return [
            box(-3.6, 12.4, -3.1, 3.6, 13.8, 3.1, c),
            box(-2.6, 12.4, -5.0, 2.6, 12.75, -3.1, dark),            // 챙
            box(-0.4, 13.8, -0.4, 0.4, 14.1, 0.4, dark),
        ];
        case 'straw': return [
            box(-5.2, 12.8, -4.7, 5.2, 13.15, 4.7, STRAW),           // 넓은 챙
            box(-1.8, 13.15, -1.8, 1.8, 13.7, 1.8, c),                // 띠
            box(-1.7, 13.7, -1.7, 1.7, 15.0, 1.7, shade(STRAW, 0.93)),
        ];
        case 'crown': return [
            box(-1.8, 13, -1.8, 1.8, 13.6, 1.8, GOLD),
            box(-1.8, 13.6, -1.8, -1.2, 14.5, -1.2, GOLD), box(1.2, 13.6, -1.8, 1.8, 14.5, -1.2, GOLD),
            box(-1.8, 13.6, 1.2, -1.2, 14.5, 1.8, GOLD), box(1.2, 13.6, 1.2, 1.8, 14.5, 1.8, GOLD),
            box(-0.3, 13.6, -1.8, 0.3, 14.8, -1.2, GOLD),
            box(-0.4, 13.1, -1.9, 0.4, 13.5, -1.8, c, true),           // 보석
        ];
        default: return [   // ribbon 리본 (왼쪽 앞 머리 위)
            box(-3.4, 12.7, -2.4, -2.5, 13.8, -1.4, c),
            box(-1.5, 12.7, -2.4, -0.6, 13.8, -1.4, c),
            box(-2.5, 12.9, -2.5, -1.5, 13.6, -1.3, dark),
        ];
    }
}

const models = new Map<string, PetModel>();

/** 표정·단계·옷에 맞춘 곰 */
export function bearModel(expr: Expr, stage: BodyStage = 'teen', outfit: Outfit = {}): PetModel {
    const key = `${expr}:${stage}:${outfit.top ?? ''}:${outfit.hat ?? ''}`;
    const hit = models.get(key);
    if (hit) return hit;
    const D = DIMS[stage];
    const dy = D.neck - 7;
    const top = parseCloth(outfit.top);
    const hat = parseCloth(outfit.hat);
    const fur = expr === 'sick' ? '#9C7E5E' : FUR;   // 아프면 털빛이 조금 바랜다
    const cheek = expr === 'sick' ? '#A9BEE0' : expr === 'angry' ? '#E87070' : PINK;
    const brows = browBoxes[expr] ?? [];
    const { leg, neck, bw, bd, arm, armW } = D;
    const fz = -bd;   // 몸 앞면

    // 다리
    const legBoxes: Box[] = [box(-(bw - 0.4), 0, -(bd - 0.7), -0.4, leg, bd - 0.8, fur),
        box(-(bw - 0.5), 0.2, -(bd - 0.6), -0.5, Math.min(1, leg * 0.6), -(bd - 0.7), PAW, true)];
    // 팔 (어깨에서 아래로, 끝 1칸은 발바닥 색)
    const ax0 = -(bw + armW), ay1 = neck - 0.4, ay0 = ay1 - arm;
    const armBoxes: Box[] = [box(ax0, ay0 + 1, -1, -bw, ay1, 1, fur), box(ax0, ay0, -1, -bw, ay0 + 1, 1, PAW)];
    // 몸통
    const bodyBoxes: Box[] = [box(-bw, leg, -bd, bw, neck, bd, fur)];
    // 성인은 배 무늬를 줄이고 그 위 털에 반달무늬를 둔다
    const belly = box(-(bw - 0.9), leg + 0.6, fz - 0.1, bw - 0.9, stage === 'adult' ? neck - 2.9 : neck - 0.6, fz, TAN, true);
    if (stage === 'adult') {
        // 성인: 가슴에 반달무늬
        bodyBoxes.push(box(-2.1, neck - 2.3, fz - 0.15, -1.3, neck - 1.5, fz - 0.1, WHITE, true),
            box(-1.3, neck - 2.7, fz - 0.15, 1.3, neck - 2.1, fz - 0.1, WHITE, true),
            box(1.3, neck - 2.3, fz - 0.15, 2.1, neck - 1.5, fz - 0.1, WHITE, true));
    }

    if (top) {
        const c = top.color, dark = shade(c, 0.8);
        const o = 0.15, sy0 = leg + (neck - leg) * 0.2;      // 옷 아랫단
        const sleeveLen = top.shape === 'hoodie' ? arm - 1.1 : Math.min(1.4, arm * 0.45);
        const sleeve = (col: string) => box(ax0 - o, ay1 - sleeveLen, -1 - o, -bw + 0.05, ay1 + o, 1 + o, col);
        if (top.shape === 'overalls') {
            // 멜빵바지: 아랫도리 + 앞판 + 멜빵, 다리에 반바지
            const by0 = leg + (neck - leg) * 0.45;
            // 겹치는 상자는 깊이 순서가 꼬이므로, 털 몸통은 바지 위쪽만 남긴다
            bodyBoxes[0] = box(-bw, by0, -bd, bw, neck, bd, fur);
            bodyBoxes.push(box(-bw - o, leg - 0.05, -bd - o, bw + o, by0, bd + o, c));
            // 배 무늬는 바지 위로 그려지므로 넣지 않는다
            bodyBoxes.push(box(-1.3, by0, fz - o - 0.05, 1.3, by0 + (neck - by0) * 0.55, fz - o, c, true),
                box(-(bw - 0.5), by0, fz - o - 0.05, -(bw - 1.0), neck, fz - o, dark, true),
                box(bw - 1.0, by0, fz - o - 0.05, bw - 0.5, neck, fz - o, dark, true),
                box(-(bw - 0.85), neck - 1.3, fz - o - 0.1, -(bw - 0.65), neck - 1.1, fz - o - 0.05, GOLD, true),
                box(bw - 0.65, neck - 1.3, fz - o - 0.1, bw - 0.85, neck - 1.1, fz - o - 0.05, GOLD, true));
            legBoxes.push(box(-(bw - 0.4) - 0.1, leg * 0.5, -(bd - 0.7) - 0.1, -0.3, leg + 0.02, bd - 0.7, c));
        } else {
            bodyBoxes[0] = box(-bw, leg, -bd, bw, sy0, bd, fur);   // 옷 아래로 보이는 털만
            if (top.shape === 'stripe') {
                const n = 5, h = (neck + 0.05 - sy0) / n;
                for (let i = 0; i < n; i++) bodyBoxes.push(box(-bw - o, sy0 + i * h, -bd - o, bw + o, sy0 + (i + 1) * h, bd + o, i % 2 ? WHITE : c));
            } else {
                bodyBoxes.push(box(-bw - o, sy0, -bd - o, bw + o, neck + 0.05, bd + o, c));
            }
            if (top.shape === 'hoodie') {
                bodyBoxes.push(
                    box(-bw + 0.5, neck - 1.4, bd + o, bw - 0.5, neck, bd + 0.7, dark),             // 모자(후드)
                    box(-1.4, sy0 + 0.4, fz - o - 0.05, 1.4, sy0 + 1.4, fz - o, dark, true),       // 주머니
                    box(-0.8, neck - 1.6, fz - o - 0.05, -0.6, neck - 0.2, fz - o, WHITE, true),   // 끈
                    box(0.6, neck - 1.6, fz - o - 0.05, 0.8, neck - 0.2, fz - o, WHITE, true));
            }
            if (top.shape === 'tee') bodyBoxes.push(box(-0.9, neck - 0.6, fz - o - 0.05, 0.9, neck + 0.05, fz - o, dark, true)); // 목 둘레
            armBoxes.push(sleeve(c));
        }
    } else {
        bodyBoxes.splice(1, 0, belly);
    }
    if (top?.shape === 'stripe') {
        // 소매 끝 흰 줄
        const sl = ay1 - Math.min(1.4, arm * 0.45);
        armBoxes.push(box(ax0 - 0.15, sl - 0.4, -1.15, -bw + 0.05, sl, 1.15, WHITE));
    }

    const legL: Part = { boxes: legBoxes, pivot: [-bw / 2, 0, 0] };
    const armL: Part = { boxes: armBoxes, pivot: [ax0 + armW / 2, ay1 - 0.2, 0] };
    // 유아는 눈이 크다
    const eyeScale = stage === 'baby' ? 1.3 : 1;
    const big = (bx: Box): Box => {
        const [x0, y0, z0, x1, y1, z1] = bx.b;
        const sx = (x: number) => -1.75 + (x + 1.75) * eyeScale, sy = (y: number) => 10.4 + (y - 10.4) * eyeScale;
        return { ...bx, b: [sx(x0), sy(y0), z0, sx(x1), sy(y1), z1] };
    };
    const eyeL: Part = shiftPart({ boxes: eyeBoxes[expr].map(big), pivot: [-1.75, 10.55, -3] }, dy);
    const recolor = (p: Part): Part => ({ ...p, boxes: p.boxes.map(b => b.c === FUR ? { ...b, c: fur } : b) });
    const ear = shiftPart(recolor(earL), dy);
    // 성인은 주둥이가 앞으로 더 나온다 (코·입 무늬도 같이 앞으로)
    const snout = stage === 'adult' ? 0.6 : 0;
    const fwd = (bx: Box): Box => ({ ...bx, b: [bx.b[0], bx.b[1], bx.b[2] - snout, bx.b[3], bx.b[4], bx.b[5] - snout] });
    const headBoxes: Box[] = [
        box(-3.5, 7, -3, 3.5, 13, 3, fur),
        box(-1.5, 7.4, -3.9 - snout, 1.5, 9.6, -3, TAN),   // 주둥이
        fwd(box(-0.6, 8.8, M0, 0.6, 9.5, M1, INK, true)),  // 코
        ...mouthBoxes[expr].map(fwd),
        // 유아는 정수리에 털이 삐죽
        ...(stage === 'baby' && !hat ? [box(-0.7, 13, -1.6, 0.3, 14.5, -0.6, PAW), box(0.3, 13, -1.4, 1.0, 13.9, -0.7, PAW)] : []),
        box(-3.2, 8.4, F0, -2.2, 9.1, F1, cheek, true),    // 볼
        box(2.2, 8.4, F0, 3.2, 9.1, F1, cheek, true),
        ...brows, ...brows.map(mirror),
        ...(hat ? hatBoxes(hat.shape, hat.color) : []),
    ].map(b => shiftY(b, dy));
    const hatTop = hat ? Math.max(...hatBoxes(hat.shape, hat.color).map(b => b.b[4])) : 0;

    const m: PetModel = {
        parts: {
            legL,
            legR: mirrorPart(legL),
            body: { boxes: bodyBoxes, pivot: [0, leg, 0] },
            tail: { boxes: [box(-0.7, leg + 0.6, bd, 0.7, leg + 1.9, bd + 1, TAN)], pivot: [0, leg + 1.2, bd] },
            armL,
            armR: mirrorPart(armL),
            head: { boxes: headBoxes, pivot: [0, neck, 0] },
            eyeL,
            eyeR: mirrorPart(eyeL),
            earL: ear,
            earR: mirrorPart(ear),
        },
        height: Math.max(14.9, hatTop) + dy,
        radius: hat?.shape === 'straw' ? 6.6 : 5.6,
        neckY: neck,
        hipY: leg,
    };
    models.set(key, m);
    return m;
}

export const BEAR = bearModel('normal');
