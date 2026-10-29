// 🌲 산책하기(숲길 달리기) — 동물·성장 단계·체형별 능력 (2026-10-23 사용자 결정: 동물·단계마다 다르게, 자랄수록 좋게)
// 2026-10-29: 똥피하기는 뺐다
import type { Build, BodyStage } from '../pet/model';
import type { Species } from '../pet/species';

const STAGE_I: Record<BodyStage, number> = { baby: 0, teen: 1, adult: 2 };
const BUILD_SPEED: Record<Build, number> = { thin: 1.05, normal: 1, chubby: 0.92, fat: 0.82 };

export const STAGE_NOTE: Record<BodyStage, string> = {
    baby: '유아: 느리고 능력이 약해요',
    teen: '청소년: 조금 빠르고 잘 안 부딪혀요',
    adult: '성인: 가장 빠르고 잘 안 부딪히고 능력이 가장 세요',
};

// ── 숲길 달리기 (슈퍼펭귄처럼 기울여 방향, 눌러 점프) ──
export interface RunAbility {
    steer: number;        // 좌우로 움직이는 빠르기 배수
    jump: number;         // 공중에 떠 있는 시간 배수
    hit: number;          // 부딪히는 범위 배수
    shields: number;      // 부딪혀도 버티는 횟수 (곰)
    magnet: number;       // 사과를 끌어오는 범위 배수 (고양이)
    seed?: { every: number; dur: number };   // 해바라기씨 무적 (햄스터)
    text: string;
}

const STAGE_STEER = [0.85, 1, 1.1];
export const RUN_STAGE_HIT: Record<BodyStage, number> = { baby: 1, teen: 0.94, adult: 0.88 };

export function runAbilityOf(species: Species, stage: BodyStage, build: Build = 'normal'): RunAbility {
    const i = STAGE_I[stage];
    const base: RunAbility = { steer: STAGE_STEER[i] * (BUILD_SPEED[build] ?? 1), jump: 1, hit: RUN_STAGE_HIT[stage], shields: 0, magnet: 1, text: '' };
    switch (species) {
        case 'bear': {
            const n = [1, 1, 2][i];
            return { ...base, shields: n, text: `🛡️ 튼튼해서 ${n}번은 부딪혀도 괜찮아요` };
        }
        case 'dog': {
            const k = [1.2, 1.3, 1.4][i];
            return { ...base, steer: base.steer * k, text: `💨 옆으로 재빨리 움직여요 (+${Math.round((k - 1) * 100)}%)` };
        }
        case 'cat': {
            const k = [1.8, 2.4, 3][i];
            return { ...base, magnet: k, text: `🍎 눈이 밝아 멀리 있는 사과도 끌어와요 (×${k})` };
        }
        case 'rabbit': {
            const k = [1.25, 1.4, 1.55][i];
            return { ...base, jump: k, text: `🦘 높이 뛰어서 오래 떠 있어요 (×${k})` };
        }
        case 'squirrel': {
            const k = [0.8, 0.75, 0.68][i];
            return { ...base, hit: base.hit * k, text: `🌰 몸이 날래서 잘 안 부딪혀요 (-${Math.round((1 - k) * 100)}%)` };
        }
        case 'hamster': {
            const every = [15, 12, 10][i], dur = [3, 3, 4][i];
            return { ...base, seed: { every, dur }, text: `🌻 길 위의 해바라기씨를 먹으면 ${dur}초 무적` };
        }
    }
}
