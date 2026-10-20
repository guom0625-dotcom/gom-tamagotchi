// 펫의 행동 — 기분에 따라 혼자 돌아다니며 이것저것 하다가, 주인이 부르면 멈추고 화면(정면)을 본다.
// 배고픔·잠·아픔일 때는 돌아다니지 않고 제자리에서 숨만 쉰다.
// 여기서는 겉모습만 다룬다. 기분·상태를 정하는 규칙은 서버(또는 시험용 버튼)가 준다.
import { Animated, Easing } from 'react-native';
import type { PetAnims } from './PetView';
import type { Expr } from './bear';
import { yawToward, C } from './voxel';
import { FACE_CAMERA, YAW_STEPS, yawIndex } from './layers';
import { SLIDE_TOP, toWorld, type RoomSpec, type SceneLayout, type ToyKey } from './room';

export type Mood = 'happy' | 'normal' | 'sad' | 'angry';
export type Rest = 'hungry' | 'sleep' | 'sick';
export type PetMode = Mood | Rest;
export const isRest = (m: PetMode): m is Rest => m === 'hungry' || m === 'sleep' || m === 'sick';

export interface BrainEnv {
    layout: SceneLayout;
    setYaw: (idx: number) => void;
    setExpr: (e: Expr) => void;
    setPetDepth: (d: number) => void;               // 다른 물건과 겹칠 때 앞뒤를 정하는 값 (x + z)
    effect: (emoji: string) => void;                 // 머리 위에 잠깐 떠오르는 그림
    moveBall: (x: number, z: number, ms: number) => Promise<void>;
    poops: () => { x: number; z: number }[];
    bowlFull: () => boolean;                         // 밥그릇에 밥이 담겨 있다
    ate: () => void;                                 // 밥을 다 먹었다 (그릇을 비운다)
    toys: () => ToyKey[];                            // 방에 있는 장난감
    obstacles: () => { x: number; z: number; r: number }[];   // 그 밖에 피해 다닐 물건
    setHidden: (hidden: boolean) => void;            // 터널 속·병원에 가서 안 보일 때
    effectAt: (x: number, z: number, y: number, emoji: string) => void;   // 방 안 아무 데나 떠오르는 그림
}

class Cancelled extends Error {}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: [T, number][]): T => {
    const live = list.filter(([, w]) => w > 0);
    let r = Math.random() * live.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of live) { if ((r -= w) < 0) return v; }
    return live[0][0];
};

const native = { useNativeDriver: true };

type Act = 'wander' | 'look' | 'sniff' | 'ball' | 'bowl' | 'nap' | 'happy' | 'sigh' | 'stomp' | 'toy';

// 기분별 움직임
const MOOD: Record<Mood, {
    speed: number;            // 걷는 속도 (칸/초)
    stepMs: number;           // 걸음 한 주기
    idle: [number, number];   // 하는 일 사이 쉬는 시간
    headBase: number;         // 평소 고개 숙인 정도
    droop: number;            // 귀 처짐
    acts: Record<Act, number>;
}> = {
    happy: {
        speed: 9, stepMs: 380, idle: [600, 1800], headBase: 0, droop: 0,
        acts: { wander: 3, look: 1, sniff: 1, ball: 4, bowl: 1, nap: 0.5, happy: 3, sigh: 0, stomp: 0, toy: 5 },
    },
    normal: {
        speed: 7, stepMs: 460, idle: [1200, 3500], headBase: 0, droop: 0,
        acts: { wander: 4, look: 2, sniff: 2, ball: 2, bowl: 1, nap: 1, happy: 1, sigh: 0, stomp: 0, toy: 3 },
    },
    sad: {
        speed: 3.5, stepMs: 720, idle: [3000, 6000], headBase: 0.35, droop: 1,
        acts: { wander: 2, look: 1, sniff: 1, ball: 0, bowl: 0, nap: 1, happy: 0, sigh: 4, stomp: 0, toy: 0.5 },
    },
    angry: {
        speed: 8, stepMs: 340, idle: [1000, 2500], headBase: 0, droop: 0,
        acts: { wander: 3, look: 1, sniff: 0, ball: 2, bowl: 0, nap: 0, happy: 0, sigh: 0, stomp: 3, toy: 1 },
    },
};

const POKE_COUNT = 5, POKE_WINDOW = 10_000, POKE_ANGRY_MS = 60_000;

export class PetBrain {
    x = 15; z = 15;
    yaw = FACE_CAMERA;
    ball = { x: 17, z: 18 };
    private mode: PetMode = 'normal';
    private token = 0;
    private running = new Set<Animated.CompositeAnimation>();
    private pending = new Set<{ id: ReturnType<typeof setTimeout>; rej: (e: Error) => void }>();
    private ambient: Animated.CompositeAnimation[] = [];
    private timers: Record<string, ReturnType<typeof setTimeout>> = {};
    private eyesBusy = false;
    private disposed = false;
    private started = false;
    private taps: number[] = [];
    private pokeAngryUntil = 0;

    constructor(private a: PetAnims, private env: BrainEnv) {
        this.x = this.z = env.layout.room.size / 2;
        this.ball = { x: env.layout.room.ball.x, z: env.layout.room.ball.z };
    }

    /** 방 크기에 따른 자리들 (쿠션·밥그릇·돌아다닐 범위) */
    private get R() { return this.env.layout.room; }

    // ── 시작 / 끝 ──────────────────────────────
    start(mode: PetMode) {
        this.started = true;
        this.mode = mode;
        // 자는 시간에 앱을 열었으면 처음부터 쿠션 위에 있다
        if (mode === 'sleep') this.placeAt(this.R.cushion.x, this.R.cushion.z); else this.placeAt(this.x, this.z);
        this.env.setYaw(this.yaw);
        this.startAmbient();
        this.restart(true);
    }

    dispose() {
        this.disposed = true;
        this.interrupt();
        this.ambient.forEach(x => x.stop());
        Object.values(this.timers).forEach(clearTimeout);
    }

    /** 기분·상태가 바뀌었다 */
    setMode(mode: PetMode) {
        if (!this.started || this.disposed || mode === this.mode) return;
        this.mode = mode;
        this.restart(false);
    }

    /** 지금 보여줄 기분 (찔려서 잠깐 화난 것 포함) */
    private get current(): PetMode {
        if (!isRest(this.mode) && Date.now() < this.pokeAngryUntil) return 'angry';
        return this.mode;
    }

    private get cfg() {
        const m = this.current;
        return MOOD[isRest(m) ? 'normal' : m];
    }

    // 하던 일을 모두 멈춘다 (숨쉬기·눈 깜빡임은 계속)
    private interrupt() {
        this.token++;
        this.running.forEach(x => x.stop());
        this.running.clear();
        this.pending.forEach(p => { clearTimeout(p.id); p.rej(new Cancelled()); });
        this.pending.clear();
    }

    private restart(first: boolean) {
        this.interrupt();
        const t = this.token;
        const m = this.current;
        this.env.setExpr(m);
        void (async () => {
            try {
                if (!first) await this.stopWhereYouAre();
                // 밥이 담겨 있으면 먼저 먹는다 (자거나 아플 때는 그릇에 남겨 둔다)
                const eat = this.env.bowlFull() && m !== 'sleep' && m !== 'sick';
                if (eat) {
                    await this.settle(t);
                    await this.meal(t);
                }
                if (isRest(m)) {
                    await this.rest(m, t);
                } else {
                    if (!eat) await this.settle(t);
                    await this.live(t);
                }
            } catch (e) {
                if (!(e instanceof Cancelled)) console.warn('pet', e);
            }
        })();
    }

    // ── 기본 도구 ──────────────────────────────
    private play(anim: Animated.CompositeAnimation, t: number): Promise<void> {
        if (t !== this.token) return Promise.reject(new Cancelled());
        return new Promise((res, rej) => {
            this.running.add(anim);
            // 같은 값에 다른 움직임(눈 깜빡임 등)이 끼어들어 끝까지 못 가도, 하던 일이 끊긴 게 아니면 계속한다
            anim.start(() => {
                this.running.delete(anim);
                if (t === this.token) res(); else rej(new Cancelled());
            });
        });
    }

    private wait(ms: number, t: number): Promise<void> {
        if (t !== this.token) return Promise.reject(new Cancelled());
        return new Promise((res, rej) => {
            const p = { id: setTimeout(() => { this.pending.delete(p); res(); }, ms), rej };
            this.pending.add(p);
        });
    }

    /** 끝날 때까지 기다리지 않는 반복 움직임 (걷기 등). 하던 일이 끊기면 같이 멈춘다 */
    private loop(anim: Animated.CompositeAnimation) {
        const l = Animated.loop(anim);
        this.running.add(l);
        l.start(() => this.running.delete(l));
        return () => { l.stop(); this.running.delete(l); };
    }

    private to(v: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.quad)) {
        return Animated.timing(v, { toValue, duration, easing, ...native });
    }

    private screen(x: number, z: number): [number, number] {
        const l = this.env.layout;
        return [l.ox + (x - z) * C * l.kv, l.oy + (x + z) * 0.5 * l.kv];
    }

    private placeAt(x: number, z: number) {
        this.x = x; this.z = z;
        const [sx, sy] = this.screen(x, z);
        this.a.posX.setValue(sx);
        this.a.posY.setValue(sy);
        this.env.setPetDepth(x + z);
    }

    /** 걷던 중이면 그 자리에 멈춘다 (화면 위치에서 거꾸로 계산) */
    private async stopWhereYouAre() {
        const [sx, sy] = await Promise.all([
            new Promise<number>(r => this.a.posX.stopAnimation(r)),
            new Promise<number>(r => this.a.posY.stopAnimation(r)),
        ]);
        const l = this.env.layout;
        const d = (sx - l.ox) / (C * l.kv), s = (sy - l.oy) * 2 / l.kv;   // x - z, x + z
        this.x = (s + d) / 2; this.z = (s - d) / 2;
        this.env.setPetDepth(this.x + this.z);
        this.a.walk.setValue(0);
        this.a.shiver.setValue(0);
        this.eyesBusy = false;
    }

    /** 기분에 맞는 기본 자세로 */
    private settle(t: number) {
        const c = this.cfg;
        return this.play(Animated.parallel([
            this.to(this.a.eyes, 1, 150), this.to(this.a.sit, 0, 250), this.to(this.a.headDip, c.headBase, 250),
            this.to(this.a.headTilt, 0, 200), this.to(this.a.hop, 0, 120), this.to(this.a.droop, c.droop, 400),
            this.to(this.a.wave, 0, 200),
        ]), t);
    }

    // ── 몸짓 ──────────────────────────────────
    private async turnTo(idx: number, t: number, stepMs = 55) {
        while (this.yaw !== idx) {
            const diff = ((idx - this.yaw + YAW_STEPS * 1.5) % YAW_STEPS) - YAW_STEPS / 2;
            this.yaw = (this.yaw + (diff > 0 ? 1 : -1) + YAW_STEPS) % YAW_STEPS;
            this.env.setYaw(this.yaw);
            await this.wait(stepMs, t);
        }
    }

    private faceToward(x: number, z: number, t: number) {
        return this.turnTo(yawIndex(yawToward(x - this.x, z - this.z)), t);
    }

    private async walkTo(x: number, z: number, t: number, speed = this.cfg.speed) {
        const dist = Math.hypot(x - this.x, z - this.z);
        if (dist < 0.5) return;
        await this.faceToward(x, z, t);
        const ms = (dist / speed) * 1000;
        const stopLegs = this.loop(this.to(this.a.walk, 1, this.cfg.stepMs, Easing.linear));
        const [sx, sy] = this.screen(x, z);
        // 가는 길 중간에 앞뒤 순서를 바꾼다 (물건 앞을 지나가는지 뒤를 지나가는지)
        const mid = { id: setTimeout(() => { this.pending.delete(mid); this.env.setPetDepth(x + z); }, ms / 2), rej: () => {} };
        this.pending.add(mid);
        try {
            await this.play(Animated.parallel([
                Animated.timing(this.a.posX, { toValue: sx, duration: ms, easing: Easing.linear, ...native }),
                Animated.timing(this.a.posY, { toValue: sy, duration: ms, easing: Easing.linear, ...native }),
            ]), t);
            this.x = x; this.z = z;
        } finally {
            stopLegs();
            this.a.walk.setValue(0);
        }
    }

    private hop(height: number, t: number) {
        const h = -height * C * this.env.layout.kv;
        return this.play(Animated.sequence([
            Animated.timing(this.a.hop, { toValue: h, duration: 170, easing: Easing.out(Easing.quad), ...native }),
            Animated.timing(this.a.hop, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), ...native }),
        ]), t);
    }

    private wag(times: number, t: number, ms = 110) {
        const seq: Animated.CompositeAnimation[] = [];
        for (let i = 0; i < times; i++) seq.push(this.to(this.a.tail, 1, ms), this.to(this.a.tail, -1, ms));
        seq.push(this.to(this.a.tail, 0, ms));
        return this.play(Animated.sequence(seq), t);
    }

    private dip(times: number, ms: number, depth: number, t: number) {
        const base = this.cfg.headBase;
        const seq: Animated.CompositeAnimation[] = [];
        for (let i = 0; i < times; i++) seq.push(this.to(this.a.headDip, depth, ms), this.to(this.a.headDip, base, ms));
        return this.play(Animated.sequence(seq), t);
    }

    private shiverBurst(t: number) {
        const seq: Animated.CompositeAnimation[] = [];
        for (let i = 0; i < 6; i++) seq.push(this.to(this.a.shiver, 1, 50, Easing.linear), this.to(this.a.shiver, -1, 50, Easing.linear));
        seq.push(this.to(this.a.shiver, 0, 50));
        return this.play(Animated.sequence(seq), t);
    }

    // 소품·공·똥을 피해서 돌아다닐 곳 고르기
    private randomSpot(): [number, number] {
        const avoid = [this.R.cushion, this.R.bowl, { ...this.ball, r: 2.5 }, ...this.env.poops().map(p => ({ ...p, r: 2 })),
            ...this.env.toys().map(k => this.R.toys[k]), ...this.env.obstacles()];
        for (let i = 0; i < 20; i++) {
            const x = rand(this.R.walkMin, this.R.walkMax), z = rand(this.R.walkMin, this.R.walkMax);
            if (Math.hypot(x - this.x, z - this.z) < 5) continue;
            if (avoid.every(o => Math.hypot(x - o.x, z - o.z) > o.r + 3.5)) return [x, z];
        }
        return [15, 15];
    }

    /** (x, z) 를 보고 dist 만큼 떨어진 자리 (지금 서 있는 쪽에서 다가간다) */
    private near(x: number, z: number, dist: number): [number, number] {
        const dx = this.x - x, dz = this.z - z;
        const len = Math.hypot(dx, dz) || 1;
        const clamp = (v: number) => Math.max(this.R.walkMin - 2, Math.min(this.R.walkMax + 1, v));
        return [clamp(x + (dx / len) * dist), clamp(z + (dz / len) * dist)];
    }

    // ── 하는 일 ────────────────────────────────
    private async wander(t: number) {
        const [x, z] = this.randomSpot();
        await this.walkTo(x, z, t);
    }

    private async lookAround(t: number) {
        const base = this.yaw;
        await this.turnTo((base + 3) % YAW_STEPS, t);
        await this.play(this.to(this.a.headTilt, 1, 250), t);
        await this.wait(rand(500, 900), t);
        await this.turnTo((base - 3 + YAW_STEPS) % YAW_STEPS, t);
        await this.play(this.to(this.a.headTilt, -1, 300), t);
        await this.wait(rand(500, 900), t);
        await this.play(this.to(this.a.headTilt, 0, 250), t);
        await this.turnTo(base, t);
    }

    private async sniff(t: number) {
        await this.wander(t);
        await this.dip(3, 160, 1, t);
        await this.wait(300, t);
        await this.dip(2, 160, 1, t);
        await this.wag(2, t);
    }

    private async nap(t: number) {
        await this.walkTo(this.R.cushion.x, this.R.cushion.z, t);
        await this.turnTo((FACE_CAMERA + Math.round(rand(-2, 2)) + YAW_STEPS) % YAW_STEPS, t);
        await this.play(this.to(this.a.sit, 1, 400), t);
        this.eyesBusy = true;
        try {
            await this.play(this.to(this.a.eyes, 0, 700), t);
            const end = Date.now() + rand(7000, 11000);
            while (Date.now() < end) {
                this.env.effect('💤');
                await this.play(Animated.sequence([this.to(this.a.headDip, 0.5, 1100), this.to(this.a.headDip, this.cfg.headBase, 1100)]), t);
            }
            await this.play(this.to(this.a.eyes, 1, 200), t);
        } finally {
            this.eyesBusy = false;
        }
        await this.play(this.to(this.a.sit, 0, 300), t);
        await this.hop(1.2, t);   // 기지개
    }

    private async playBall(t: number, again = 0): Promise<void> {
        const [x, z] = this.near(this.ball.x, this.ball.z, 4);
        await this.walkTo(x, z, t);
        await this.faceToward(this.ball.x, this.ball.z, t);
        await this.wait(250, t);
        // 공을 찬 방향으로 굴린다 (방 안에서). 화나면 세게 찬다
        const dx = this.ball.x - this.x, dz = this.ball.z - this.z;
        const len = Math.hypot(dx, dz) || 1;
        const far = this.current === 'angry' ? rand(12, 18) : rand(7, 13);
        const clamp = (v: number) => Math.max(this.R.walkMin - 2, Math.min(this.R.walkMax + 1, v));
        let bx = clamp(this.ball.x + (dx / len) * far), bz = clamp(this.ball.z + (dz / len) * far);
        if (Math.hypot(bx - this.ball.x, bz - this.ball.z) < 3) [bx, bz] = this.randomSpot();
        const roll = this.env.moveBall(bx, bz, this.current === 'angry' ? 650 : 900);
        this.ball = { x: bx, z: bz };
        if (this.current === 'angry') this.env.effect('💢');
        await this.hop(1.5, t);
        await roll;
        if (t !== this.token) throw new Cancelled();
        await this.wag(3, t);
        const chase = this.current === 'happy' ? 0.7 : 0.5;
        if (again < 3 && Math.random() < chase) await this.playBall(t, again + 1);   // 한 번 더 쫓아가기
    }

    private async eatBowl(t: number) {
        const [x, z] = this.near(this.R.bowl.x, this.R.bowl.z, 4.5);
        await this.walkTo(x, z, t);
        await this.faceToward(this.R.bowl.x, this.R.bowl.z, t);
        await this.dip(5, 140, 1, t);
        await this.wait(400, t);
        await this.dip(3, 140, 1, t);
        await this.wag(2, t);
    }

    // 밥그릇에 밥을 받았을 때: 달려가서 냠냠 먹고 기뻐한다
    private async meal(t: number) {
        const [x, z] = this.near(this.R.bowl.x, this.R.bowl.z, 4.5);
        await this.walkTo(x, z, t, this.cfg.speed * 1.3);
        await this.faceToward(this.R.bowl.x, this.R.bowl.z, t);
        this.env.effect('😋');
        for (let i = 0; i < 3; i++) {
            await this.dip(3, 150, 1, t);
            await this.wait(250, t);
        }
        this.env.ate();
        await this.wait(300, t);
        await this.turnTo(FACE_CAMERA, t);
        this.env.effect('💕');
        await this.hop(2, t);
        await this.hop(2, t);
        await this.wag(3, t);
    }

    /** 밥그릇에 밥을 담았다 */
    feed() {
        if (!this.started || this.disposed) return;
        const m = this.current;
        if (m === 'sleep' || m === 'sick') return;   // 깨거나 나으면 먹는다
        this.restart(false);
    }

    private async happy(t: number) {
        await this.turnTo(FACE_CAMERA, t);
        this.env.effect(this.current === 'happy' ? '🎵' : '💕');
        await this.hop(2, t);
        await this.hop(2, t);
        await this.wag(3, t);
    }

    // 우울: 주저앉아 한숨
    private async sigh(t: number) {
        await this.play(this.to(this.a.sit, 1, 600), t);
        await this.wait(rand(800, 1500), t);
        this.env.effect('💧');
        await this.dip(1, 900, 0.9, t);
        await this.wait(rand(2500, 4500), t);
        await this.play(this.to(this.a.sit, 0, 600), t);
    }

    // 화남: 발을 쿵쿵
    private async stomp(t: number) {
        await this.turnTo((this.yaw + Math.round(rand(3, 6))) % YAW_STEPS, t);
        this.env.effect('💢');
        for (let i = 0; i < 3; i++) await this.hop(0.6, t);
        await this.wait(rand(600, 1200), t);
    }

    private async live(t: number) {
        try {
            for (;;) {
                const c = this.cfg;
                const acts: Record<Act, (t: number) => Promise<void>> = {
                    wander: this.wander.bind(this), look: this.lookAround.bind(this), sniff: this.sniff.bind(this),
                    ball: t => this.playBall(t), bowl: this.eatBowl.bind(this), nap: this.nap.bind(this),
                    happy: this.happy.bind(this), sigh: this.sigh.bind(this), stomp: this.stomp.bind(this),
                    toy: this.playToy.bind(this),
                };
                const hasToy = this.env.toys().length > 0;
                const act = pick((Object.keys(acts) as Act[]).map(k => [acts[k], k === 'toy' && !hasToy ? 0 : c.acts[k]] as [typeof acts[Act], number]));
                await act(t);
                await this.wait(rand(c.idle[0], c.idle[1]), t);
            }
        } catch (e) {
            if (e instanceof Cancelled) return;
            // 예상 못 한 오류로 멈춰 서 있지 않도록 잠시 뒤 다시 시작
            console.warn('pet brain', e);
            setTimeout(() => { if (!this.disposed && t === this.token) void this.live(t); }, 2000);
        }
    }

    // ── 배고픔·잠·아픔: 제자리에서 숨만 쉰다 ──────────
    private async rest(m: Rest, t: number) {
        if (m === 'sleep') {
            // 쿠션으로 천천히 가서 잔다
            if (Math.hypot(this.x - this.R.cushion.x, this.z - this.R.cushion.z) > 1) {
                await this.play(this.to(this.a.droop, 0.4, 300), t);
                await this.walkTo(this.R.cushion.x, this.R.cushion.z, t, 3);
                await this.turnTo((FACE_CAMERA + 1) % YAW_STEPS, t, 90);
            }
        }
        this.eyesBusy = m === 'sleep';
        await this.play(Animated.parallel([
            this.to(this.a.sit, 1, 600), this.to(this.a.eyes, 1, 200), this.to(this.a.wave, 0, 200),
            this.to(this.a.headDip, m === 'sleep' ? 0.5 : 0.4, 600), this.to(this.a.headTilt, 0, 300),
            this.to(this.a.droop, m === 'sleep' ? 0.4 : 1, 600), this.to(this.a.hop, 0, 120),
        ]), t);
        try {
            for (;;) {
                if (m === 'sleep') {
                    this.env.effect('💤');
                    await this.play(Animated.sequence([this.to(this.a.headDip, 0.75, 1300), this.to(this.a.headDip, 0.5, 1300)]), t);
                } else if (m === 'hungry') {
                    await this.wait(rand(3500, 6000), t);
                    this.env.effect('🍚');
                    if (Math.random() < 0.4) {
                        // 밥그릇 쪽을 한 번 쳐다본다
                        const back = this.yaw;
                        await this.turnTo(yawIndex(yawToward(this.R.bowl.x - this.x, this.R.bowl.z - this.z)), t, 110);
                        await this.wait(1500, t);
                        await this.turnTo(back, t, 110);
                    } else {
                        await this.dip(1, 800, 0.8, t);
                    }
                } else {
                    await this.wait(rand(3000, 5000), t);
                    this.env.effect('🤒');
                    await this.shiverBurst(t);
                }
            }
        } finally {
            this.eyesBusy = false;
        }
    }

    // ── 주인이 부른다 ──────────────────────────
    async call() {
        if (this.disposed) return;
        const m = this.mode;

        // 짧은 시간에 계속 찌르면 잠깐 화난다
        const now = Date.now();
        this.taps = [...this.taps.filter(x => now - x < POKE_WINDOW), now];
        if (!isRest(m) && this.taps.length >= POKE_COUNT && now >= this.pokeAngryUntil) {
            this.taps = [];
            this.pokeAngryUntil = now + POKE_ANGRY_MS;
            clearTimeout(this.timers.poke);
            this.timers.poke = setTimeout(() => { if (!this.disposed) this.restart(false); }, POKE_ANGRY_MS + 50);
            this.restart(false);
            this.env.effect('💢');
            return;
        }

        this.interrupt();
        const t = this.token;
        const cur = this.current;
        this.env.setExpr(cur);
        try {
            await this.stopWhereYouAre();
            if (isRest(cur)) {
                await this.restCall(cur, t);
                await this.rest(cur, t);
                return;
            }
            await this.play(Animated.parallel([
                this.to(this.a.eyes, 1, 120), this.to(this.a.sit, 0, 200), this.to(this.a.headDip, this.cfg.headBase, 150),
                this.to(this.a.headTilt, 0, 150), this.to(this.a.hop, 0, 100),
            ]), t);

            if (cur === 'angry') {
                // 쳐다보고는 "흥" 하고 돌아선다
                await this.turnTo(FACE_CAMERA, t);
                this.env.effect('💢');
                await this.hop(0.8, t);
                await this.wait(400, t);
                await this.turnTo((FACE_CAMERA + 8) % YAW_STEPS, t, 40);
                await this.hop(0.5, t);
                await this.wait(1500, t);
            } else if (cur === 'sad') {
                await this.turnTo(FACE_CAMERA, t, 100);
                this.env.effect('💧');
                await this.play(Animated.sequence([this.to(this.a.headTilt, 1, 500), this.to(this.a.headTilt, 0, 700)]), t);
                await this.wag(1, t, 250);
                await this.wait(2000, t);
            } else {
                this.env.effect('❗');
                await this.turnTo(FACE_CAMERA, t);
                await this.hop(1.6, t);
                if (cur === 'happy') await this.hop(2, t);
                this.env.effect('💕');
                await this.play(Animated.parallel([
                    Animated.sequence([
                        this.to(this.a.wave, 1, 220),
                        this.to(this.a.wave, 0.75, 160), this.to(this.a.wave, 1, 160),
                        this.to(this.a.wave, 0.75, 160), this.to(this.a.wave, 1, 160),
                        this.to(this.a.wave, 0, 240),
                    ]),
                    Animated.sequence([this.to(this.a.headTilt, 1, 300), this.to(this.a.headTilt, 0, 600)]),
                ]), t);
                await this.wag(4, t);
                await this.wait(2200, t);
            }
            await this.live(t);
        } catch (e) {
            if (!(e instanceof Cancelled)) console.warn('pet call', e);
        }
    }

    // ── 장난감 ────────────────────────────────
    private async playToy(t: number) {
        const toys = this.env.toys();
        const k = toys[Math.floor(Math.random() * toys.length)];
        if (k === 'doll') await this.playDoll(this.R.toys.doll, t);
        else if (k === 'bubbles') await this.playBubbles(this.R.toys.bubbles, t);
        else if (k === 'tunnel') await this.playTunnel(this.R.toys.tunnel, t);
        else if (k === 'slide') await this.playSlide(this.R.toys.slide, t);
    }

    // 인형: 옆에 앉아 안고 뒹군다
    private async playDoll(d: RoomSpec['toys']['doll'], t: number) {
        const [x, z] = this.near(d.x, d.z, 2.8);
        await this.walkTo(x, z, t);
        await this.faceToward(d.x, d.z, t);
        await this.play(this.to(this.a.sit, 1, 400), t);
        this.env.effect('💕');
        await this.play(Animated.parallel([
            Animated.sequence([this.to(this.a.wave, 0.7, 300), this.to(this.a.wave, 0.5, 300), this.to(this.a.wave, 0.7, 300), this.to(this.a.wave, 0, 300)]),
            Animated.sequence([this.to(this.a.headTilt, 1, 400), this.to(this.a.headTilt, -1, 600), this.to(this.a.headTilt, 1, 600), this.to(this.a.headTilt, 0, 400)]),
        ]), t);
        await this.wag(3, t);
        await this.play(this.to(this.a.sit, 0, 400), t);
    }

    // 비눗방울: 기계 앞에서 위를 보며 폴짝폴짝
    private async playBubbles(b: RoomSpec['toys']['bubbles'], t: number) {
        const [x, z] = this.near(b.x, b.z, 4.2);
        await this.walkTo(x, z, t);
        await this.faceToward(b.x, b.z, t);
        for (let i = 0; i < 4; i++) {
            this.env.effectAt(b.x + rand(-1.5, 1.5), b.z + rand(-1.5, 1.5), 5, '🫧');
            await this.play(this.to(this.a.headDip, -0.4, 200), t);
            await this.hop(1.8, t);
            await this.turnTo((this.yaw + (i % 2 ? 2 : YAW_STEPS - 2)) % YAW_STEPS, t, 40);
        }
        this.env.effect('🎵');
        await this.play(this.to(this.a.headDip, this.cfg.headBase, 200), t);
        await this.wag(3, t);
    }

    // 터널: 한쪽 입구로 들어가 반대쪽으로 나온다 (돌려 놓은 방향을 따른다. 기준 좌표로 길이 ±3)
    private async playTunnel(tn: RoomSpec['toys']['tunnel'], t: number) {
        // 가까운 쪽 입구로 들어간다
        const [ax, az] = toWorld(tn, 0, 3), [bx, bz] = toWorld(tn, 0, -3);
        const fromA = Math.hypot(this.x - ax, this.z - az) <= Math.hypot(this.x - bx, this.z - bz);
        const end = (sign: number, d: number) => toWorld(tn, 0, sign * d);
        const s = fromA ? 1 : -1;
        await this.walkTo(...end(s, 5.5), t);
        await this.walkTo(...end(s, 2.5), t);
        this.env.setHidden(true);
        try {
            await this.wait(1300, t);
            this.placeAt(...end(-s, 2.5));
        } finally {
            this.env.setHidden(false);
        }
        await this.walkTo(...end(-s, 5.5), t);
        await this.turnTo(FACE_CAMERA, t);
        this.env.effect('❗');
        await this.hop(1.5, t);
        await this.wag(3, t);
    }

    // 미끄럼틀: 사다리로 올라가 미끄러져 내려온다
    private async playSlide(sl: RoomSpec['toys']['slide'], t: number) {
        // 기준 좌표: 사다리 끝 lz -3.5, 내려오는 끝 lz +3.5 (돌려 놓은 방향을 따른다)
        const W = (lz: number) => toWorld(sl, 0, lz);
        await this.walkTo(...W(-5.5), t);
        await this.faceToward(...W(3.5), t);
        const kv = this.env.layout.kv;
        const up = (y: number) => -y * C * kv;
        this.env.setPetDepth(999);   // 미끄럼틀 위에서는 늘 앞에
        try {
            // 한 칸씩 올라간다
            const [tx, ty] = this.screen(...W(-2.7));
            const steps = 4;
            for (let i = 1; i <= steps; i++) {
                const [sx, sy] = this.screen(...W(-5.5 + (2.8 * i) / steps));
                await this.play(Animated.parallel([
                    this.to(this.a.hop, up(SLIDE_TOP * i / steps), 260),
                    this.to(this.a.posX, i === steps ? tx : sx, 260), this.to(this.a.posY, i === steps ? ty : sy, 260),
                    Animated.sequence([this.to(this.a.walk, 0.5, 130), this.to(this.a.walk, 0, 130)]),
                ]), t);
            }
            await this.turnTo(FACE_CAMERA, t);
            this.env.effect('🎵');
            await this.wait(400, t);
            await this.faceToward(...W(13.5), t);
            // 쭈욱
            const [ex, ey] = this.screen(...W(4));
            await this.play(Animated.parallel([
                Animated.timing(this.a.posX, { toValue: ex, duration: 650, easing: Easing.in(Easing.quad), ...native }),
                Animated.timing(this.a.posY, { toValue: ey, duration: 650, easing: Easing.in(Easing.quad), ...native }),
                Animated.timing(this.a.hop, { toValue: 0, duration: 650, easing: Easing.in(Easing.quad), ...native }),
                this.to(this.a.wave, 1, 300),
            ]), t);
        } finally {
            this.a.hop.setValue(0);
            this.placeAt(...W(4));
        }
        await this.play(this.to(this.a.wave, 0, 200), t);
        await this.hop(1.2, t);
        await this.wag(4, t);
    }

    // ── 간식·약·병원 (버튼으로) ─────────────────
    /** 간식을 받았다: 쳐다보고 냠냠 */
    async snack(emoji: string) {
        await this.react(async t => {
            await this.turnTo(FACE_CAMERA, t);
            this.env.effect(emoji);
            await this.dip(3, 160, 0.8, t);
            this.env.effect('😋');
            await this.hop(1.8, t);
            await this.wag(3, t);
        });
    }

    /** 약을 먹었다 */
    async medicine() {
        await this.react(async t => {
            await this.turnTo(FACE_CAMERA, t);
            this.env.effect('💊');
            await this.dip(2, 200, 0.7, t);
            await this.wait(500, t);
        });
    }

    /** 병원에 다녀온다: 잠깐 방을 비웠다가 돌아온다 */
    async hospital() {
        await this.react(async t => {
            this.env.effect('🚑');
            await this.wait(500, t);
            this.env.setHidden(true);
            try {
                await this.wait(3500, t);
            } finally {
                this.env.setHidden(false);
            }
            await this.turnTo(FACE_CAMERA, t);
            this.env.effect('🩹');
            await this.wait(800, t);
        });
    }

    /** 하던 일을 멈추고 fn 을 한 뒤, 지금 기분·상태대로 다시 산다 */
    private async react(fn: (t: number) => Promise<void>) {
        if (!this.started || this.disposed) return;
        this.interrupt();
        const t = this.token;
        try {
            await this.stopWhereYouAre();
            await this.play(Animated.parallel([
                this.to(this.a.eyes, 1, 120), this.to(this.a.sit, 0, 200), this.to(this.a.hop, 0, 100), this.to(this.a.wave, 0, 150),
            ]), t);
            await fn(t);
            const cur = this.current;
            this.env.setExpr(cur);
            if (isRest(cur)) await this.rest(cur, t); else await this.live(t);
        } catch (e) {
            if (!(e instanceof Cancelled)) console.warn('pet react', e);
        }
    }

    // ── 쓰다듬기 ───────────────────────────────
    /** 쓰다듬어 줬다: 쳐다보고 눈웃음, 하트 */
    async pat() {
        if (!this.started || this.disposed) return;
        this.interrupt();
        const t = this.token;
        const cur = this.current;
        try {
            await this.stopWhereYouAre();
            if (isRest(cur)) {
                // 자거나 아프거나 배고프면 하트만 띄우고 하던 대로
                this.env.effect('💕');
                await this.restCall(cur, t);
                await this.rest(cur, t);
                return;
            }
            this.env.setExpr('happy');
            await this.play(Animated.parallel([
                this.to(this.a.eyes, 1, 120), this.to(this.a.sit, 0, 200), this.to(this.a.headDip, 0, 150), this.to(this.a.hop, 0, 100),
            ]), t);
            await this.turnTo(FACE_CAMERA, t);
            this.env.effect('💕');
            await this.play(Animated.sequence([
                this.to(this.a.headTilt, 1, 350), this.to(this.a.headTilt, -0.6, 500), this.to(this.a.headTilt, 1, 500), this.to(this.a.headTilt, 0, 400),
            ]), t);
            this.env.effect('💕');
            await this.hop(1.5, t);
            await this.wag(4, t);
            await this.wait(1200, t);
            this.env.setExpr(this.current);
            await this.live(t);
        } catch (e) {
            if (!(e instanceof Cancelled)) console.warn('pet pat', e);
        }
    }

    // 배고픔·잠·아픔일 때 부르면
    private async restCall(m: Rest, t: number) {
        if (m === 'sleep') {
            // 깨지 않고 뒤척이기만
            const back = this.yaw;
            await this.turnTo((back + 2) % YAW_STEPS, t, 150);
            await this.play(Animated.sequence([this.to(this.a.earL, 1, 90), this.to(this.a.earL, 0, 120)]), t);
            await this.wait(700, t);
            await this.turnTo(back, t, 150);
            return;
        }
        await this.turnTo(FACE_CAMERA, t, 110);
        this.env.effect(m === 'hungry' ? '🍚' : '🤒');
        await this.play(Animated.sequence([this.to(this.a.headTilt, 1, 500), this.to(this.a.headTilt, 0, 700)]), t);
        await this.wait(1200, t);
    }

    // ── 늘 하는 것: 숨쉬기, 눈 깜빡임, 귀 움찔 ──────────
    private startAmbient() {
        const breath = Animated.loop(Animated.sequence([
            this.to(this.a.breath, 1, 1100, Easing.inOut(Easing.sin)),
            this.to(this.a.breath, 0, 1300, Easing.inOut(Easing.sin)),
        ]));
        breath.start();
        this.ambient.push(breath);

        const blink = () => {
            if (this.disposed) return;
            if (!this.eyesBusy) {
                Animated.sequence([this.to(this.a.eyes, 0, 70), this.to(this.a.eyes, 1, 90)]).start();
            }
            this.timers.blink = setTimeout(blink, rand(1800, 4500));
        };
        this.timers.blink = setTimeout(blink, 1500);

        const ear = () => {
            if (this.disposed) return;
            if (this.current !== 'sleep') {
                const v = Math.random() < 0.5 ? this.a.earL : this.a.earR;
                Animated.sequence([this.to(v, 1, 80), this.to(v, -0.3, 80), this.to(v, 0, 110)]).start();
            }
            this.timers.ear = setTimeout(ear, rand(4000, 9000));
        };
        this.timers.ear = setTimeout(ear, 3000);
    }
}
