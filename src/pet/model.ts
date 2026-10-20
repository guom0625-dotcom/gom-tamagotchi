// 펫 그림 — 두 발로 서는 동물. 발밑 가운데가 원점, 얼굴은 -z.
// 종류(species.ts)가 귀·꼬리·주둥이·몸 비율을, 변종이 털색·무늬를 정한다. 표정·성장 단계·옷은 모든 종류가 같이 쓴다.
// 머리 크기는 단계마다 같고, 몸·다리·팔 길이가 달라진다 (유아는 머리가 크고 통통, 성인은 길쭉하고 어깨가 넓다).
// 옷(상의·모자)은 몸 치수에 맞춰 부위에 상자를 덧붙여 그린다 — 그래서 숨쉬기·걷기를 그대로 따라간다.
// 부위마다 따로 그려서 따로 움직인다 (숨쉬기·걷기·눈 깜빡임·귀 쫑긋).
// 주의: 부피가 겹치는 상자는 앞뒤 순서가 꼬인다. 무늬는 겉면 바로 바깥의 얇은 상자(두께 0.08)나 앞면 무늬(decal)로 붙인다.
import { shade, type Box, type Part } from './voxel';
import { KINDS, lookOf, type Look, type Species } from './species';

export type PartId =
    | 'legL' | 'legR' | 'body' | 'tail' | 'armL' | 'armR'
    | 'head' | 'eyeL' | 'eyeR' | 'earL' | 'earR';

/** 머리에 붙어서 같이 움직이는 부위 */
export const HEAD_GROUP: PartId[] = ['head', 'eyeL', 'eyeR', 'earL', 'earR'];
export const BODY_PARTS: PartId[] = ['legL', 'legR', 'body', 'tail', 'armL', 'armR'];

export interface PetModel {
    parts: Record<PartId, Part>;
    height: number;      // 가장 높은 곳까지 (칸)
    radius: number;      // 위에서 봤을 때 가장 먼 곳까지 (칸)
    neckY: number;
    hipY: number;
}

const INK = '#2A2420';
const PINK = '#F0A3A3';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string, decal = false): Box =>
    ({ b: [x0, y0, z0, x1, y1, z1], c, decal });
// 왼쪽(-x) 상자를 오른쪽으로 뒤집기
const mirror = (bx: Box): Box => ({ ...bx, b: [-bx.b[3], bx.b[1], bx.b[2], -bx.b[0], bx.b[4], bx.b[5]] });
const mirrorPart = (p: Part): Part => ({ boxes: p.boxes.map(mirror), pivot: [-p.pivot[0], p.pivot[1], p.pivot[2]] });
const both = (bx: Box): Box[] => [bx, mirror(bx)];

/** 표정: 기분 4가지 + 상태 3가지 */
export type Expr = 'normal' | 'happy' | 'sad' | 'angry' | 'hungry' | 'sleep' | 'sick';

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


// 아프면 털빛이 회색 쪽으로 바랜다
const mix = (a: string, b: string, t: number) => {
    const p = (h: string, s: number) => (parseInt(h.slice(1), 16) >> s) & 255;
    const ch = (s: number) => Math.round(p(a, s) * (1 - t) + p(b, s) * t).toString(16).padStart(2, '0');
    return `#${ch(16)}${ch(8)}${ch(0)}`;
};
const fadeLook = (L: Look): Look => {
    const f = (c?: string) => (c ? mix(c, '#8F9AA6', 0.28) : c);
    const out: Look = { ...L };
    for (const k of Object.keys(L) as (keyof Look)[]) {
        const v = L[k];
        if (typeof v === 'string' && v.startsWith('#')) (out as unknown as Record<string, unknown>)[k] = f(v);
    }
    if (L.spots) out.spots = L.spots.map(c => f(c)!);
    return out;
};

const models = new Map<string, PetModel>();

/** 종류·변종·표정·단계·옷에 맞춘 펫 */
export function petModel(species: Species, variant: number, expr: Expr, stage: BodyStage = 'teen', outfit: Outfit = {}): PetModel {
    const key = `${species}:${variant}:${expr}:${stage}:${outfit.top ?? ''}:${outfit.hat ?? ''}`;
    const hit = models.get(key);
    if (hit) return hit;
    const K = KINDS[species];
    const L = expr === 'sick' ? fadeLook(lookOf(species, variant)) : lookOf(species, variant);
    const base = DIMS[stage];
    const legK = K.body?.leg ?? 1;
    const leg = base.leg * legK;
    const neck = base.neck - (base.leg - leg);          // 다리가 짧으면 몸 전체가 내려온다
    const bw = base.bw * (K.body?.bw ?? 1), bd = base.bd * (K.body?.bd ?? 1);
    const arm = base.arm * (legK < 1 ? 0.8 : 1), armW = base.armW;
    const dy = neck - 7;
    const top = parseCloth(outfit.top);
    const hat = parseCloth(outfit.hat);
    const cheek = expr === 'sick' ? '#A9BEE0' : expr === 'angry' ? '#E87070' : PINK;
    const fz = -bd;   // 몸 앞면
    const limb = L.limb ?? L.fur;
    const eyeC = L.eye ?? INK;
    const browC = L.eye ? shade(L.eye, 0.85) : '#3E2716';

    // 다리
    const legBoxes: Box[] = [box(-(bw - 0.4), 0, -(bd - 0.7), -0.4, leg, bd - 0.8, limb),
        box(-(bw - 0.5), 0.2, -(bd - 0.6), -0.5, Math.max(0.35, Math.min(1, leg * 0.6)), -(bd - 0.7), L.paw, true)];
    // 팔 (어깨에서 아래로, 끝 1칸은 발바닥 색)
    const ax0 = -(bw + armW), ay1 = neck - 0.4, ay0 = ay1 - arm;
    const armBoxes: Box[] = [box(ax0, ay0 + 1, -1, -bw, ay1, 1, limb), box(ax0, ay0, -1, -bw, ay0 + 1, 1, L.paw)];

    // 몸통 털 (y 범위만큼). 어깨 띠·뒤쪽 절반 색은 상자를 나눠서 칠한다
    const furBody = (y0: number, y1: number): Box[] => {
        const ys = [y0];
        if (L.shoulder && neck - 1.2 > y0 && neck - 1.2 < y1) ys.push(neck - 1.2);
        ys.push(y1);
        const zs = L.back ? [-bd, 0, bd] : [-bd, bd];
        const out: Box[] = [];
        for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
            const c = L.shoulder && ys[i] >= neck - 1.2 ? L.shoulder : L.back && zs[j] >= 0 ? L.back : L.fur;
            out.push(box(-bw, ys[i], zs[j], bw, ys[i + 1], zs[j + 1], c));
        }
        return out;
    };
    let bodyBoxes: Box[] = furBody(leg, neck);
    // 성인은 배 무늬를 줄이고 그 위 털에 반달무늬를 둔다 (곰)
    const crescent = stage === 'adult' && !!L.crescent;
    const belly = box(-(bw - 0.9), leg + 0.6, fz - 0.1, bw - 0.9, crescent ? neck - 2.9 : neck - 0.6, fz, L.belly, true);
    const bodyMarks: Box[] = [];
    if (crescent) {
        bodyMarks.push(box(-2.1, neck - 2.3, fz - 0.15, -1.3, neck - 1.5, fz - 0.1, WHITE, true),
            box(-1.3, neck - 2.7, fz - 0.15, 1.3, neck - 2.1, fz - 0.1, WHITE, true),
            box(1.3, neck - 2.3, fz - 0.15, 2.1, neck - 1.5, fz - 0.1, WHITE, true));
    }
    // 겉면 무늬 (옷을 입으면 가려지니 뺀다)
    const T = 0.08;
    const coat: Box[] = [];
    if (L.stripes) {
        for (let i = 0; i < 3; i++) {
            const y = leg + (neck - leg) * (0.22 + 0.26 * i);
            coat.push(box(-bw + 0.5, y, bd, bw - 0.5, y + 0.45, bd + T, L.stripes), ...both(box(-bw - T, y, -bd + 0.5, -bw, y + 0.45, bd - 0.3, L.stripes)));
        }
    }
    if (L.backStripe) coat.push(box(-0.45, leg + 0.3, bd, 0.45, neck, bd + T, L.backStripe));
    if (L.backStripe2) coat.push(...both(box(-1.4, leg + 0.6, bd, -0.85, neck, bd + T, L.backStripe2)));
    const spots = L.spots ?? [];
    if (spots[1]) coat.push(box(-bw - T, leg + 0.4, -0.4, -bw, neck - 0.8, bd - 0.3, spots[1]));
    if (spots[2]) coat.push(box(-bw + 0.3, leg + (neck - leg) * 0.45, bd, 0.6, neck - 0.3, bd + T, spots[2]));

    if (top) {
        const c = top.color, dark = shade(c, 0.8);
        const o = 0.15, sy0 = leg + (neck - leg) * 0.2;      // 옷 아랫단
        const sleeveLen = top.shape === 'hoodie' ? arm - 1.1 : Math.min(1.4, arm * 0.45);
        const sleeve = (col: string) => box(ax0 - o, ay1 - sleeveLen, -1 - o, -bw + 0.05, ay1 + o, 1 + o, col);
        if (top.shape === 'overalls') {
            const by0 = leg + (neck - leg) * 0.45;
            // 겹치는 상자는 깊이 순서가 꼬이므로, 털 몸통은 바지 위쪽만 남긴다
            bodyBoxes = furBody(by0, neck);
            bodyBoxes.push(box(-bw - o, leg - 0.05, -bd - o, bw + o, by0, bd + o, c));
            // 배 무늬는 바지 위로 그려지므로 넣지 않는다
            bodyBoxes.push(box(-1.3, by0, fz - o - 0.05, 1.3, by0 + (neck - by0) * 0.55, fz - o, c, true),
                box(-(bw - 0.5), by0, fz - o - 0.05, -(bw - 1.0), neck, fz - o, dark, true),
                box(bw - 1.0, by0, fz - o - 0.05, bw - 0.5, neck, fz - o, dark, true),
                box(-(bw - 0.85), neck - 1.3, fz - o - 0.1, -(bw - 0.65), neck - 1.1, fz - o - 0.05, GOLD, true),
                box(bw - 0.65, neck - 1.3, fz - o - 0.1, bw - 0.85, neck - 1.1, fz - o - 0.05, GOLD, true));
            legBoxes.push(box(-(bw - 0.4) - 0.1, leg * 0.5, -(bd - 0.7) - 0.1, -0.3, leg + 0.02, bd - 0.7, c));
        } else {
            bodyBoxes = furBody(leg, sy0);   // 옷 아래로 보이는 털만
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
            if (top.shape === 'stripe') {
                // 소매 끝 흰 줄
                const sl = ay1 - Math.min(1.4, arm * 0.45);
                armBoxes.push(box(ax0 - 0.15, sl - 0.4, -1.15, -bw + 0.05, sl, 1.15, WHITE));
            }
        }
    } else {
        bodyBoxes.push(belly, ...bodyMarks, ...coat);
    }

    // ── 머리 (y 7~13 기준으로 만들고 dy 만큼 옮긴다) ──
    const S = K.snout;
    const sd = S.d + (stage === 'adult' ? K.adultSnout : 0);
    const front = -3 - sd;
    const fwd = (bx: Box): Box => ({ ...bx, b: [bx.b[0], bx.b[1], bx.b[2] + front + 3.9, bx.b[3], bx.b[4], bx.b[5] + front + 3.9] });
    const nw = Math.min(0.6, S.w - 0.5);
    const headBoxes: Box[] = [
        ...(L.headTop
            ? [box(-3.5, 7, -3, 3.5, 9.6, 3, L.muzzle), box(-3.5, 9.6, -3, 3.5, 13, 3, L.headTop)]
            : [box(-3.5, 7, -3, 3.5, 13, 3, L.fur)]),
        box(-S.w, S.y0, front, S.w, S.y1, -3, L.muzzle),                       // 주둥이
        ...(K.cheeks ? both(box(-3.9, 7.2, -2.7, -3.5, 9.3, 0.3, L.muzzle)) : []),   // 볼주머니
        // 앞면 무늬 (먼저 적은 것부터 그린다)
        ...(L.eyePatch ? both(box(-2.9, 9.3, F0, -0.8, 11.8, F1, L.eyePatch, true)) : []),
        ...(spots[0] ? [box(0.7, 9.2, F0, 3.3, 12.4, F1, spots[0], true)] : []),
        ...(L.stripes ? [-1, 0, 1].map(i => box(i * 0.9 - 0.2, 11.9, F0, i * 0.9 + 0.2, 12.8, F1, L.stripes!, true)) : []),
        fwd(box(-nw, S.y1 - 0.75, M0, nw, S.y1 - 0.1, M1, L.nose, true)),     // 코
        ...mouthBoxes[expr].map(fwd),
        box(-3.2, 8.4, F0, -2.2, 9.1, F1, cheek, true),    // 볼
        box(2.2, 8.4, F0, 3.2, 9.1, F1, cheek, true),
        ...(K.whiskers ? [8.95, 8.45].flatMap(y => both(box(-3.4, y, F0, -S.w - 0.1, y + 0.12, F1, L.whisker ?? INK, true))) : []),
        ...(browBoxes[expr] ?? []).flatMap(b => both({ ...b, c: browC })),
    ];
    if (!hat) {
        // 머리 위 무늬 (모자를 쓰면 가려진다)
        if (L.stripes) headBoxes.push(...[-1.6, -0.25, 1.1].map(x => box(x, 13, -2.6, x + 0.5, 13 + T, 2.6, L.stripes!)));
        if (L.backStripe) headBoxes.push(box(-0.45, 13, -1.2, 0.45, 13 + T, 3, L.backStripe), box(-0.45, 8, 3, 0.45, 13, 3 + T, L.backStripe));
        if (spots[3]) headBoxes.push(box(0.2, 13, -1.5, 3.2, 13 + T, 2.5, spots[3]));
        // 유아는 정수리에 털이 삐죽
        if (stage === 'baby') {
            const tuft = shade(L.headTop ?? L.fur, 0.8);
            headBoxes.push(box(-0.7, 13, -1.6, 0.3, 14.5, -0.6, tuft), box(0.3, 13, -1.4, 1.0, 13.9, -0.7, tuft));
        }
    } else {
        headBoxes.push(...hatBoxes(hat.shape, hat.color));
    }

    // 유아는 눈이 크다
    const eyeScale = stage === 'baby' ? 1.3 : 1;
    const big = (bx: Box): Box => {
        const [x0, y0, z0, x1, y1, z1] = bx.b;
        const sx = (x: number) => -1.75 + (x + 1.75) * eyeScale, sy = (y: number) => 10.4 + (y - 10.4) * eyeScale;
        return { ...bx, b: [sx(x0), sy(y0), z0, sx(x1), sy(y1), z1], c: bx.c === INK ? eyeC : bx.c };
    };
    const eyeL: Part = shiftPart({ boxes: eyeBoxes[expr].map(big), pivot: [-1.75, 10.55, -3] }, dy);
    const ear = shiftPart(K.ear(L), dy);
    const legL: Part = { boxes: legBoxes, pivot: [-bw / 2, 0, 0] };
    const armL: Part = { boxes: armBoxes, pivot: [ax0 + armW / 2, ay1 - 0.2, 0] };
    const tail = K.tail(L, leg, bd, neck);

    const parts: Record<PartId, Part> = {
        legL,
        legR: mirrorPart(legL),
        body: { boxes: bodyBoxes, pivot: [0, leg, 0] },
        tail: { boxes: tail.boxes, pivot: tail.pivot },
        armL,
        armR: mirrorPart(armL),
        head: { boxes: headBoxes.map(b => shiftY(b, dy)), pivot: [0, neck, 0] },
        eyeL,
        eyeR: mirrorPart(eyeL),
        earL: ear,
        earR: mirrorPart(ear),
    };
    // 높이와 반지름은 상자들에서 잰다 (토끼 귀·다람쥐 꼬리·밀짚모자)
    let height = 0, radius = 0;
    for (const p of Object.values(parts)) for (const b of p.boxes) {
        height = Math.max(height, b.b[4]);
        for (const x of [b.b[0], b.b[3]]) for (const z of [b.b[2], b.b[5]]) radius = Math.max(radius, Math.hypot(x, z));
    }
    const m: PetModel = { parts, height, radius: Math.max(5.6, radius + 0.3), neckY: neck, hipY: leg };
    models.set(key, m);
    return m;
}
