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

const legL: Part = {
    boxes: [box(-2.2, 0, -1.3, -0.4, 2.2, 1.2, FUR), box(-2.1, 0.2, -1.4, -0.5, 1, -1.3, PAW, true)],
    pivot: [-1.3, 0, 0],
};
const armL: Part = {
    boxes: [box(-3.8, 4.4, -1, -2.6, 6.6, 1, FUR), box(-3.8, 3.4, -1, -2.6, 4.4, 1, PAW)],
    pivot: [-3.2, 6.4, 0],
};
const eyeL: Part = {
    boxes: [box(-2.3, 9.8, -3.1, -1.2, 11.3, -3, INK, true), box(-2.0, 10.6, -3.15, -1.6, 11.0, -3.1, '#FFFFFF', true)],
    pivot: [-1.75, 10.55, -3],
};
const earL: Part = {
    boxes: [box(-3.7, 13, -0.8, -1.9, 14.9, 0.8, FUR), box(-3.3, 13.3, -0.9, -2.3, 14.5, -0.8, EAR_IN, true)],
    pivot: [-2.8, 13, 0],
};

export const BEAR: PetModel = {
    parts: {
        legL,
        legR: mirrorPart(legL),
        body: {
            boxes: [
                box(-2.6, 2.2, -2, 2.6, 7, 2, FUR),
                box(-1.7, 2.8, -2.1, 1.7, 6.4, -2, TAN, true),  // 배
            ],
            pivot: [0, 2.2, 0],
        },
        tail: { boxes: [box(-0.7, 2.8, 2, 0.7, 4.1, 3, TAN)], pivot: [0, 3.4, 2] },
        armL,
        armR: mirrorPart(armL),
        head: {
            boxes: [
                box(-3.5, 7, -3, 3.5, 13, 3, FUR),
                box(-1.5, 7.4, -3.9, 1.5, 9.6, -3, TAN),           // 주둥이
                box(-0.6, 8.8, -4.0, 0.6, 9.5, -3.9, INK, true),   // 코
                box(-0.15, 7.9, -4.0, 0.15, 8.8, -3.9, INK, true), // 입
                box(-3.2, 8.4, -3.1, -2.2, 9.1, -3, PINK, true),   // 볼
                box(2.2, 8.4, -3.1, 3.2, 9.1, -3, PINK, true),
            ],
            pivot: [0, 7, 0],
        },
        eyeL,
        eyeR: mirrorPart(eyeL),
        earL,
        earR: mirrorPart(earL),
    },
    height: 14.9,
    radius: 5.6,
    neckY: 7,
    hipY: 2.2,
};
