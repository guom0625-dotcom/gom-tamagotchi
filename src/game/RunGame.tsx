// 🐧 얼음길 달리기 — 슈퍼펭귄처럼: 폰을 기울여 좌우로 움직이고, 화면을 톡 누르면 점프한다 (2026-10-26 사용자 결정).
// 3D 엔진 없이 원근만 흉내 낸다: 길은 사다리꼴 한 장, 줄무늬·깃대·장애물은 미리 그린 그림을
// 거리(z)에 따라 옮기고 줄인다. 한 프레임마다 React 를 다시 그리지 않고 Animated 값만 바꾼다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, G, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';
import { Accelerometer } from 'expo-sensors';
import { PetView, makePetAnims } from '../pet/PetView';
import { petModel, type Expr } from '../pet/model';
import { renderPart, type Part } from '../pet/voxel';
import { FACE_CAMERA, YAW_STEPS } from '../pet/layers';
import { runAbilityOf } from './abilities';
import type { GameChar } from './PoopGame';
import { colors, fontFamilies, fontSizes } from '../theme';

export interface RunResult { ms: number; score: number; dist: number; fish: number }

interface Props {
    char: GameChar;
    onOver: (r: RunResult) => void;
}

const BACK = (FACE_CAMERA + YAW_STEPS / 2) % YAW_STEPS;   // 등을 보인다 (앞으로 달린다)
const D = 9;              // 카메라가 펫 뒤로 떨어진 거리 (작으면 원근이 너무 세서 멀리 있는 게 안 보인다)
const ZMAX = 70;          // 보이는 가장 먼 곳
const STRIPE_GAP = 5;
const POST_GAP = 10;
const FISH_POINTS = 10;
const s = (z: number) => D / (z + D);   // 거리 z 에서의 크기 배수 (펫 자리 = 1)

const POOL = { ice: 8, hole: 6, fish: 16, stripe: Math.ceil(ZMAX / STRIPE_GAP) + 1, post: (Math.ceil(ZMAX / POST_GAP) + 1) * 2 };
type Kind = 'ice' | 'hole' | 'fish' | 'seed';
interface Obj { kind: Kind; slot: number; x: number; z: number; pz: number; done?: boolean }

// 얼음 덩어리 (복셀 상자 세 개)
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string) => ({ b: [x0, y0, z0, x1, y1, z1] as [number, number, number, number, number, number], c });
const ICE_PART: Part = {
    boxes: [
        box(-2.2, 0, -1.2, 2.2, 2.4, 1.2, '#5FB4E0'),
        box(-1.6, 2.4, -0.9, 1.4, 3.6, 0.9, '#9AD6F2'),
        box(-0.8, 3.6, -0.5, 0.6, 4.4, 0.5, '#E6F7FF'),
    ],
    pivot: [0, 0, 0],
};

/** 미리 그린 그림 한 장. 원점(발밑 가운데)을 기준으로 놓는다 */
const Sprite = React.memo(function Sprite({ part, kv }: { part: Part; kv: number }) {
    const { polys, b } = useMemo(() => {
        const r = renderPart(part, Math.PI / 4 + Math.PI, kv);   // 앞면이 카메라를 보게
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of r.polys) for (const pt of p.points.split(' ')) {
            const [x, y] = pt.split(',').map(Number);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        return { polys: r.polys, b: { x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, w: Math.ceil(x1 - x0) + 2, h: Math.ceil(y1 - y0) + 2 } };
    }, [part, kv]);
    return (
        <Svg width={b.w} height={b.h} viewBox={`0 0 ${b.w} ${b.h}`} style={{ position: 'absolute', left: b.x0, top: b.y0 }}>
            <G transform={`translate(${-b.x0},${-b.y0})`}>
                {polys.map((p, i) => <Polygon key={i} points={p.points} fill={p.fill} />)}
            </G>
        </Svg>
    );
});

export function RunGame(props: Props) {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size) setSize({ w: Math.round(width), h: Math.round(height) });
    };
    return (
        <View style={{ flex: 1 }} onLayout={onLayout}>
            {size && <Track {...props} w={size.w} h={size.h} />}
        </View>
    );
}

/** 하나의 움직이는 그림 칸: 자리(x, y)와 크기(k) */
const slotVals = () => ({ x: new Animated.Value(-500), y: new Animated.Value(-500), k: new Animated.Value(1) });
type Slot = ReturnType<typeof slotVals>;
const hide = (v: Slot) => { v.x.setValue(-500); v.y.setValue(-500); };

function Track({ char, onOver, w, h }: Props & { w: number; h: number }) {
    const ab = useMemo(() => runAbilityOf(char.species, char.stage, char.build), [char]);
    const cx = w / 2;
    const hy = h * 0.26;                 // 지평선
    const py = h * 0.84;                 // 펫 발밑
    const half = w * 0.4;                // 펫 자리에서 길 반폭 (px)
    const sy = (z: number) => hy + (py - hy) * s(z);
    const sx = (x: number, z: number) => cx + x * half * s(z);
    const bottomK = (h - hy) / (py - hy);   // 화면 맨 아래의 크기 배수

    // 펫: 단계와 상관없이 같은 너비 (똥피하기와 같은 까닭)
    const kv = (half * 0.15) / petModel(char.species, char.variant, 'happy', char.stage).radius;
    const [expr, setExpr] = useState<Expr>('happy');
    const model = useMemo(() => petModel(char.species, char.variant, expr, char.stage, char.outfit ?? {}, char.build), [char, expr]);
    const modelKey = `run-${char.species}-${char.variant}-${expr}-${char.stage}-${char.outfit?.top ?? ''}-${char.outfit?.hat ?? ''}-${char.build}`;
    const petHalfX = 0.15 * (model.radius / petModel(char.species, char.variant, 'happy', char.stage).radius) * ab.hit;
    const a = useMemo(makePetAnims, []);
    const blink = useMemo(() => new Animated.Value(1), []);
    const kvIce = half * 0.22 / 2.2;        // 얼음 반폭 ≈ 길 반폭의 0.22 (부딪힘 0.2)

    const pools = useMemo(() => ({
        ice: Array.from({ length: POOL.ice }, slotVals),
        hole: Array.from({ length: POOL.hole }, slotVals),
        fish: Array.from({ length: POOL.fish }, slotVals),
        stripe: Array.from({ length: POOL.stripe }, slotVals),
        post: Array.from({ length: POOL.post }, slotVals),
        seed: [slotVals()],
    }), []);

    const [hud, setHud] = useState({ dist: 0, fish: 0 });
    const [count, setCount] = useState(3);
    const [shields, setShields] = useState(ab.shields);
    const [flash, setFlash] = useState<string | null>(null);
    const [dead, setDead] = useState(false);
    const [noSensor, setNoSensor] = useState(false);

    // 기울기: 시작 전(3·2·1) 동안 잡은 자세를 가운데로 친다
    const tilt = useRef({ x: 0, base: 0, n: 0, calibrating: true });
    useEffect(() => {
        let sub: { remove: () => void } | null = null;
        let alive = true;
        void Accelerometer.isAvailableAsync().then(ok => {
            if (!alive) return;
            if (!ok) { setNoSensor(true); return; }
            Accelerometer.setUpdateInterval(20);
            sub = Accelerometer.addListener(m => {
                const t = tilt.current;
                const x = Platform.OS === 'android' ? -m.x : m.x;   // 오른쪽으로 기울이면 +
                if (t.calibrating) { t.base = (t.base * t.n + x) / (t.n + 1); t.n = Math.min(t.n + 1, 30); }
                t.x = x;
            });
        }).catch(() => setNoSensor(true));
        return () => { alive = false; sub?.remove(); };
    }, []);

    // 센서가 없으면 화면 왼쪽·오른쪽을 눌러 움직인다 (가운데 = 점프)
    const touch = useRef({ left: false, right: false, jump: false });
    const onTouch = (e: { nativeEvent: { touches: { pageX: number }[]; changedTouches?: { pageX: number }[] } }, start: boolean) => {
        if (!noSensor) { if (start) touch.current.jump = true; return; }
        let l = false, r = false;
        for (const t of e.nativeEvent.touches) { const f = t.pageX / w; if (f < 0.33) l = true; else if (f > 0.67) r = true; }
        touch.current.left = l; touch.current.right = r;
        if (start) for (const t of e.nativeEvent.changedTouches ?? []) { const f = t.pageX / w; if (f >= 0.33 && f <= 0.67) touch.current.jump = true; }
    };

    useEffect(() => {
        const l = Animated.loop(Animated.sequence([
            Animated.timing(a.breath, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(a.breath, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]));
        l.start();
        a.posX.setValue(cx);
        a.posY.setValue(py);
        return () => l.stop();
    }, []);

    useEffect(() => {
        if (count <= 0) { tilt.current.calibrating = false; return; }
        const id = setTimeout(() => setCount(c => c - 1), 800);
        return () => clearTimeout(id);
    }, [count]);

    const onOverRef = useRef(onOver);
    onOverRef.current = onOver;

    // 줄무늬·깃대는 시작 전에도 제자리에 보이게
    const placeScenery = (dist: number) => {
        const off = dist % STRIPE_GAP;
        pools.stripe.forEach((v, i) => {
            const z = i * STRIPE_GAP - off;
            if (z < -D * 0.6 || z > ZMAX) { hide(v); return; }
            v.y.setValue(sy(z)); v.x.setValue(cx); v.k.setValue(s(z));
        });
        const po = dist % POST_GAP;
        pools.post.forEach((v, i) => {
            const z = Math.floor(i / 2) * POST_GAP - po;
            if (z < -D * 0.6 || z > ZMAX) { hide(v); return; }
            const side = i % 2 ? 1 : -1;
            v.x.setValue(sx(side * 1.18, z)); v.y.setValue(sy(z)); v.k.setValue(s(z));
        });
    };
    useEffect(() => { placeScenery(0); }, []);

    useEffect(() => {
        if (count > 0) return;
        let raf = 0, last = Date.now(), stopped = false;
        const st = {
            t: 0, dist: 0, fish: 0, x: 0, vx: 0,
            jumpT: -1, jumpDur: 0.62 * ab.jump,
            objs: [] as Obj[],
            free: { ice: [...Array(POOL.ice).keys()], hole: [...Array(POOL.hole).keys()], fish: [...Array(POOL.fish).keys()], seed: [0] } as Record<Kind, number[]>,
            nextAt: 30, shields: ab.shields, invUntil: 0,
            nextSeed: ab.seed?.every ?? Infinity,
            shownDist: -1, shownFish: -1, walk: 0,
        };
        const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(f => (f === m ? null : f)), 900); };
        const spawn = (kind: Kind, x: number, z: number) => {
            const slot = st.free[kind].pop();
            if (slot === undefined) return;
            st.objs.push({ kind, slot, x, z, pz: z });
        };
        const lane = () => (Math.random() * 2 - 1) * 0.8;
        // 앞쪽에 새 무리를 놓는다. 시간이 갈수록 촘촘
        const pattern = () => {
            const z = ZMAX;
            const r = Math.random();
            if (ab.seed && st.t >= st.nextSeed) { spawn('seed', lane(), z); st.nextSeed = st.t + ab.seed.every; return; }
            if (r < 0.3) { const x = lane(); for (let i = 0; i < 4; i++) spawn('fish', x, z + i * 2.2); }
            else if (r < 0.55) spawn('hole', lane(), z);
            else if (r < 0.75 && st.t > 12) {   // 얼음 두 개, 사이로 빠져나가거나 뛰어넘기
                const gap = (Math.random() * 2 - 1) * 0.5;
                spawn('ice', gap - 0.62, z); spawn('ice', gap + 0.62, z);
            } else { spawn('ice', lane(), z); if (Math.random() < 0.5) spawn('fish', lane(), z + 6); }
        };

        const die = () => {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(raf);
            a.walk.setValue(0); a.hop.setValue(0); blink.setValue(1);
            setExpr('sick');
            setDead(true);
            const r: RunResult = { ms: Math.round(st.t * 1000), dist: Math.floor(st.dist), fish: st.fish, score: Math.floor(st.dist) + st.fish * FISH_POINTS };
            setTimeout(() => onOverRef.current(r), 1300);
        };

        const frame = () => {
            if (stopped) return;
            const now = Date.now();
            const dt = Math.min(now - last, 50) / 1000;
            last = now;
            st.t += dt;
            const v = Math.min(32, 11 + 0.28 * st.t);   // 앞으로 가는 빠르기 (m/초)
            const dz = v * dt;
            st.dist += dz;

            // 좌우: 기울기 (센서 없으면 화면 양쪽)
            let steer: number;
            if (!noSensor) {
                const raw = tilt.current.x - tilt.current.base;
                steer = Math.abs(raw) < 0.04 ? 0 : Math.max(-1, Math.min(1, (raw - Math.sign(raw) * 0.04) * 3.2));
            } else steer = (touch.current.right ? 1 : 0) - (touch.current.left ? 1 : 0);
            st.vx += (steer * 2.3 * ab.steer - st.vx) * Math.min(1, dt * 10);
            st.x = Math.max(-1 + petHalfX * 0.6, Math.min(1 - petHalfX * 0.6, st.x + st.vx * dt));
            a.posX.setValue(sx(st.x, 0));
            a.headTilt.setValue(Math.max(-1, Math.min(1, st.vx / 2)));

            // 점프
            if (touch.current.jump) { touch.current.jump = false; if (st.jumpT < 0) st.jumpT = 0; }
            let air = false;
            if (st.jumpT >= 0) {
                st.jumpT += dt;
                const f = st.jumpT / st.jumpDur;
                if (f >= 1) { st.jumpT = -1; a.hop.setValue(0); }
                else { air = f > 0.06 && f < 0.94; a.hop.setValue(-Math.sin(Math.PI * f) * h * 0.13 * Math.sqrt(ab.jump)); }
            }
            // 달리는 다리
            if (!air) { st.walk = (st.walk + dt / 0.24) % 1; a.walk.setValue(st.walk); } else a.walk.setValue(0.25);

            // 새 무리
            if (st.dist >= st.nextAt) { pattern(); st.nextAt = st.dist + Math.max(6, 16 - st.t * 0.14) * (0.8 + Math.random() * 0.5); }

            // 물건 움직이기와 부딪힘
            const inv = st.t < st.invUntil;
            for (let i = st.objs.length - 1; i >= 0; i--) {
                const o = st.objs[i];
                o.pz = o.z; o.z -= dz;
                // 이번 프레임에 펫 자리(z = 0 근처)를 지나갔나 (빠르면 한 프레임에 건너뛰므로 구간으로 본다)
                const crossing = o.pz >= -0.4 && o.z <= 0.4 && !o.done;
                if (crossing) {
                    const dx = Math.abs(o.x - st.x);
                    if (o.kind === 'fish' || o.kind === 'seed') {
                        if (dx < petHalfX + 0.1 * (o.kind === 'fish' ? ab.magnet : 1.5)) {
                            o.done = true; o.z = -99;
                            if (o.kind === 'fish') st.fish++;
                            else { st.invUntil = st.t + ab.seed!.dur; say('🌻 냠! 무적'); }
                        }
                    } else if (!air && !inv && dx < petHalfX + (o.kind === 'ice' ? 0.2 : 0.24)) {
                        o.done = true;
                        if (st.shields > 0) {
                            st.shields--; setShields(st.shields);
                            st.invUntil = st.t + 1; o.z = -99;
                            say(o.kind === 'ice' ? '🛡️ 얼음을 부쉈다!' : '🛡️ 영차! 빠져나왔다');
                        } else {
                            if (o.kind === 'hole') a.hop.setValue(h * 0.03);
                            die(); return;
                        }
                    }
                }
                const pool = o.kind === 'seed' ? pools.seed : pools[o.kind];
                if (o.z < -D * 0.7) { st.free[o.kind].push(o.slot); hide(pool[o.slot]); st.objs.splice(i, 1); continue; }
                const sv = pool[o.slot];
                sv.x.setValue(sx(o.x, o.z)); sv.y.setValue(sy(o.z)); sv.k.setValue(s(o.z));
            }
            placeScenery(st.dist);
            blink.setValue(st.t < st.invUntil ? (Math.floor(st.t * 10) % 2 ? 0.35 : 1) : 1);

            const shownD = Math.floor(st.dist);
            if (shownD !== st.shownDist || st.fish !== st.shownFish) { st.shownDist = shownD; st.shownFish = st.fish; setHud({ dist: shownD, fish: st.fish }); }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        const sub = AppState.addEventListener('change', x => { if (x !== 'active') die(); });
        return () => { stopped = true; cancelAnimationFrame(raf); sub.remove(); };
    }, [count]);

    // 길 (사다리꼴)
    const far = s(ZMAX), roadTop = sy(ZMAX);
    const road = `${cx - half * far},${roadTop} ${cx + half * far},${roadTop} ${cx + half * bottomK},${h} ${cx - half * bottomK},${h}`;
    const tr = (v: Slot) => [{ translateX: v.x }, { translateY: v.y }, { scale: v.k }];

    return (
        <View style={styles.field} onStartShouldSetResponder={() => true}
            onTouchStart={e => onTouch(e, true)} onTouchMove={e => onTouch(e, false)} onTouchEnd={e => onTouch(e, false)}>
            <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={StyleSheet.absoluteFill}>
                <Defs>
                    <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#8FD3FF" /><Stop offset="1" stopColor="#E3F5FF" />
                    </LinearGradient>
                    <LinearGradient id="ice" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#CFEFFF" /><Stop offset="1" stopColor="#9FD8F2" />
                    </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={w} height={hy + 2} fill="url(#sky)" />
                <Rect x={0} y={hy} width={w} height={h - hy} fill="#F7FBFF" />
                <Polygon points={road} fill="url(#ice)" />
            </Svg>

            {/* 줄무늬 (길 너비에 맞춰 줄어든다) */}
            {pools.stripe.map((v, i) => (
                <Animated.View key={`s${i}`} pointerEvents="none" style={[styles.abs, { transform: tr(v) }]}>
                    <View style={{ position: 'absolute', left: -half, top: -3, width: half * 2, height: 6, backgroundColor: 'rgba(255,255,255,0.55)' }} />
                </Animated.View>
            ))}
            {pools.post.map((v, i) => (
                <Animated.View key={`p${i}`} pointerEvents="none" style={[styles.abs, { transform: tr(v) }]}>
                    <View style={{ position: 'absolute', left: -5, top: -80, width: 10, height: 80, backgroundColor: i % 4 < 2 ? '#FF6B6B' : '#3A96FF', borderRadius: 3 }} />
                    <View style={{ position: 'absolute', left: -5, top: -80, width: 10, height: 14, backgroundColor: '#fff', borderRadius: 3 }} />
                </Animated.View>
            ))}
            {pools.hole.map((v, i) => (
                <Animated.View key={`h${i}`} pointerEvents="none" style={[styles.abs, { transform: tr(v) }]}>
                    <View style={{ position: 'absolute', left: -half * 0.26, top: -half * 0.06, width: half * 0.52, height: half * 0.12, borderRadius: half, backgroundColor: '#2A6FB0', borderWidth: 3, borderColor: '#E9F7FF' }} />
                </Animated.View>
            ))}
            {pools.fish.map((v, i) => (
                <Animated.View key={`f${i}`} pointerEvents="none" style={[styles.abs, { transform: tr(v) }]}>
                    <Text style={[styles.emoji, { fontSize: half * 0.16, left: -half * 0.1, top: -half * 0.24 }]}>🐟</Text>
                </Animated.View>
            ))}
            {ab.seed && (
                <Animated.View pointerEvents="none" style={[styles.abs, { transform: tr(pools.seed[0]) }]}>
                    <Text style={[styles.emoji, { fontSize: half * 0.16, left: -half * 0.1, top: -half * 0.24 }]}>🌻</Text>
                </Animated.View>
            )}
            {pools.ice.map((v, i) => (
                <Animated.View key={`i${i}`} pointerEvents="none" style={[styles.abs, { transform: tr(v) }]}>
                    <Sprite part={ICE_PART} kv={kvIce} />
                </Animated.View>
            ))}

            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: blink }]}>
                <PetView model={model} modelKey={modelKey} yawIdx={dead ? FACE_CAMERA : BACK} kv={kv} a={a} />
            </Animated.View>

            <View style={styles.hud} pointerEvents="none">
                <Text style={styles.score}>{hud.dist}m</Text>
                <Text style={styles.side}>🐟 {hud.fish}{ab.shields > 0 ? `  ${'🛡️'.repeat(shields)}` : ''}</Text>
            </View>
            {flash && !dead && <Text style={styles.flash} pointerEvents="none">{flash}</Text>}
            {count > 0 && (
                <View style={styles.countWrap} pointerEvents="none">
                    <Text style={styles.count}>{count}</Text>
                    <Text style={styles.countNote}>{noSensor
                        ? '화면 왼쪽·오른쪽을 눌러 움직이고\n가운데를 누르면 점프해요'
                        : '편하게 잡은 자세 그대로 있어 주세요\n폰을 기울여 움직이고, 화면을 누르면 점프해요'}</Text>
                </View>
            )}
            {dead && <Text style={styles.over} pointerEvents="none">꽈당!</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    field: { flex: 1, overflow: 'hidden', borderRadius: 22, backgroundColor: '#F7FBFF' },
    abs: { position: 'absolute', left: 0, top: 0 },
    emoji: { position: 'absolute' },
    hud: { position: 'absolute', top: 10, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    score: { fontFamily: fontFamilies.num, fontSize: 28, color: colors.ink[900] },
    side: { fontFamily: fontFamilies.num, fontSize: 20, color: colors.ink[900] },
    flash: { position: 'absolute', top: 56, alignSelf: 'center', fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: colors.grape[700] },
    countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
    count: { fontFamily: fontFamilies.num, fontSize: 72, color: colors.sky[700] },
    countNote: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[700], textAlign: 'center', lineHeight: 22 },
    over: { position: 'absolute', top: '38%', alignSelf: 'center', fontFamily: fontFamilies.display, fontSize: 40, color: colors.sky[700] },
});
