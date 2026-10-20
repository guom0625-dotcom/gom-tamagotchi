// 펫 종류 6가지와 종류마다 여러 가지 털색·무늬.
// 모양(귀·꼬리·주둥이·몸 비율)은 종류가 정하고, 색과 무늬는 변종(variant)이 정한다.
// 서버는 알이 깨어날 때 종류와 변종 번호를 무작위로 고른다 (server/src/routes/pet.ts 의 VARIANTS 개수와 맞출 것).
import type { Box } from './voxel';

export type Species = 'bear' | 'dog' | 'cat' | 'rabbit' | 'squirrel' | 'hamster';

/** 털색과 무늬 */
export interface Look {
    name: string;        // '치즈', '바둑이' …
    fur: string;
    paw: string;         // 발바닥·손끝
    belly: string;       // 배 무늬
    muzzle: string;      // 주둥이
    nose: string;
    earIn: string;
    ear?: string;        // 귀 바깥 (없으면 털색)
    limb?: string;       // 팔다리 (판다)
    eye?: string;        // 눈동자 (어두운 얼굴이면 밝은 눈)
    headTop?: string;    // 머리 위쪽 절반 (아래쪽은 muzzle 색) — 턱시도·시바·햄스터
    shoulder?: string;   // 몸 위쪽 띠 (판다)
    back?: string;       // 몸 뒤쪽 절반
    eyePatch?: string;   // 눈 둘레 (판다)
    stripes?: string;    // 줄무늬 (고등어·치즈 고양이)
    backStripe?: string; // 등줄기 한 줄 (햄스터·다람쥐)
    backStripe2?: string; // 등줄기 옆 두 줄 (다람쥐 크림색)
    spots?: string[];    // 얼룩 (바둑이·삼색·얼룩 토끼). 정해진 자리에 차례로
    tail?: string;       // 꼬리 색 (없으면 털색)
    tailTip?: string;
    crescent?: boolean;  // 성인 가슴 반달무늬 (곰)
    whisker?: string;    // 수염 색
}

export interface Kind {
    /** 왼쪽 귀 상자들 (머리 y 7~13, x ±3.5, z ±3 기준). 오른쪽은 뒤집는다 */
    ear: (L: Look) => { boxes: Box[]; pivot: [number, number, number] };
    /** 꼬리 (엉덩이 높이 leg, 등 bd, 목 높이 neck 기준) */
    tail: (L: Look, leg: number, bd: number, neck: number) => { boxes: Box[]; pivot: [number, number, number] };
    /** 주둥이: 반폭, 아래·위 y, 앞으로 나온 길이 */
    snout: { w: number; y0: number; y1: number; d: number };
    /** 성인이 되면 주둥이가 더 나오는 길이 */
    adultSnout: number;
    /** 몸 비율 (폭·두께·다리 길이) */
    body?: { bw?: number; bd?: number; leg?: number };
    /** 볼주머니 (햄스터) */
    cheeks?: boolean;
    whiskers?: boolean;
    looks: Look[];
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string, decal = false): Box =>
    ({ b: [x0, y0, z0, x1, y1, z1], c, decal });

const PINK_IN = '#F2B4C4';
const INK = '#2A2420';

export const KINDS: Record<Species, Kind> = {
    bear: {
        ear: L => ({
            boxes: [box(-3.7, 13, -0.8, -1.9, 14.9, 0.8, L.ear ?? L.fur), box(-3.3, 13.3, -0.9, -2.3, 14.5, -0.8, L.earIn, true)],
            pivot: [-2.8, 13, 0],
        }),
        tail: (L, leg, bd) => ({ boxes: [box(-0.7, leg + 0.6, bd, 0.7, leg + 1.9, bd + 1, L.tail ?? L.belly)], pivot: [0, leg + 1.2, bd] }),
        snout: { w: 1.5, y0: 7.4, y1: 9.6, d: 0.9 },
        adultSnout: 0.6,
        looks: [
            { name: '갈색곰', fur: '#A8754A', paw: '#8A5D38', belly: '#E8C79F', muzzle: '#E8C79F', nose: INK, earIn: '#E3A089', crescent: true },
            { name: '반달곰', fur: '#3B3433', paw: '#2A2423', belly: '#5A504D', muzzle: '#C9A27E', nose: INK, earIn: '#5A4A48', eye: '#F7E7C6', crescent: true },
            { name: '백곰', fur: '#F2EEE6', paw: '#D9D2C6', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: INK, earIn: '#E9C9C4' },
            {
                name: '판다', fur: '#F4F2EE', paw: '#2E2B2B', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: INK, earIn: '#2E2B2B',
                ear: '#2E2B2B', limb: '#2E2B2B', shoulder: '#2E2B2B', eyePatch: '#3A3636', tail: '#F4F2EE',
            },
        ],
    },
    dog: {
        // 축 처진 귀: 머리 옆으로 늘어진다
        ear: L => ({
            boxes: [box(-4.3, 8.2, -1.2, -3.5, 13.0, 1.4, L.ear ?? L.fur), box(-3.9, 13.0, -1.2, -2.1, 13.5, 1.4, L.ear ?? L.fur)],
            pivot: [-3.4, 13.2, 0],
        }),
        // 위로 말린 꼬리
        tail: (L, leg, bd) => ({
            boxes: [box(-0.5, leg + 1.6, bd, 0.5, leg + 2.4, bd + 1.6, L.tail ?? L.fur), box(-0.5, leg + 2.4, bd + 1.0, 0.5, leg + 3.6, bd + 1.8, L.tailTip ?? L.tail ?? L.fur)],
            pivot: [0, leg + 2, bd],
        }),
        snout: { w: 1.4, y0: 7.3, y1: 9.5, d: 1.4 },
        adultSnout: 0.6,
        looks: [
            { name: '골든', fur: '#E2B270', paw: '#C4935A', belly: '#F6E3C3', muzzle: '#F3DDB8', nose: INK, earIn: '#C4935A', ear: '#C98E4F' },
            { name: '흰둥이', fur: '#F5F1EA', paw: '#E0D8CC', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: INK, earIn: '#E7D2C8', ear: '#EDE5D8' },
            { name: '바둑이', fur: '#F5F1EA', paw: '#E0D8CC', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: INK, earIn: '#3A3433', ear: '#3A3433', spots: ['#3A3433', '#3A3433', '#3A3433', '#3A3433'] },
            { name: '시바', fur: '#D98C45', paw: '#F3E3CC', belly: '#F7EBD8', muzzle: '#F7EBD8', nose: INK, earIn: '#F3E3CC', headTop: '#D98C45', tailTip: '#F7EBD8' },
            { name: '초코', fur: '#6E4A33', paw: '#55382A', belly: '#9A7457', muzzle: '#8C6A50', nose: INK, earIn: '#55382A', ear: '#5A3B29', eye: '#F2E1C2' },
        ],
    },
    cat: {
        // 뾰족한 세모 귀 (층층이 좁아진다)
        ear: L => {
            const c = L.ear ?? L.fur;
            return {
                boxes: [box(-3.5, 13, -0.7, -1.7, 14.0, 0.7, c), box(-3.2, 14.0, -0.6, -2.1, 14.8, 0.6, c), box(-2.9, 14.8, -0.45, -2.5, 15.4, 0.45, c),
                    box(-3.1, 13.2, -0.75, -2.1, 14.2, -0.7, L.earIn, true)],
                pivot: [-2.6, 13, 0],
            };
        },
        // 길게 위로 선 꼬리
        tail: (L, leg, bd) => ({
            boxes: [box(-0.4, leg + 0.6, bd, 0.4, leg + 1.2, bd + 2.2, L.tail ?? L.fur), box(-0.4, leg + 1.2, bd + 1.6, 0.4, leg + 4.2, bd + 2.4, L.tail ?? L.fur),
                box(-0.4, leg + 4.2, bd + 1.6, 0.4, leg + 5.0, bd + 2.4, L.tailTip ?? L.tail ?? L.fur)],
            pivot: [0, leg + 0.9, bd],
        }),
        snout: { w: 1.2, y0: 7.6, y1: 9.4, d: 0.5 },
        adultSnout: 0.2,
        whiskers: true,
        looks: [
            { name: '치즈', fur: '#F0A65A', paw: '#F7D9B5', belly: '#FBE6CC', muzzle: '#FBE6CC', nose: '#E58A8A', earIn: PINK_IN, stripes: '#D27A33', tail: '#F0A65A', tailTip: '#D27A33', whisker: '#FFFFFF' },
            { name: '고등어', fur: '#9A9A98', paw: '#E9E6E0', belly: '#E9E6E0', muzzle: '#E9E6E0', nose: '#D98C8C', earIn: PINK_IN, stripes: '#56565A', tailTip: '#56565A', eye: '#B8D46A', whisker: '#FFFFFF' },
            { name: '턱시도', fur: '#2F2C2E', paw: '#F7F4EE', belly: '#F7F4EE', muzzle: '#F7F4EE', nose: '#E58A8A', earIn: '#C98A8A', headTop: '#2F2C2E', eye: '#E6CB4A', whisker: '#FFFFFF' },
            { name: '삼색', fur: '#F7F4EE', paw: '#EDE7DE', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: '#E58A8A', earIn: PINK_IN, ear: '#E39A4E', spots: ['#E39A4E', '#2F2C2E', '#E39A4E', '#2F2C2E'], tail: '#2F2C2E', whisker: '#B8AFA4' },
            { name: '흰 고양이', fur: '#F7F4EE', paw: '#EDE7DE', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: '#E58A8A', earIn: PINK_IN, eye: '#6FA8DC', whisker: '#C8C0B4' },
        ],
    },
    rabbit: {
        // 긴 귀
        ear: L => ({
            boxes: [box(-2.9, 13, -0.7, -1.5, 18.5, 0.7, L.ear ?? L.fur), box(-2.6, 13.6, -0.75, -1.8, 18.0, -0.7, L.earIn, true)],
            pivot: [-2.2, 13, 0],
        }),
        // 동그란 솜꼬리
        tail: (L, leg, bd) => ({ boxes: [box(-0.9, leg + 0.5, bd, 0.9, leg + 2.0, bd + 1.2, L.tail ?? '#FFFFFF')], pivot: [0, leg + 1.2, bd] }),
        snout: { w: 1.2, y0: 7.6, y1: 9.4, d: 0.6 },
        adultSnout: 0.2,
        looks: [
            { name: '흰토끼', fur: '#F5F1EA', paw: '#E6DED2', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: '#EC9AAE', earIn: PINK_IN, eye: '#C9485B' },
            { name: '회색 토끼', fur: '#A9A4A0', paw: '#8E8984', belly: '#E4E0DA', muzzle: '#E4E0DA', nose: '#D98C9C', earIn: '#D9B3BA' },
            { name: '갈색 토끼', fur: '#B58A62', paw: '#9A7250', belly: '#EBD8C0', muzzle: '#EBD8C0', nose: '#D98C9C', earIn: '#E2B4A8' },
            { name: '얼룩 토끼', fur: '#F5F1EA', paw: '#E6DED2', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: '#EC9AAE', earIn: PINK_IN, ear: '#7A5A44', spots: ['#7A5A44', '#7A5A44', '#7A5A44'] },
        ],
    },
    squirrel: {
        // 작고 뾰족한 귀 + 끝에 털
        ear: L => ({
            boxes: [box(-3.3, 13, -0.6, -2.1, 14.2, 0.6, L.ear ?? L.fur), box(-3.0, 14.2, -0.4, -2.4, 15.1, 0.4, L.tailTip ?? L.paw),
                box(-3.0, 13.2, -0.65, -2.4, 13.9, -0.6, L.earIn, true)],
            pivot: [-2.7, 13, 0],
        }),
        // 등 뒤로 머리 위까지 말려 올라간 큰 복슬꼬리 (앞에서 봐도 머리 뒤로 보인다)
        tail: (L, leg, bd, neck) => {
            const c = L.tail ?? L.fur, tip = L.tailTip ?? c;
            return {
                boxes: [box(-1.4, leg + 0.2, bd, 1.4, leg + 2.2, bd + 2.6, c), box(-1.8, leg + 2.2, bd + 1.4, 1.8, neck + 5.6, bd + 4.2, c),
                    box(-1.6, neck + 5.6, bd + 0.6, 1.6, neck + 7.4, bd + 3.8, tip)],
                pivot: [0, leg + 1, bd],
            };
        },
        snout: { w: 1.3, y0: 7.5, y1: 9.4, d: 0.9 },
        adultSnout: 0.3,
        body: { bw: 0.88, bd: 0.92 },
        looks: [
            { name: '다람쥐', fur: '#C9773A', paw: '#9C5A2A', belly: '#F3DDB8', muzzle: '#F3DDB8', nose: INK, earIn: '#E8B48C', backStripe: '#4E3020', backStripe2: '#F3DDB8', tail: '#B5652C', tailTip: '#8E4C20' },
            { name: '청설모', fur: '#5E544E', paw: '#3E3632', belly: '#D9D3CC', muzzle: '#B8AEA6', nose: INK, earIn: '#8A7E76', tail: '#4A413C', tailTip: '#2E2825', eye: '#F2E1C2' },
        ],
    },
    hamster: {
        // 작고 동그란 귀
        ear: L => ({
            boxes: [box(-3.4, 13, -0.6, -2.1, 13.9, 0.6, L.ear ?? L.fur), box(-3.1, 13.2, -0.65, -2.4, 13.7, -0.6, L.earIn, true)],
            pivot: [-2.75, 13, 0],
        }),
        // 꼬리는 거의 없다
        tail: (L, leg, bd) => ({ boxes: [box(-0.3, leg + 0.4, bd, 0.3, leg + 0.9, bd + 0.4, L.tail ?? L.fur)], pivot: [0, leg + 0.6, bd] }),
        snout: { w: 1.1, y0: 7.5, y1: 9.2, d: 0.4 },
        adultSnout: 0.1,
        body: { bw: 1.18, bd: 1.12, leg: 0.5 },
        cheeks: true,
        looks: [
            { name: '골든 햄스터', fur: '#E9B46A', paw: '#F2C9C0', belly: '#FAF3E6', muzzle: '#FAF3E6', nose: '#E58A9A', earIn: '#F2B8B0', headTop: '#E9B46A' },
            { name: '정글리안', fur: '#A9A39C', paw: '#F2C9C0', belly: '#FAF6F0', muzzle: '#FAF6F0', nose: '#E58A9A', earIn: '#E2B8B0', headTop: '#A9A39C', backStripe: '#4A4440' },
            { name: '펄 햄스터', fur: '#F7F2E8', paw: '#F2C9C0', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: '#E58A9A', earIn: '#F2B8B0', backStripe: '#D8CFC2' },
            { name: '판다 햄스터', fur: '#F7F4EE', paw: '#F2C9C0', belly: '#FFFFFF', muzzle: '#FFFFFF', nose: '#E58A9A', earIn: '#3A3636', ear: '#3A3636', back: '#3A3636', eyePatch: '#3A3636' },
        ],
    },
};

export const SPECIES: Species[] = ['bear', 'dog', 'cat', 'rabbit', 'squirrel', 'hamster'];
export const isSpecies = (s: string | null | undefined): s is Species => !!s && s in KINDS;
/** 종류와 변종 번호 → 털색·무늬 (모르는 번호면 첫 번째) */
export const lookOf = (s: Species, v: number | null | undefined) => KINDS[s].looks[v ?? 0] ?? KINDS[s].looks[0];

export const SPECIES_NAME: Record<Species, string> = {
    bear: '곰', dog: '강아지', cat: '고양이', rabbit: '토끼', squirrel: '다람쥐', hamster: '햄스터',
};
/** 화면에 보일 이름: '치즈 고양이', '바둑이', '판다', '정글리안 햄스터' */
export function lookTitle(s: Species, v: number | null | undefined): string {
    const name = lookOf(s, v).name;
    const kind = SPECIES_NAME[s];
    // 이름만으로 무슨 동물인지 알 수 있으면 그대로
    if (name.endsWith(kind) || name === '판다' || name === '청설모') return name;
    return `${name} ${kind}`;
}
