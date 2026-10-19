// 펫의 행동 — 혼자 돌아다니며 이것저것 하다가, 주인이 부르면 멈추고 화면(정면)을 본다.
// 게임 규칙(배부름·성장)과는 상관없는 겉모습만의 움직임이다.
import { Animated, Easing } from 'react-native';
import type { PetAnims } from './PetView';
import { yawToward, C } from './voxel';
import { FACE_CAMERA, YAW_STEPS, yawIndex } from './layers';
import { BOWL, CUSHION, WALK_MAX, WALK_MIN, type SceneLayout } from './room';

export interface BrainEnv {
    layout: SceneLayout;
    setYaw: (idx: number) => void;
    setPetDepth: (d: number) => void;               // 다른 물건과 겹칠 때 앞뒤를 정하는 값 (x + z)
    effect: (emoji: string) => void;                 // 머리 위에 잠깐 떠오르는 그림
    moveBall: (x: number, z: number, ms: number) => Promise<void>;
}

class Cancelled extends Error {}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: [T, number][]): T => {
    let r = Math.random() * list.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of list) { if ((r -= w) < 0) return v; }
    return list[0][0];
};

const WALK_SPEED = 7;   // 칸/초
const native = { useNativeDriver: true };

export class PetBrain {
    x = 15; z = 15;
    yaw = FACE_CAMERA;
    ball = { x: 17, z: 18 };
    private token = 0;
    private running = new Set<Animated.CompositeAnimation>();
    private pending = new Set<{ id: ReturnType<typeof setTimeout>; rej: (e: Error) => void }>();
    private ambient: Animated.CompositeAnimation[] = [];
    private ambientTimers: Record<string, ReturnType<typeof setTimeout>> = {};
    private eyesBusy = false;
    private disposed = false;

    constructor(private a: PetAnims, private env: BrainEnv) {}

    // ── 시작 / 끝 ──────────────────────────────
    start() {
        this.placeAt(this.x, this.z);
        this.env.setYaw(this.yaw);
        this.startAmbient();
        void this.live(this.token);
    }

    dispose() {
        this.disposed = true;
        this.interrupt();
        this.ambient.forEach(x => x.stop());
        Object.values(this.ambientTimers).forEach(clearTimeout);
    }

    // 하던 일을 모두 멈춘다 (숨쉬기·눈 깜빡임은 계속)
    private interrupt() {
        this.token++;
        this.running.forEach(x => x.stop());
        this.running.clear();
        this.pending.forEach(p => { clearTimeout(p.id); p.rej(new Cancelled()); });
        this.pending.clear();
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

    // ── 몸짓 ──────────────────────────────────
    private async turnTo(idx: number, t: number) {
        while (this.yaw !== idx) {
            const diff = ((idx - this.yaw + YAW_STEPS * 1.5) % YAW_STEPS) - YAW_STEPS / 2;
            this.yaw = (this.yaw + (diff > 0 ? 1 : -1) + YAW_STEPS) % YAW_STEPS;
            this.env.setYaw(this.yaw);
            await this.wait(55, t);
        }
    }

    private faceToward(x: number, z: number, t: number) {
        return this.turnTo(yawIndex(yawToward(x - this.x, z - this.z)), t);
    }

    private async walkTo(x: number, z: number, t: number) {
        const dist = Math.hypot(x - this.x, z - this.z);
        if (dist < 0.5) return;
        await this.faceToward(x, z, t);
        const ms = (dist / WALK_SPEED) * 1000;
        const stopLegs = this.loop(this.to(this.a.walk, 1, 460, Easing.linear));
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

    private wag(times: number, t: number) {
        const seq: Animated.CompositeAnimation[] = [];
        for (let i = 0; i < times; i++) seq.push(this.to(this.a.tail, 1, 110), this.to(this.a.tail, -1, 110));
        seq.push(this.to(this.a.tail, 0, 110));
        return this.play(Animated.sequence(seq), t);
    }

    private dip(times: number, ms: number, depth: number, t: number) {
        const seq: Animated.CompositeAnimation[] = [];
        for (let i = 0; i < times; i++) seq.push(this.to(this.a.headDip, depth, ms), this.to(this.a.headDip, 0, ms));
        return this.play(Animated.sequence(seq), t);
    }

    // 소품과 공을 피해서 돌아다닐 곳 고르기
    private randomSpot(): [number, number] {
        const avoid = [CUSHION, BOWL, { ...this.ball, r: 2.5 }];
        for (let i = 0; i < 20; i++) {
            const x = rand(WALK_MIN, WALK_MAX), z = rand(WALK_MIN, WALK_MAX);
            if (Math.hypot(x - this.x, z - this.z) < 5) continue;
            if (avoid.every(o => Math.hypot(x - o.x, z - o.z) > o.r + 3.5)) return [x, z];
        }
        return [15, 15];
    }

    /** (x, z) 를 보고 dist 만큼 떨어진 자리 (지금 서 있는 쪽에서 다가간다) */
    private near(x: number, z: number, dist: number): [number, number] {
        const dx = this.x - x, dz = this.z - z;
        const len = Math.hypot(dx, dz) || 1;
        const clamp = (v: number) => Math.max(WALK_MIN - 2, Math.min(WALK_MAX + 1, v));
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
        await this.walkTo(CUSHION.x, CUSHION.z, t);
        await this.turnTo((FACE_CAMERA + Math.round(rand(-2, 2)) + YAW_STEPS) % YAW_STEPS, t);
        await this.play(this.to(this.a.sit, 1, 400), t);
        this.eyesBusy = true;
        try {
            await this.play(this.to(this.a.eyes, 0, 700), t);
            const end = Date.now() + rand(7000, 11000);
            while (Date.now() < end) {
                this.env.effect('💤');
                await this.play(Animated.sequence([this.to(this.a.headDip, 0.5, 1100), this.to(this.a.headDip, 0, 1100)]), t);
            }
            await this.play(this.to(this.a.eyes, 1, 200), t);
        } finally {
            this.eyesBusy = false;
        }
        await this.twitchEar(t);
        await this.play(this.to(this.a.sit, 0, 300), t);
        await this.hop(1.2, t);   // 기지개
    }

    private async playBall(t: number) {
        const [x, z] = this.near(this.ball.x, this.ball.z, 4);
        await this.walkTo(x, z, t);
        await this.faceToward(this.ball.x, this.ball.z, t);
        await this.wait(250, t);
        // 공을 찬 방향으로 굴린다 (방 안에서)
        const dx = this.ball.x - this.x, dz = this.ball.z - this.z;
        const len = Math.hypot(dx, dz) || 1;
        const far = rand(7, 13);
        const clamp = (v: number) => Math.max(WALK_MIN - 2, Math.min(WALK_MAX + 1, v));
        let bx = clamp(this.ball.x + (dx / len) * far), bz = clamp(this.ball.z + (dz / len) * far);
        if (Math.hypot(bx - this.ball.x, bz - this.ball.z) < 3) [bx, bz] = this.randomSpot();
        const roll = this.env.moveBall(bx, bz, 900);
        this.ball = { x: bx, z: bz };
        await this.hop(1.5, t);
        await roll;
        if (t !== this.token) throw new Cancelled();
        await this.wag(3, t);
        if (Math.random() < 0.5) await this.playBall(t);   // 한 번 더 쫓아가기
    }

    private async eatBowl(t: number) {
        const [x, z] = this.near(BOWL.x, BOWL.z, 4.5);
        await this.walkTo(x, z, t);
        await this.faceToward(BOWL.x, BOWL.z, t);
        await this.dip(5, 140, 1, t);
        await this.wait(400, t);
        await this.dip(3, 140, 1, t);
        await this.wag(2, t);
    }

    private async happy(t: number) {
        await this.turnTo(FACE_CAMERA, t);
        this.env.effect('💕');
        await this.hop(2, t);
        await this.hop(2, t);
        await this.wag(3, t);
    }

    private async twitchEar(t: number) {
        const ear = Math.random() < 0.5 ? this.a.earL : this.a.earR;
        await this.play(Animated.sequence([this.to(ear, 1, 90), this.to(ear, -0.4, 90), this.to(ear, 0, 120)]), t);
    }

    private async live(t: number) {
        try {
            for (;;) {
                const act = pick<(t: number) => Promise<void>>([
                    [this.wander.bind(this), 4],
                    [this.lookAround.bind(this), 2],
                    [this.sniff.bind(this), 2],
                    [this.playBall.bind(this), 2],
                    [this.eatBowl.bind(this), 1],
                    [this.nap.bind(this), 1],
                    [this.happy.bind(this), 1],
                ]);
                await act(t);
                await this.wait(rand(1200, 3500), t);
            }
        } catch (e) {
            if (e instanceof Cancelled) return;
            // 예상 못 한 오류로 멈춰 서 있지 않도록 잠시 뒤 다시 시작
            console.warn('pet brain', e);
            setTimeout(() => { if (!this.disposed && t === this.token) void this.live(t); }, 2000);
        }
    }

    // ── 주인이 부른다 ──────────────────────────
    /** 하던 일을 멈추고 화면을 보며 반가워한다. 잠시 뒤 다시 혼자 논다 */
    async call() {
        if (this.disposed) return;
        this.interrupt();
        const t = this.token;
        try {
            // 걷다가 멈춘 자리 = 지금 화면 위치에서 거꾸로 계산
            const [sx, sy] = await Promise.all([
                new Promise<number>(r => this.a.posX.stopAnimation(r)),
                new Promise<number>(r => this.a.posY.stopAnimation(r)),
            ]);
            const l = this.env.layout;
            const d = (sx - l.ox) / (C * l.kv), s = (sy - l.oy) * 2 / l.kv;   // x - z, x + z
            this.x = (s + d) / 2; this.z = (s - d) / 2;
            this.env.setPetDepth(this.x + this.z);
            this.a.walk.setValue(0);
            this.eyesBusy = false;

            await this.play(Animated.parallel([
                this.to(this.a.eyes, 1, 120), this.to(this.a.sit, 0, 200), this.to(this.a.headDip, 0, 150),
                this.to(this.a.headTilt, 0, 150), this.to(this.a.hop, 0, 100),
            ]), t);
            this.env.effect('❗');
            await this.turnTo(FACE_CAMERA, t);
            await this.hop(1.6, t);
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
            void this.live(t);
        } catch (e) {
            if (!(e instanceof Cancelled)) console.warn('pet call', e);
        }
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
            this.ambientTimers.blink = setTimeout(blink, rand(1800, 4500));
        };
        this.ambientTimers.blink = setTimeout(blink, 1500);

        const ear = () => {
            if (this.disposed) return;
            const v = Math.random() < 0.5 ? this.a.earL : this.a.earR;
            Animated.sequence([this.to(v, 1, 80), this.to(v, -0.3, 80), this.to(v, 0, 110)]).start();
            this.ambientTimers.ear = setTimeout(ear, rand(4000, 9000));
        };
        this.ambientTimers.ear = setTimeout(ear, 3000);
    }
}
