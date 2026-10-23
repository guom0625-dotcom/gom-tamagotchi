// 서버 GET /pet (그리고 모든 POST /pet/*) 응답 모양
import type { Poop, Stage } from './PetScene';
import type { Mood } from './brain';
import type { Build } from './model';

export type Cond = 'feed' | 'pat' | 'clean' | 'room';
export interface GrowCond { key: Cond; have: number; need: number; missed: number }

export interface PetInfo {
    id: string;
    species: string | null;      // 알이면 아직 모른다 (깨어날 때 정해진다)
    variant: number;             // 털색·무늬 번호 (species.ts 의 looks)
    name: string | null;
    stage: Stage;
    gone: { reason: 'hunger' | 'sick' | null } | null;
    mood: Mood | 'hungry' | 'sick';
    fed_today: boolean;
    auto_fed_today: boolean;
    patted_today: boolean;
    fullness: number;            // 0~3
    /** 체형 (알이면 null, 옛 서버는 안 보낸다). 간식을 많이 먹으면 통통·뚱뚱, 굶으면 홀쭉 */
    build?: Build | null;
    /** 시험 계정만: 체형 점수 (최근 7일, 4 이하 홀쭉 · 8 이하 보통 · 11 이하 통통) */
    build_score?: number;
    poops: Poop[];
    next_change_at: number | null;
    /** 최근 하루 동안 자동 청소기가 치운 똥 (at = 치운 시각) */
    robot_cleaned: { id: string; u: number; v: number; at: number }[];
    health: {
        severe: boolean;
        hungry: boolean;         // 밥도 먹어야 낫는다
        dirty: boolean;          // 똥도 치워야 낫는다
        med_given: boolean;
        hospital_visits: number;
        hospital_needed: number;
        visited_today: boolean;
        leave_at: number;
    } | null;
    snacks_today: number;
    snacks_per_day: number;
    helper_ready: boolean;
    /** 시험 계정만 conds 가 온다. 아이에게는 준비됐는지와 방이 좁은지만 */
    /** 입은 옷 'top_tee_red' / 'hat_cap_blue' */
    wear: { top: string | null; hat: string | null };
    growth: { next: Stage | null; ready: boolean; conds: GrowCond[]; room_short?: boolean };
}

/** 도감에 남은 졸업한 펫 */
export interface DexPet { id?: string; species: string; variant: number; name: string | null; at: number }

/** 미니게임 똥피하기 — GET /pet/game, POST /pet/game/start·end */
export interface GameBoardRow { student: string; score_ms: number; species: string; variant: number; stage: string; pet: string | null; me: boolean }
export interface GameInfo {
    /** 오늘 남은 무료 판 */
    plays_left: number; plays_per_day: number;
    /** 무료 판을 다 쓴 뒤 한 판 값 (옛 서버는 안 보낸다) */
    price?: number; topaz?: number;
    best: number | null; rank: number | null; players: number;
    top: GameBoardRow[];
}

export interface PetResponse {
    pet: PetInfo;
    room: { level: number; max: number; next_price: number | null; slots: number; used: number;
        /** 방 말고 다른 성장 조건을 다 채워서 방을 넓힐 수 있다 */
        can_upgrade: boolean };
    items: { key: string; placed: boolean }[];
    /** 도감 (옛 서버는 안 보낸다). total = 모을 수 있는 종류·무늬 가짓수 */
    dex?: { pets: DexPet[]; total: number };
    decor: { wallpaper: string | null; cushion: string | null };
    /** 꾸미기로 정한 물건 자리 (없는 물건은 기본 자리) */
    layout: Record<string, { x: number; z: number; rot: number }>;
    shop: {
        snacks: Record<string, { price: number; hours: number }>;
        toys: Record<string, number>;
        decor: Record<string, number>;
        gadgets: Record<string, number>;
        medicine: number; hospital: number; helper: number; new_egg: number; feed: number;
        /** 지금 크기의 옷값 (알이면 유아 크기 값) */
        clothes: { tops: Record<string, number>; hats: Record<string, number>; colors: string[] };
    };
    tester: boolean;
    diamonds: number;
    topaz: number;
}
