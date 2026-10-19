// 곰 — 두 발로 서는 아기 곰. 발밑 가운데가 원점, 얼굴은 -z.
// 부위마다 따로 그려서 따로 움직인다 (숨쉬기·걷기·눈 깜빡임·귀 쫑긋).
import type { Box, Part } from './voxel';

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

const legL: Part = {
    boxes: [box(-2.2, 0, -1.3, -0.4, 2.2, 1.2, FUR), box(-2.1, 0.2, -1.4, -0.5, 1, -1.3, PAW, true)],
    pivot: [-1.3, 0, 0],
};
const armL: Part = {
    boxes: [box(-3.8, 4.4, -1, -2.6, 6.6, 1, FUR), box(-3.8, 3.4, -1, -2.6, 4.4, 1, PAW)],
    pivot: [-3.2, 6.4, 0],
};
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

const models = new Map<Expr, PetModel>();

/** 표정에 맞춘 곰 */
export function bearModel(expr: Expr): PetModel {
    const hit = models.get(expr);
    if (hit) return hit;
    const fur = expr === 'sick' ? '#9C7E5E' : FUR;   // 아프면 털빛이 조금 바랜다
    const cheek = expr === 'sick' ? '#A9BEE0' : expr === 'angry' ? '#E87070' : PINK;
    const eyeL: Part = { boxes: eyeBoxes[expr], pivot: [-1.75, 10.55, -3] };
    const brows = browBoxes[expr] ?? [];
    const recolor = (p: Part): Part => ({ ...p, boxes: p.boxes.map(b => b.c === FUR ? { ...b, c: fur } : b) });
    const m: PetModel = {
        parts: {
            legL: recolor(legL),
            legR: recolor(mirrorPart(legL)),
            body: {
                boxes: [
                    box(-2.6, 2.2, -2, 2.6, 7, 2, fur),
                    box(-1.7, 2.8, -2.1, 1.7, 6.4, -2, TAN, true),  // 배
                ],
                pivot: [0, 2.2, 0],
            },
            tail: { boxes: [box(-0.7, 2.8, 2, 0.7, 4.1, 3, TAN)], pivot: [0, 3.4, 2] },
            armL: recolor(armL),
            armR: recolor(mirrorPart(armL)),
            head: {
                boxes: [
                    box(-3.5, 7, -3, 3.5, 13, 3, fur),
                    box(-1.5, 7.4, -3.9, 1.5, 9.6, -3, TAN),           // 주둥이
                    box(-0.6, 8.8, M0, 0.6, 9.5, M1, INK, true),       // 코
                    ...mouthBoxes[expr],
                    box(-3.2, 8.4, F0, -2.2, 9.1, F1, cheek, true),    // 볼
                    box(2.2, 8.4, F0, 3.2, 9.1, F1, cheek, true),
                    ...brows, ...brows.map(mirror),
                ],
                pivot: [0, 7, 0],
            },
            eyeL,
            eyeR: mirrorPart(eyeL),
            earL: recolor(earL),
            earR: recolor(mirrorPart(earL)),
        },
        height: 14.9,
        radius: 5.6,
        neckY: 7,
        hipY: 2.2,
    };
    models.set(expr, m);
    return m;
}

export const BEAR = bearModel('normal');
