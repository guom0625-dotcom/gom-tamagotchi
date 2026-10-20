// 서버 GET /pet (그리고 모든 POST /pet/*) 응답 모양
import type { Poop, Stage } from './PetScene';
import type { Mood } from './brain';

export type Cond = 'feed' | 'pat' | 'clean' | 'room';
export interface GrowCond { key: Cond; have: number; need: number; missed: number }

export interface PetInfo {
    id: string;
    species: string | null;      // 알이면 아직 모른다 (깨어날 때 정해진다)
    name: string | null;
    stage: Stage;
    gone: { reason: 'hunger' | 'sick' | null } | null;
    mood: Mood | 'hungry' | 'sick';
    fed_today: boolean;
    auto_fed_today: boolean;
    patted_today: boolean;
    fullness: number;            // 0~3
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

export interface PetResponse {
    pet: PetInfo;
    room: { level: number; max: number; next_price: number | null; slots: number; used: number };
    items: { key: string; placed: boolean }[];
    decor: { wallpaper: string | null; cushion: string | null };
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
