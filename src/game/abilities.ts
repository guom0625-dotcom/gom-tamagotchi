// 똥피하기 게임 — 동물·성장 단계·체형별 능력 (2026-10-23 사용자 결정: 동물·단계마다 다르게, 자랄수록 좋게)
import type { Build, BodyStage } from '../pet/model';
import type { Species } from '../pet/species';

export interface Ability {
    speed: number;        // 걷는 속도 배수 (1 = 화면 너비의 55%/초)
    hit: number;          // 맞는 범위 배수 (작을수록 잘 안 맞는다)
    shields: number;      // 똥을 버티는 횟수 (곰)
    dash?: { cool: number; dist: number };          // 순간 대시 (고양이): 재사용 대기(초), 거리(화면 너비 배수)
    slow?: { cool: number; dur: number; k: number }; // 똥이 느려진다 (토끼): 대기·지속(초)·속도 배수
    seed?: { every: number; dur: number };          // 해바라기씨를 먹으면 무적 (햄스터): 나오는 간격·무적 시간(초)
    /** 고르는 화면에 보일 설명 */
    text: string;
    /** 능력 버튼 이름 (누르는 능력만) */
    button?: string;
}

const STAGE_I: Record<BodyStage, number> = { baby: 0, teen: 1, adult: 2 };
const STAGE_SPEED = [0.85, 1, 1.1];
const BUILD_SPEED: Record<Build, number> = { thin: 1.05, normal: 1, chubby: 0.92, fat: 0.82 };

export function abilityOf(species: Species, stage: BodyStage, build: Build = 'normal'): Ability {
    const i = STAGE_I[stage];
    const base: Ability = { speed: STAGE_SPEED[i] * (BUILD_SPEED[build] ?? 1), hit: 1, shields: 0, text: '' };
    switch (species) {
        case 'bear': {
            const n = [1, 1, 2][i];
            return { ...base, shields: n, text: `🛡️ 튼튼해서 똥을 ${n}번 버텨요` };
        }
        case 'dog': {
            const k = [1.2, 1.3, 1.4][i];
            return { ...base, speed: base.speed * k, text: `💨 발이 빨라요 (+${Math.round((k - 1) * 100)}%)` };
        }
        case 'cat': {
            const cool = [4, 3, 2][i];
            return { ...base, dash: { cool, dist: 0.28 }, button: '⚡ 대시', text: `⚡ 버튼을 누르면 휙 피해요 (${cool}초마다)` };
        }
        case 'rabbit': {
            const cool = [10, 8, 6][i];
            return { ...base, slow: { cool, dur: 2.5, k: 0.35 }, button: '👂 느리게', text: `👂 귀가 밝아 잠깐 똥이 느려져요 (${cool}초마다)` };
        }
        case 'squirrel': {
            const hit = [0.8, 0.75, 0.68][i];
            return { ...base, hit, text: `🌰 몸이 날래서 잘 안 맞아요 (-${Math.round((1 - hit) * 100)}%)` };
        }
        case 'hamster': {
            const every = [12, 10, 8][i], dur = [3, 3, 4][i];
            return { ...base, seed: { every, dur }, text: `🌻 해바라기씨를 먹으면 ${dur}초 무적 (${every}초마다 떨어져요)` };
        }
    }
}

export const STAGE_NOTE: Record<BodyStage, string> = {
    baby: '유아: 작지만 느리고 능력이 약해요',
    teen: '청소년: 보통이에요',
    adult: '성인: 빠르고 능력이 가장 세요',
};
