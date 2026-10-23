// 똥피하기 — 하늘에서 똥이 떨어지고, 시간이 갈수록 더 많이·더 빨리 떨어진다. 한 번 맞으면 끝.
// 펫은 방에서 쓰는 복셀 그림(PetView)을 그대로 쓴다. 똥은 미리 만들어 둔 칸(풀)을 옮기기만 해서
// 한 프레임마다 React 를 다시 그리지 않는다 (Animated 값만 바꾼다).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Polygon } from 'react-native-svg';
import { PetView, makePetAnims } from '../pet/PetView';
import { petModel, type Build, type BodyStage, type Expr, type Outfit } from '../pet/model';
import { POOP_PART } from '../pet/room';
import { C, renderPart, yawToward } from '../pet/voxel';
import { FACE_CAMERA, yawIndex } from '../pet/layers';
import type { Species } from '../pet/species';
import { abilityOf } from './abilities';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

const POOL = 70;
// 자라면 그림이 커지는데, 크면 잘 맞아서 불리했다 (2026-10-23 사용자 지적).
// 그래서 단계와 상관없이 보통 체형 기준 같은 너비로 그리고, 맞는 범위는 자랄수록 조금씩 작게 한다
const PET_W = 6.2;                                         // 보통 체형 펫 반지름을 이 칸 수로 맞춘다
const STAGE_HIT: Record<BodyStage, number> = { baby: 1, teen: 0.94, adult: 0.88 };
const RIGHT = yawIndex(yawToward(1, 0));   // 화면 오른쪽(조금 앞)을 본다
const LEFT = yawIndex(yawToward(0, 1));

export interface GameChar { species: Species; variant: number; stage: BodyStage; build: Build; outfit?: Outfit }

interface Props {
    char: GameChar;
    /** 끝났을 때 (버틴 시간 ms) */
    onOver: (scoreMs: number) => void;
}

/** 똥 그림 한 장 (발밑 가운데가 원점) */
const PoopSprite = React.memo(function PoopSprite({ kv }: { kv: number }) {
    const { polys, box } = useMemo(() => {
        const r = renderPart(POOP_PART, 0.4, kv);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of r.polys) for (const pt of p.points.split(' ')) {
            const [x, y] = pt.split(',').map(Number);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        return { polys: r.polys, box: { x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, w: Math.ceil(x1 - x0) + 2, h: Math.ceil(y1 - y0) + 2 } };
    }, [kv]);
    return (
        <Svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} style={{ position: 'absolute', left: box.x0, top: box.y0 }}>
            <G transform={`translate(${-box.x0},${-box.y0})`}>
                {polys.map((p, i) => <Polygon key={i} points={p.points} fill={p.fill} />)}
            </G>
        </Svg>
    );
});

export function PoopGame(props: Props) {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size) setSize({ w: Math.round(width), h: Math.round(height) });
    };
    return (
        <View style={{ flex: 1 }} onLayout={onLayout}>
            {size && <Field {...props} w={size.w} h={size.h} />}
        </View>
    );
}

interface Poop { slot: number; x: number; y: number; v: number }

function Field({ char, onOver, w, h }: Props & { w: number; h: number }) {
    const ab = useMemo(() => abilityOf(char.species, char.stage, char.build), [char]);
    const barH = 88;                       // 아래 조작 칸
    const fieldH = h - barH;
    const ground = fieldH - 26;            // 펫 발밑
    const kvBase = w / 64;
    const kv = kvBase * PET_W / petModel(char.species, char.variant, 'happy', char.stage).radius;   // 살찐 만큼은 넓어진다
    const kvPoop = kvBase * 1.05;
    const poopR = 1.7 * kvPoop;            // 똥 반지름 (px)
    const poopH = 2.8 * C * kvPoop;        // 똥 높이 (px)

    const [expr, setExpr] = useState<Expr>('happy');
    const [yaw, setYaw] = useState(FACE_CAMERA);
    const model = useMemo(() => petModel(char.species, char.variant, expr, char.stage, char.outfit ?? {}, char.build),
        [char, expr]);
    const modelKey = `game-${char.species}-${char.variant}-${expr}-${char.stage}-${char.outfit?.top ?? ''}-${char.outfit?.hat ?? ''}-${char.build}`;
    const petHalf = model.radius * kv * 0.62 * ab.hit * STAGE_HIT[char.stage];
    const petTop = model.height * C * kv * 0.85;

    const a = useMemo(makePetAnims, []);
    const slots = useMemo(() => Array.from({ length: POOL }, () => new Animated.ValueXY({ x: -100, y: -200 })), []);
    const seedPos = useMemo(() => new Animated.ValueXY({ x: -100, y: -200 }), []);
    const blink = useMemo(() => new Animated.Value(1), []);
    const headPoop = useMemo(() => new Animated.ValueXY({ x: -100, y: -200 }), []);

    const [score, setScore] = useState(0);
    const [count, setCount] = useState(3);           // 3, 2, 1 → 0 이면 시작
    const [shields, setShields] = useState(ab.shields);
    const [coolLeft, setCoolLeft] = useState(0);     // 능력 버튼 남은 대기 (초)
    const [flash, setFlash] = useState<string | null>(null);
    const [dead, setDead] = useState(false);

    // 조작: 아래 칸을 왼쪽·오른쪽으로 누르고 있으면 걷는다. 가운데는 능력 버튼 (여러 손가락 같이 됨)
    const bar = useRef({ x: 0, w: 1 });
    const barRef = useRef<View>(null);
    const held = useRef({ left: false, right: false });
    const abilityTap = useRef(false);
    const zoneOf = (pageX: number) => {
        const f = (pageX - bar.current.x) / bar.current.w;
        if (ab.button) return f < 0.36 ? 'left' : f > 0.64 ? 'right' : 'mid';
        return f < 0.5 ? 'left' : 'right';
    };
    const onTouches = (e: GestureResponderEvent, start: boolean) => {
        const touches = e.nativeEvent.touches;
        let l = false, r = false;
        for (const t of touches) {
            const z = zoneOf(t.pageX);
            if (z === 'left') l = true; else if (z === 'right') r = true;
        }
        held.current = { left: l, right: r };
        if (start) {
            const ch = e.nativeEvent.changedTouches ?? [];
            for (const t of ch) if (zoneOf(t.pageX) === 'mid') abilityTap.current = true;
        }
    };

    // 숨쉬기
    useEffect(() => {
        const l = Animated.loop(Animated.sequence([
            Animated.timing(a.breath, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(a.breath, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]));
        l.start();
        a.posX.setValue(w / 2);
        a.posY.setValue(ground);
        return () => l.stop();
    }, []);

    // 3, 2, 1
    useEffect(() => {
        if (count <= 0) return;
        const id = setTimeout(() => setCount(c => c - 1), 700);
        return () => clearTimeout(id);
    }, [count]);

    // 게임 진행
    const onOverRef = useRef(onOver);
    onOverRef.current = onOver;
    useEffect(() => {
        if (count > 0) return;
        let raf = 0, last = Date.now(), stopped = false;
        const s = {
            t: 0, x: w / 2, face: 0, walk: 0,
            poops: [] as Poop[], free: Array.from({ length: POOL }, (_, i) => i),
            spawnIn: 0.4, spawned: 0,
            shields: ab.shields, invUntil: 0,
            readyAt: 0, slowUntil: 0,
            seed: null as { x: number; y: number } | null, nextSeed: ab.seed?.every ?? Infinity,
            shownScore: -1, shownCool: -1,
        };
        const speed = w * 0.55 * ab.speed;
        const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(f => (f === m ? null : f)), 900); };

        const die = () => {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(raf);
            a.walk.setValue(0);
            blink.setValue(1);
            setExpr('sick');
            setYaw(FACE_CAMERA);
            headPoop.setValue({ x: s.x, y: ground - model.height * C * kv * 0.98 });
            setDead(true);
            const ms = Math.round(s.t * 1000);
            setScore(ms);
            setTimeout(() => onOverRef.current(ms), 1200);
        };

        const frame = () => {
            if (stopped) return;
            const now = Date.now();
            const dt = Math.min(now - last, 50) / 1000;   // 멈췄다 돌아와도 한 번에 건너뛰지 않게
            last = now;
            s.t += dt;
            const slow = s.t < s.slowUntil ? ab.slow!.k : 1;
            const pdt = dt * slow;

            // 능력
            if (abilityTap.current) {
                abilityTap.current = false;
                if (s.t >= s.readyAt) {
                    if (ab.dash) {
                        const dir = s.face !== 0 ? s.face : (held.current.left ? -1 : 1);
                        s.x = Math.max(petHalf, Math.min(w - petHalf, s.x + dir * ab.dash.dist * w));
                        s.invUntil = Math.max(s.invUntil, s.t + 0.25);
                        s.readyAt = s.t + ab.dash.cool;
                        say('⚡ 휙!');
                    } else if (ab.slow) {
                        s.slowUntil = s.t + ab.slow.dur;
                        s.readyAt = s.t + ab.slow.cool;
                        say('👂 느려져라!');
                    }
                }
            }

            // 걷기
            const dir = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
            if (dir !== 0) {
                s.x = Math.max(petHalf, Math.min(w - petHalf, s.x + dir * speed * dt));
                s.walk = (s.walk + dt * 1000 / 300) % 1;
                a.walk.setValue(s.walk);
                if (dir !== s.face) { s.face = dir; setYaw(dir > 0 ? RIGHT : LEFT); }
            } else if (s.walk !== 0) {
                s.walk = 0; a.walk.setValue(0);
            }
            a.posX.setValue(s.x);

            // 똥 떨어뜨리기: 처음엔 0.6초마다, 점점 촘촘해진다
            s.spawnIn -= pdt;
            while (s.spawnIn <= 0) {
                s.spawnIn += Math.max(0.085, 0.6 * Math.pow(0.963, s.t));
                const slot = s.free.pop();
                if (slot === undefined) break;
                s.spawned++;
                // 다섯 개에 하나는 펫 쪽을 노린다
                const aim = s.spawned % 5 === 0;
                const x = aim ? s.x + (Math.random() - 0.5) * w * 0.15 : poopR + Math.random() * (w - poopR * 2);
                const v = fieldH * Math.min(1.7, 0.5 + 0.018 * s.t) * (0.85 + Math.random() * 0.35);
                s.poops.push({ slot, x: Math.max(poopR, Math.min(w - poopR, x)), y: -6, v });
            }

            // 햄스터 해바라기씨
            if (ab.seed && !s.seed && s.t >= s.nextSeed) s.seed = { x: 20 + Math.random() * (w - 40), y: -20 };
            if (s.seed) {
                s.seed.y += fieldH * 0.45 * pdt;
                if (Math.abs(s.seed.x - s.x) < petHalf + 14 && s.seed.y > ground - petTop && s.seed.y < ground + 6) {
                    s.invUntil = s.t + ab.seed!.dur;
                    s.seed = null; s.nextSeed = s.t + ab.seed!.every;
                    say('🌻 냠! 무적');
                } else if (s.seed.y > ground + 10) {
                    s.seed = null; s.nextSeed = s.t + ab.seed!.every;
                }
            }
            seedPos.setValue(s.seed ? { x: s.seed.x, y: s.seed.y } : { x: -100, y: -200 });

            // 똥 움직이고 맞았는지 보기
            const inv = s.t < s.invUntil;
            for (let i = s.poops.length - 1; i >= 0; i--) {
                const p = s.poops[i];
                p.y += p.v * pdt;
                const hitX = Math.abs(p.x - s.x) < petHalf + poopR * 0.55;
                const hitY = p.y > ground - petTop && p.y - poopH < ground;
                if (hitX && hitY) {
                    if (inv) { /* 무적이면 그냥 튕겨 낸다 */ }
                    else if (s.shields > 0) {
                        s.shields--; setShields(s.shields);
                        s.invUntil = s.t + 1;
                        say('🛡️ 막았다!');
                    } else { die(); return; }
                    s.free.push(p.slot); slots[p.slot].setValue({ x: -100, y: -200 }); s.poops.splice(i, 1);
                    continue;
                }
                if (p.y > ground + 12) { s.free.push(p.slot); slots[p.slot].setValue({ x: -100, y: -200 }); s.poops.splice(i, 1); continue; }
                slots[p.slot].setValue({ x: p.x, y: p.y });
            }
            // 무적이면 깜빡
            blink.setValue(s.t < s.invUntil ? (Math.floor(s.t * 10) % 2 ? 0.35 : 1) : 1);

            // 화면 글자는 0.1초 단위로만 바꾼다
            const shown = Math.floor(s.t * 10);
            if (shown !== s.shownScore) { s.shownScore = shown; setScore(shown * 100); }
            const cool = Math.max(0, Math.ceil(s.readyAt - s.t));
            if (cool !== s.shownCool) { s.shownCool = cool; setCoolLeft(cool); }

            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        // 앱을 내리면 그 판은 끝
        const sub = AppState.addEventListener('change', st => { if (st !== 'active') die(); });
        return () => { stopped = true; cancelAnimationFrame(raf); sub.remove(); };
    }, [count]);

    return (
        <View style={{ flex: 1 }}>
            <View style={[styles.field, { height: fieldH }]}>
                {/* 땅 */}
                <View style={[styles.ground, { top: ground - 4 }]} />
                {/* 똥 */}
                {slots.map((v, i) => (
                    <Animated.View key={i} pointerEvents="none" style={[styles.abs, { transform: v.getTranslateTransform() }]}>
                        <PoopSprite kv={kvPoop} />
                    </Animated.View>
                ))}
                {ab.seed && (
                    <Animated.View pointerEvents="none" style={[styles.abs, { transform: seedPos.getTranslateTransform() }]}>
                        <Text style={styles.seed}>🌻</Text>
                    </Animated.View>
                )}
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: blink }]}>
                    <PetView model={model} modelKey={modelKey} yawIdx={yaw} kv={kv} a={a} />
                </Animated.View>
                {/* 맞으면 머리 위에 똥 */}
                <Animated.View pointerEvents="none" style={[styles.abs, { transform: headPoop.getTranslateTransform() }]}>
                    <PoopSprite kv={kvPoop} />
                </Animated.View>

                <View style={styles.hud} pointerEvents="none">
                    <Text style={styles.score}>{(score / 1000).toFixed(1)}초</Text>
                    {ab.shields > 0 && <Text style={styles.hudSide}>{'🛡️'.repeat(shields)}{'▫️'.repeat(ab.shields - shields)}</Text>}
                </View>
                {flash && !dead && <Text style={styles.flash} pointerEvents="none">{flash}</Text>}
                {count > 0 && (
                    <View style={styles.countWrap} pointerEvents="none">
                        <Text style={styles.count}>{count}</Text>
                        <Text style={styles.countNote}>아래 칸을 꾹 눌러 움직여요</Text>
                    </View>
                )}
                {dead && <Text style={styles.over} pointerEvents="none">💩 퍽!</Text>}
            </View>

            {/* 조작 칸 */}
            <View ref={barRef} style={[styles.bar, { height: barH }]}
                onLayout={() => barRef.current?.measureInWindow((x, _y, bw) => { bar.current = { x, w: bw || 1 }; })}
                onStartShouldSetResponder={() => true}
                onTouchStart={e => onTouches(e, true)}
                onTouchMove={e => onTouches(e, false)}
                onTouchEnd={e => onTouches(e, false)}
                onTouchCancel={() => { held.current = { left: false, right: false }; }}>
                <View style={[styles.pad, { flex: ab.button ? 36 : 50 }]}><Text style={styles.padText}>◀</Text></View>
                {ab.button && (
                    <View style={[styles.pad, styles.abilityPad, { flex: 28 }, coolLeft > 0 && styles.padOff]}>
                        <Text style={styles.abilityText}>{coolLeft > 0 ? `${coolLeft}` : ab.button}</Text>
                    </View>
                )}
                <View style={[styles.pad, { flex: ab.button ? 36 : 50 }]}><Text style={styles.padText}>▶</Text></View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    abs: { position: 'absolute', left: 0, top: 0 },
    field: { backgroundColor: '#DDF1FF', overflow: 'hidden', borderRadius: radius.lg },
    ground: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#B9E08F', borderTopWidth: 4, borderTopColor: '#8CC56A' },
    seed: { position: 'absolute', left: -12, top: -26, fontSize: 22 },
    hud: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    score: { fontFamily: fontFamilies.num, fontSize: 26, color: colors.ink[900] },
    hudSide: { fontSize: 18 },
    flash: { position: 'absolute', top: 54, alignSelf: 'center', fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: colors.grape[700] },
    countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
    count: { fontFamily: fontFamilies.num, fontSize: 72, color: colors.coral[500] },
    countNote: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[700] },
    over: { position: 'absolute', top: '35%', alignSelf: 'center', fontFamily: fontFamilies.display, fontSize: 40, color: '#7A5230' },
    bar: { flexDirection: 'row', gap: 8, paddingTop: 8 },
    pad: { backgroundColor: colors.card, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: colors.ink[200] },
    padText: { fontSize: 30, color: colors.ink[700] },
    abilityPad: { backgroundColor: colors.grape[300], borderBottomColor: colors.grape[500] },
    padOff: { opacity: 0.45 },
    abilityText: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: colors.ink[900] },
});
