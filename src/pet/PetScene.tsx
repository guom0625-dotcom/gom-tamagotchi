// 펫의 방 — 벽·바닥·소품을 그리고, 그 안에서 펫이 혼자 논다. 펫을 누르거나 부르기 버튼을 누르면 쳐다본다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Polygon } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import { C, renderPart, shade, type Part } from './voxel';
import { bearModel, type Expr, type Outfit } from './bear';
import { PetView, makePetAnims } from './PetView';
import { PetBrain, type PetMode } from './brain';
import {
    makeSceneLayout, floorPoint, ROOM_SIZES, poopSpot, WALL_H, CUSHION_PART, BOWL_PART, BOWL_FULL_PART, BALL_PART, POOP_PART, LETTER_PART, EGG_PART,
    DOLL_PART, BUBBLES_PART, TUNNEL_PART, SLIDE_PART, RUG_PART, PLANT_PART, CUSHION_BLUE_PART, WALLPAPERS, TOY_KEYS,
    ROBOT_PART, FEEDER_PART, FIRSTAID_PART, BED_PART, GADGET_KEYS,
    MOVABLE_KEYS, FLAT_KEYS, spotRef, footprint, layoutProblems, floorAt, movablePart,
    type SceneLayout, type ToyKey, type RoomLayout, type MovableKey, type Spot,
} from './room';
import { ITEMS } from './catalog';

const WALL = '#efe4d0';
const GADGET_PARTS = { robot: ROBOT_PART, feeder: FEEDER_PART, firstaid: FIRSTAID_PART, bed: BED_PART };
/** 청소기 움직임을 어디까지 보여 줬는지 (앱을 다시 켜도 같은 청소를 또 보여 주지 않게) */
const ROBOT_SEEN_KEY = 'pet_robot_seen';
const FLOOR = '#e2c79f';
export type Stage = 'egg' | 'baby' | 'teen' | 'adult';
/** 단계별 펫 크기 (방 칸 기준). 몸 생김새도 단계마다 다르다(bear.ts DIMS). 방도 넓어지니 화면에서는 덜 커 보인다 */
const STAGE_SCALE: Record<Exclude<Stage, 'egg'>, number> = { baby: 0.62, teen: 0.8, adult: 0.95 };

/** 서버의 똥: 자리 u, v 는 0~1 */
export interface Poop { id: string; u: number; v: number }
type PlacedPoop = { id: string; x: number; z: number };

/** 바깥(버튼)에서 펫에게 시키는 일 */
export interface PetControl {
    call: () => void;
    pat: () => void;
    snack: (emoji: string) => void;
    medicine: () => void;
    hospital: () => void;
}

/** 방 꾸미기: 방에 꺼내 놓은 장난감·가구·능력 물건 키, 붙인 벽지·쿠션 */
export interface RoomDecor { items: string[]; wallpaper: string | null; cushion: string | null }
const NO_DECOR: RoomDecor = { items: [], wallpaper: null, cushion: null };

interface Props {
    mode: PetMode;
    stage: Stage;
    roomLevel: number;
    poops: Poop[];
    gone?: boolean;                       // 떠나고 편지만 남음
    onClean?: (id: string) => void;       // 똥을 톡 눌러 치움
    bowlFull?: boolean;                   // 밥그릇에 밥이 담겨 있다
    onAte?: () => void;                   // 펫이 밥을 다 먹었다
    decor?: RoomDecor;
    /** 자동 청소기가 치운 똥 (서버) — 청소기가 다녀가는 모습을 보여 준다 */
    robotCleaned?: { id: string; u: number; v: number; at: number }[];
    /** 입은 옷 */
    outfit?: Outfit;
    /** 부르기·쓰다듬기 버튼을 눌렀을 때 바깥에서 호출할 수 있게 */
    ctrlRef?: React.MutableRefObject<PetControl | null>;
    /** 꾸미기로 정한 물건 자리 (서버) */
    placement?: RoomLayout;
    /** 꾸미기 중 — 펫 대신 물건을 끌어 옮기는 화면 */
    editing?: boolean;
    /** 꾸미기 끝: 저장할 자리, 취소면 null */
    onEditDone?: (layout: RoomLayout | null) => void;
}

export function PetScene(props: Props) {
    const [width, setWidth] = useState(0);
    const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
    // 화면이 다시 그려질 때마다 새 배치를 만들면 펫이 처음부터 다시 시작된다
    const placeKey = JSON.stringify(props.placement ?? {});
    const layout = useMemo(() => makeSceneLayout(width, props.roomLevel, props.placement), [width, props.roomLevel, placeKey]);
    const who = props.gone ? 'gone' : props.stage;
    return (
        <View onLayout={onLayout} style={{ width: '100%' }}>
            {width > 0 && (props.editing
                ? <EditRoom l={layout} decor={props.decor ?? NO_DECOR} saved={props.placement ?? {}} onDone={props.onEditDone ?? (() => {})} />
                : <Room key={`${width}:${props.roomLevel}:${who}:${placeKey}`} layout={layout} {...props} />)}
        </View>
    );
}

function Room({ layout: l, ctrlRef, mode, stage, poops: rawPoops, gone, onClean, bowlFull = false, onAte, decor = NO_DECOR, robotCleaned, outfit }: Props & { layout: SceneLayout }) {
    const R = l.room;
    const egg = stage === 'egg';
    const a = useMemo(makePetAnims, []);
    // 청소기가 치우러 가는 동안에는 서버에서 없어진 똥도 그 자리에 남겨 둔다
    const [ghosts, setGhosts] = useState<PlacedPoop[]>([]);
    const poops = useMemo<PlacedPoop[]>(() => [
        ...rawPoops.map(p => ({ id: p.id, ...poopSpot(R, p.u, p.v) })),
        ...ghosts.filter(g => !rawPoops.some(p => p.id === g.id)),
    ], [rawPoops, ghosts, R]);
    const [yaw, setYaw] = useState(0);
    const [expr, setExpr] = useState<Expr>('normal');
    const poopsRef = useRef(poops);
    poopsRef.current = poops;
    const bowlRef = useRef(bowlFull);
    bowlRef.current = bowlFull;
    const onAteRef = useRef(onAte);
    onAteRef.current = onAte;
    const [sparkles, setSparkles] = useState<{ id: string; at: [number, number] }[]>([]);
    const [petDepth, setPetDepth] = useState(R.size);
    const [ballDepth, setBallDepth] = useState(R.ball.x + R.ball.z);
    const [effects, setEffects] = useState<{ id: number; emoji: string }[]>([]);
    const effectId = useRef(0);
    const effect = (emoji: string) => setEffects(list => [...list.slice(-3), { id: ++effectId.current, emoji }]);
    // 방 안 아무 데나 떠오르는 그림 (비눗방울 등)
    const [floats, setFloats] = useState<{ id: number; at: [number, number]; emoji: string }[]>([]);
    const [hidden, setHidden] = useState(false);
    const [away, setAway] = useState(false);
    const toys = useMemo(() => TOY_KEYS.filter(k => decor.items.includes(k)), [decor.items]);
    const toysRef = useRef<ToyKey[]>(toys);
    toysRef.current = toys;
    // 돌아다닐 때 피할 물건 (장난감은 brain 이 따로 안다)
    const obstaclesRef = useRef<{ x: number; z: number; r: number }[]>([]);
    obstaclesRef.current = GADGET_KEYS.filter(k => decor.items.includes(k)).map(k => R.gadgets[k]);

    // 공 위치와 굴러가는 회전
    const ball = useMemo(() => {
        const [sx, sy] = floorPoint(l, R.ball.x, R.ball.z);
        return { x: new Animated.Value(sx), y: new Animated.Value(sy), spin: new Animated.Value(0), pos: { ...R.ball }, turns: 0 };
    }, [l]);

    const brain = useMemo(() => new PetBrain(a, {
        layout: l,
        setYaw,
        setExpr,
        setPetDepth,
        poops: () => poopsRef.current,
        bowlFull: () => bowlRef.current,
        ate: () => { bowlRef.current = false; onAteRef.current?.(); },
        effect,
        toys: () => toysRef.current,
        obstacles: () => obstaclesRef.current,
        setHidden,
        effectAt: (x, z, y, emoji) => setFloats(list => [...list.slice(-5), { id: ++effectId.current, at: floorPoint(l, x, z, y), emoji }]),
        moveBall: (x, z, ms) => new Promise(res => {
            const [sx, sy] = floorPoint(l, x, z);
            const dist = Math.hypot(x - ball.pos.x, z - ball.pos.z);
            ball.turns += (x - z > ball.pos.x - ball.pos.z ? 1 : -1) * dist / 6;
            ball.pos = { x, z, r: R.ball.r };
            setTimeout(() => setBallDepth(x + z), ms / 2);
            Animated.parallel([
                Animated.timing(ball.x, { toValue: sx, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(ball.y, { toValue: sy, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(ball.spin, { toValue: ball.turns, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]).start(() => res());
        }),
    }), [a, l, ball]);

    // 알: 흔들흔들
    const wobble = useRef(new Animated.Value(0)).current;
    const shakeEgg = (heart: boolean) => {
        if (heart) effect('💕');
        Animated.sequence([-1, 1, -0.7, 0.7, -0.3, 0].map(v =>
            Animated.timing(wobble, { toValue: v, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }))).start();
    };

    useEffect(() => {
        if (gone) return;
        if (egg) {
            const none = () => {};
            if (ctrlRef) ctrlRef.current = { call: () => shakeEgg(false), pat: () => shakeEgg(true), snack: none, medicine: none, hospital: none };
            // 가끔 혼자 꿈틀
            const id = setInterval(() => { if (Math.random() < 0.5) shakeEgg(false); }, 4000);
            return () => { clearInterval(id); if (ctrlRef) ctrlRef.current = null; };
        }
        brain.start(mode);
        let awayTimer: ReturnType<typeof setTimeout> | undefined;
        if (ctrlRef) ctrlRef.current = {
            call: () => { void brain.call(); },
            pat: () => { void brain.pat(); },
            snack: emoji => { void brain.snack(emoji); },
            medicine: () => { void brain.medicine(); },
            hospital: () => {
                // 🚑 뜬 뒤 잠깐 방을 비운다 (brain.hospital 과 시간을 맞춘다)
                awayTimer = setTimeout(() => { setAway(true); awayTimer = setTimeout(() => setAway(false), 3500); }, 500);
                void brain.hospital();
            },
        };
        return () => {
            clearTimeout(awayTimer);
            brain.dispose();
            if (ctrlRef) ctrlRef.current = null;
        };
    }, [brain, ctrlRef, gone, egg]);
    useEffect(() => { if (!gone && !egg) brain.setMode(mode); }, [brain, mode, gone, egg]);
    useEffect(() => { if (!gone && !egg && bowlFull) brain.feed(); }, [brain, bowlFull, gone, egg]);

    const clean = (p: PlacedPoop) => {
        setSparkles(list => [...list, { id: p.id, at: floorPoint(l, p.x, p.z, 2) }]);
        if (ghosts.some(g => g.id === p.id)) { setGhosts(list => list.filter(g => g.id !== p.id)); return; }
        onClean?.(p.id);
    };

    // ── 자동 청소기: 치운 똥 자리를 돌고, 한가할 땐 가끔 방을 돈다 ──
    const hasRobot = decor.items.includes('robot') && !gone;
    const robot = useMemo(() => {
        const [sx, sy] = floorPoint(l, R.gadgets.robot.x, R.gadgets.robot.z);
        return { x: new Animated.Value(sx), y: new Animated.Value(sy), pos: { x: R.gadgets.robot.x, z: R.gadgets.robot.z } };
    }, [l]);
    const [robotDepth, setRobotDepth] = useState(R.gadgets.robot.x + R.gadgets.robot.z);
    const robotQueue = useRef<{ id: string; x: number; z: number }[]>([]);
    const robotBusy = useRef(false);
    const robotAlive = useRef(true);
    useEffect(() => () => { robotAlive.current = false; robot.x.stopAnimation(); robot.y.stopAnimation(); }, [robot]);
    const prevPoopIds = useRef(new Set(rawPoops.map(p => p.id)));

    const drive = (x: number, z: number) => new Promise<void>(res => {
        const dist = Math.hypot(x - robot.pos.x, z - robot.pos.z);
        const ms = Math.max(300, dist / 5 * 1000);
        const [sx, sy] = floorPoint(l, x, z);
        setTimeout(() => { if (robotAlive.current) setRobotDepth(x + z); }, ms / 2);
        robot.pos = { x, z };
        Animated.parallel([
            Animated.timing(robot.x, { toValue: sx, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(robot.y, { toValue: sy, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]).start(() => res());
    });
    const pause = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

    const runRobot = async () => {
        if (robotBusy.current) return;
        robotBusy.current = true;
        try {
            while (robotAlive.current && robotQueue.current.length) {
                const t = robotQueue.current.shift()!;
                await drive(t.x, t.z);
                if (!robotAlive.current) return;
                setSparkles(list => [...list, { id: `r${t.id}`, at: floorPoint(l, t.x, t.z, 2) }]);
                setGhosts(list => list.filter(g => g.id !== t.id));
                await pause(500);
            }
            if (robotAlive.current) await drive(R.gadgets.robot.x, R.gadgets.robot.z);
        } finally {
            robotBusy.current = false;
        }
    };

    // 서버가 알려 준 청소기 청소 중 아직 안 보여 준 것을 줄 세운다
    useEffect(() => {
        if (!hasRobot) return;
        let cancelled = false;
        const prev = prevPoopIds.current;   // 바로 전까지 보이던 똥 (아래 효과가 곧 새 목록으로 바꾼다)
        (async () => {
            const seen = Number(await SecureStore.getItemAsync(ROBOT_SEEN_KEY).catch(() => null) ?? 0) || 0;
            if (cancelled) return;
            const fresh = (robotCleaned ?? []).filter(r => r.at > seen && !robotQueue.current.some(q => q.id === r.id));
            if (!fresh.length) return;
            const spots = fresh.map(r => ({ id: r.id, ...poopSpot(R, r.u, r.v) }));
            // 방금까지 보이던 똥이면 청소기가 갈 때까지 남겨 둔다
            setGhosts(list => [...list, ...spots.filter(s => prev.has(s.id) && !list.some(g => g.id === s.id))]);
            robotQueue.current.push(...spots);
            await SecureStore.setItemAsync(ROBOT_SEEN_KEY, String(Math.max(...fresh.map(r => r.at)))).catch(() => {});
            void runRobot();
        })();
        return () => { cancelled = true; };
    }, [robotCleaned, hasRobot]);
    useEffect(() => { prevPoopIds.current = new Set(rawPoops.map(p => p.id)); }, [rawPoops]);

    // 한가할 때 가끔 방을 한 바퀴
    useEffect(() => {
        if (!hasRobot) return;
        const id = setInterval(() => {
            if (robotBusy.current || Math.random() < 0.5) return;
            robotBusy.current = true;
            void (async () => {
                try {
                    for (let i = 0; i < 2 && robotAlive.current; i++) {
                        await drive(R.walkMin + Math.random() * (R.walkMax - R.walkMin), R.walkMin + Math.random() * (R.walkMax - R.walkMin));
                        await pause(400);
                    }
                    if (robotAlive.current) await drive(R.gadgets.robot.x, R.gadgets.robot.z);
                } finally {
                    robotBusy.current = false;
                    if (robotQueue.current.length) void runRobot();
                }
            })();
        }, 45_000);
        return () => clearInterval(id);
    }, [hasRobot]);

    const cushionAt = useMemo(() => floorPoint(l, R.cushion.x, R.cushion.z), [l]);
    const eggAt = useMemo(() => floorPoint(l, R.cushion.x, R.cushion.z, 1.2), [l]);
    const bowlAt = useMemo(() => floorPoint(l, R.bowl.x, R.bowl.z), [l]);
    const origin = useMemo<[number, number]>(() => [0, 0], []);
    const at = (s: { x: number; z: number }) => floorPoint(l, s.x, s.z);
    const rotOf = (s: Spot) => ((s.rot ?? 0) * Math.PI) / 2;
    const T = R.toys;
    const has = (k: string) => decor.items.includes(k);

    // 소품·공·펫을 뒤(작은 x + z)부터 그린다
    // 납작하고 넓은 물건은 가운데로 비교하면 위에 올라선 펫을 덮는다.
    // 쿠션·편지는 바닥 깔개처럼 늘 맨 아래, 밥그릇·똥은 뒤쪽 가장자리로 비교한다
    const FLOOR = -100;
    const things: { depth: number; el: React.ReactNode }[] = [
        ...(has('rug') ? [{ depth: FLOOR - 1, el: <PropView key="rug" part={RUG_PART} at={at(R.rug)} kv={l.kv} yaw={rotOf(R.rug)} /> }] : []),
        { depth: FLOOR, el: <PropView key="cushion" part={decor.cushion === 'cushion_blue' ? CUSHION_BLUE_PART : CUSHION_PART} at={cushionAt} kv={l.kv} yaw={rotOf(R.cushion)} /> },
        ...(has('plant') ? [{ depth: R.plant.x + R.plant.z, el: <PropView key="plant" part={PLANT_PART} at={at(R.plant)} kv={l.kv} yaw={rotOf(R.plant)} /> }] : []),
        ...(has('doll') ? [{ depth: T.doll.x + T.doll.z - 1, el: <PropView key="doll" part={DOLL_PART} at={at(T.doll)} kv={l.kv} yaw={rotOf(T.doll)} /> }] : []),
        ...(has('bubbles') ? [{ depth: T.bubbles.x + T.bubbles.z - 1.5, el: <PropView key="bubbles" part={BUBBLES_PART} at={at(T.bubbles)} kv={l.kv} yaw={rotOf(T.bubbles)} /> }] : []),
        ...(has('tunnel') ? [{ depth: T.tunnel.x + T.tunnel.z, el: <PropView key="tunnel" part={TUNNEL_PART} at={at(T.tunnel)} kv={l.kv} yaw={rotOf(T.tunnel)} /> }] : []),
        ...(has('slide') ? [{ depth: T.slide.x + T.slide.z, el: <PropView key="slide" part={SLIDE_PART} at={at(T.slide)} kv={l.kv} yaw={rotOf(T.slide)} /> }] : []),
        ...(hasRobot ? [{
            depth: robotDepth - 0.5, el: (
                <Animated.View key="robot" pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX: robot.x }, { translateY: robot.y }] }}>
                    <PropView part={ROBOT_PART} at={origin} kv={l.kv} center yaw={rotOf(R.gadgets.robot)} />
                </Animated.View>
            ),
        }] : []),
        ...GADGET_KEYS.filter(k => k !== 'robot' && has(k)).map(k => ({
            depth: R.gadgets[k].x + R.gadgets[k].z - (k === 'bed' ? 2 : 1),
            el: <PropView key={k} part={GADGET_PARTS[k]} at={at(R.gadgets[k])} kv={l.kv} yaw={rotOf(R.gadgets[k])} />,
        })),
        { depth: R.bowl.x + R.bowl.z - 5.2, el: <PropView key="bowl" part={bowlFull ? BOWL_FULL_PART : BOWL_PART} at={bowlAt} kv={l.kv} yaw={rotOf(R.bowl)} /> },
        {
            depth: ballDepth, el: (
                <Animated.View key="ball" pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX: ball.x }, { translateY: ball.y }] }}>
                    {/* 공 가운데(바닥에서 1.5칸 위)를 축으로 돈다 */}
                    <Animated.View style={{ transformOrigin: [0, -1.5 * C * l.kv, 0], transform: [{ rotate: ball.spin.interpolate({ inputRange: [-100, 100], outputRange: ['-36000deg', '36000deg'] }) }] }}>
                        <PropView part={BALL_PART} at={origin} kv={l.kv} center />
                    </Animated.View>
                </Animated.View>
            ),
        },
        ...poops.map(p => ({
            depth: p.x + p.z - 3.2, el: <PoopView key={p.id} p={p} l={l} onPress={() => clean(p)} />,
        })),
        gone ? {
            depth: FLOOR, el: <PropView key="letter" part={LETTER_PART} at={floorPoint(l, R.size / 2, R.size / 2)} kv={l.kv} />,
        } : egg ? {
            depth: R.cushion.x + R.cushion.z, el: (
                <EggView key="egg" at={eggAt} kv={l.kv} wobble={wobble} onPress={() => shakeEgg(false)}>
                    {effects.map(e => (
                        <Effect key={e.id} emoji={e.emoji} onDone={() => setEffects(list => list.filter(x => x.id !== e.id))} />
                    ))}
                </EggView>
            ),
        } : hidden ? {
            depth: FLOOR, el: null,
        } : {
            depth: petDepth + 0.5, el: (
                <PetView key="pet" model={bearModel(expr, stage as Exclude<Stage, 'egg'>, outfit)} modelKey={`bear-${expr}-${stage}-${outfit?.top ?? ''}-${outfit?.hat ?? ''}`} yawIdx={yaw} kv={l.kv * STAGE_SCALE[stage as Exclude<Stage, 'egg'>]} a={a} onPress={() => { void brain.call(); }}>
                    {effects.map(e => (
                        <Effect key={e.id} emoji={e.emoji} onDone={() => setEffects(list => list.filter(x => x.id !== e.id))} />
                    ))}
                </PetView>
            ),
        },
    ];
    things.sort((p, q) => p.depth - q.depth);

    return (
        <View style={{ width: l.width, height: l.height }}>
            <RoomShell l={l} wallpaper={decor.wallpaper} curtain={has('curtain')} />
            {things.map(t => t.el)}
            {sparkles.map(sp => (
                <View key={sp.id} pointerEvents="none" style={{ position: 'absolute', left: sp.at[0], top: sp.at[1] }}>
                    <Effect emoji="✨" onDone={() => setSparkles(list => list.filter(x => x.id !== sp.id))} />
                </View>
            ))}
            {floats.map(f => (
                <View key={f.id} pointerEvents="none" style={{ position: 'absolute', left: f.at[0], top: f.at[1] }}>
                    <Effect emoji={f.emoji} onDone={() => setFloats(list => list.filter(x => x.id !== f.id))} />
                </View>
            ))}
            {away && (
                <View pointerEvents="none" style={styles.awayWrap}>
                    <Animated.Text style={styles.away}>🏥 병원에 다녀오는 중…</Animated.Text>
                </View>
            )}
        </View>
    );
}

// ── 꾸미기: 물건을 눌러 고르고 끌어서 옮긴다. ↻ 로 90°씩 돌린다 ──
const NAMES: Record<string, string> = { cushion: '쿠션', bowl: '밥그릇' };
const snap = (v: number) => Math.round(v * 2) / 2;

function EditRoom({ l, decor, saved, onDone }: {
    l: SceneLayout; decor: RoomDecor; saved: RoomLayout; onDone: (layout: RoomLayout | null) => void;
}) {
    // 쿠션·밥그릇은 늘 방에 있다 (창고에 못 넣는다)
    const keys = useMemo(() => MOVABLE_KEYS.filter(k => k === 'cushion' || k === 'bowl' || decor.items.includes(k)), [decor.items.join(',')]);
    const start = () => Object.fromEntries(keys.map(k => {
        const sp = spotRef(l.room, k)!;
        return [k, { x: sp.x, z: sp.z, rot: sp.rot ?? 0 }];
    })) as Record<MovableKey, { x: number; z: number; rot: number }>;
    const [pos, setPos] = useState(start);
    const [sel, setSel] = useState<MovableKey | null>(null);
    // 지금 자리를 넣은 방 (겹침 검사용)
    const spec = useMemo(() => {
        const r = JSON.parse(JSON.stringify(l.room)) as SceneLayout['room'];
        for (const k of keys) Object.assign(spotRef(r, k)!, pos[k]);
        return r;
    }, [l, keys, pos]);
    const bad = useMemo(() => layoutProblems(spec, keys), [spec, keys]);

    const posRef = useRef(pos); posRef.current = pos;
    const specRef = useRef(spec); specRef.current = spec;
    const drag = useRef<{ key: MovableKey; x: number; z: number } | null>(null);
    const pan = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: e => {
            const [fx, fz] = floorAt(l, e.nativeEvent.locationX, e.nativeEvent.locationY);
            // 키 큰 물건은 윗부분을 눌러도 잡히게, 눌린 곳에서 화면 아래(바닥 앞쪽)로 조금씩 내려가며 찾는다
            let hit: MovableKey | null = null;
            for (let d = 0; d <= 4 && !hit; d += 1) {
                const px = fx + d, pz = fz + d;
                const found = keys.map(k => ({ k, r: footprint(k, spotRef(specRef.current, k)!) }))
                    .filter(({ r }) => px > r.x0 - 0.5 && px < r.x1 + 0.5 && pz > r.z0 - 0.5 && pz < r.z1 + 0.5)
                    .sort((a, b) => (FLAT_KEYS.has(a.k) ? 1 : 0) - (FLAT_KEYS.has(b.k) ? 1 : 0)
                        || (a.r.x1 - a.r.x0) * (a.r.z1 - a.r.z0) - (b.r.x1 - b.r.x0) * (b.r.z1 - b.r.z0));
                hit = found[0]?.k ?? null;
            }
            if (hit) {
                setSel(hit);
                drag.current = { key: hit, x: posRef.current[hit].x, z: posRef.current[hit].z };
            } else {
                drag.current = null;
            }
        },
        onPanResponderMove: (_e, g) => {
            const d = drag.current;
            if (!d) return;
            const a = g.dx / (C * l.kv), b = (2 * g.dy) / l.kv;
            const size = l.room.size;
            const x = Math.max(0, Math.min(size, snap(d.x + (a + b) / 2)));
            const z = Math.max(0, Math.min(size, snap(d.z + (b - a) / 2)));
            setPos(p => (p[d.key].x === x && p[d.key].z === z ? p : { ...p, [d.key]: { ...p[d.key], x, z } }));
        },
        onPanResponderRelease: () => { drag.current = null; },
    }), [l, keys]);

    const rotate = () => sel && setPos(p => ({ ...p, [sel]: { ...p[sel], rot: (p[sel].rot + 1) & 3 } }));
    const reset = () => {
        // 처음 정해진 자리로 (저장한 자리를 뺀 기본 배치)
        const base = makeSceneLayout(l.width, ROOM_LEVEL_OF(l.room.size));
        setPos(Object.fromEntries(keys.map(k => {
            const sp = spotRef(base.room, k)!;
            return [k, { x: sp.x, z: sp.z, rot: 0 }];
        })) as typeof pos);
    };

    const FLOORD = -100;
    const depthOf = (k: MovableKey) => {
        const p = pos[k];
        if (k === 'rug') return FLOORD - 1;
        if (k === 'cushion') return FLOORD;
        return p.x + p.z - (k === 'bowl' ? 5.2 : k === 'bed' ? 2 : k === 'bubbles' ? 1.5 : 1);
    };
    const partFor = (k: MovableKey) => k === 'cushion' && decor.cushion === 'cushion_blue' ? CUSHION_BLUE_PART : movablePart(k);
    const rect = (k: MovableKey) => {
        const r = footprint(k, spotRef(spec, k)!);
        return [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([x, z]) => floorPoint(l, x, z).join(',')).join(' ');
    };
    const name = (k: MovableKey) => NAMES[k] ?? ITEMS[k]?.name ?? k;

    return (
        <View>
            <View style={{ width: l.width, height: l.height }}>
                <RoomShell l={l} wallpaper={decor.wallpaper} curtain={decor.items.includes('curtain')} />
                <Svg width={l.width} height={l.height} style={StyleSheet.absoluteFill} pointerEvents="none">
                    {keys.filter(k => k === sel || bad.has(k)).map(k => (
                        <Polygon key={k} points={rect(k)} fill={bad.has(k) ? 'rgba(230,70,70,0.35)' : 'rgba(80,190,120,0.35)'}
                            stroke={bad.has(k) ? '#d84a4a' : '#3fa66a'} strokeWidth={1.5} />
                    ))}
                </Svg>
                {[...keys].sort((a, b) => depthOf(a) - depthOf(b)).map(k => (
                    <PropView key={k} part={partFor(k)} at={floorPoint(l, pos[k].x, pos[k].z)} kv={l.kv} yaw={(pos[k].rot * Math.PI) / 2}
                        tint={sel && sel !== k ? 0.75 : undefined} />
                ))}
                <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
            </View>
            <View style={styles.editBar}>
                <Text style={styles.editHint}>
                    {bad.size ? '빨간 물건은 겹치거나 벽에 닿았어요' : sel ? `${name(sel)} — 끌어서 옮기고 ↻ 로 돌려요` : '물건을 눌러 고르고 끌어서 옮겨요'}
                </Text>
                <View style={styles.editRow}>
                    <TouchableOpacity style={[styles.editBtn, !sel && styles.editOff]} disabled={!sel} onPress={rotate}>
                        <Text style={styles.editBtnText}>↻ 돌리기</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={reset}>
                        <Text style={styles.editBtnText}>처음 자리로</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={() => onDone(null)}>
                        <Text style={styles.editBtnText}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.editBtn, styles.editSave, bad.size > 0 && styles.editOff]} disabled={bad.size > 0}
                        onPress={() => onDone({ ...saved, ...pos })}>
                        <Text style={[styles.editBtnText, { color: '#fff' }]}>저장</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}
const ROOM_LEVEL_OF = (size: number) => Math.max(0, ROOM_SIZES.indexOf(size));

// 벽·바닥 (움직이지 않는다)
const RoomShell = React.memo(function RoomShell({ l, wallpaper, curtain }: { l: SceneLayout; wallpaper: string | null; curtain: boolean }) {
    const P = (x: number, y: number, z: number) => floorPoint(l, x, z, y).join(',');
    const poly = (pts: [number, number, number][]) => pts.map(([x, y, z]) => P(x, y, z)).join(' ');
    const S = l.room.size, H = WALL_H, T = 1.2;
    const wx = Math.round(S / 2);   // 창문 왼쪽 끝
    const wp = wallpaper ? WALLPAPERS[wallpaper] : undefined;
    const wall = wp?.base ?? WALL;
    // 벽지 무늬: 세로 줄무늬 또는 물방울 (오른쪽 벽 z=0, 왼쪽 벽 x=0)
    const pattern: string[] = [];
    if (wp?.kind === 'stripe') {
        for (let i = 1; i < S; i += 2.5) {
            pattern.push(poly([[i, 0, 0], [i + 1, 0, 0], [i + 1, H, 0], [i, H, 0]]), poly([[0, 0, i], [0, 0, i + 1], [0, H, i + 1], [0, H, i]]));
        }
    } else if (wp?.kind === 'dot') {
        for (let i = 2; i < S; i += 3) for (let y = 2 + (i % 2); y < H; y += 3) {
            pattern.push(poly([[i, y, 0], [i + 0.6, y, 0], [i + 0.6, y + 0.6, 0], [i, y + 0.6, 0]]), poly([[0, y, i], [0, y, i + 0.6], [0, y + 0.6, i + 0.6], [0, y + 0.6, i]]));
        }
    }
    const grid: [string, string][] = [];
    for (let i = 5; i < S; i += 5) {
        grid.push([P(i, 0, 0), P(i, 0, S)], [P(0, 0, i), P(S, 0, i)]);
    }
    return (
        <Svg width={l.width} height={l.height} style={StyleSheet.absoluteFill}>
            <Polygon points={poly([[0, 0, 0], [S, 0, 0], [S, H, 0], [0, H, 0]])} fill={wall} />
            <Polygon points={poly([[0, 0, 0], [0, 0, S], [0, H, S], [0, H, 0]])} fill={shade(wall, 0.92)} />
            {wp && pattern.map((pts, i) => <Polygon key={`p${i}`} points={pts} fill={i % 2 ? shade(wp.pattern, 0.95) : wp.pattern} />)}
            {/* 창문 (오른쪽 벽) */}
            <Polygon points={poly([[wx, 4, 0], [wx + 9, 4, 0], [wx + 9, 10.5, 0], [wx, 10.5, 0]])} fill="#ffffff" />
            <Polygon points={poly([[wx + 0.6, 4.6, 0], [wx + 8.4, 4.6, 0], [wx + 8.4, 9.9, 0], [wx + 0.6, 9.9, 0]])} fill="#bfe3ff" />
            <Polygon points={poly([[wx + 4.3, 4.6, 0], [wx + 4.7, 4.6, 0], [wx + 4.7, 9.9, 0], [wx + 4.3, 9.9, 0]])} fill="#ffffff" />
            {curtain && <>
                <Polygon points={poly([[wx - 1.2, 11, 0], [wx + 10.2, 11, 0], [wx + 10.2, 11.4, 0], [wx - 1.2, 11.4, 0]])} fill="#a0785a" />
                <Polygon points={poly([[wx - 1, 3.2, 0], [wx + 1.6, 3.2, 0], [wx + 1.6, 11, 0], [wx - 1, 11, 0]])} fill="#f4a6b8" />
                <Polygon points={poly([[wx + 7.4, 3.2, 0], [wx + 10, 3.2, 0], [wx + 10, 11, 0], [wx + 7.4, 11, 0]])} fill="#f4a6b8" />
                <Polygon points={poly([[wx + 0.2, 3.2, 0], [wx + 0.5, 3.2, 0], [wx + 0.5, 11, 0], [wx + 0.2, 11, 0]])} fill="#e88ea3" />
                <Polygon points={poly([[wx + 8.6, 3.2, 0], [wx + 8.9, 3.2, 0], [wx + 8.9, 11, 0], [wx + 8.6, 11, 0]])} fill="#e88ea3" />
            </>}
            {/* 액자 (왼쪽 벽) */}
            <Polygon points={poly([[0, 6, 8], [0, 6, 14], [0, 10, 14], [0, 10, 8]])} fill="#c99f74" />
            <Polygon points={poly([[0, 6.5, 8.6], [0, 6.5, 13.4], [0, 9.5, 13.4], [0, 9.5, 8.6]])} fill="#ffe9a8" />
            <Polygon points={poly([[0, 0, 0], [S, 0, 0], [S, 0, S], [0, 0, S]])} fill={FLOOR} />
            {grid.map(([p, q], i) => {
                const [x1, y1] = p.split(',').map(Number), [x2, y2] = q.split(',').map(Number);
                return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={shade(FLOOR, 0.9)} strokeWidth={0.8} />;
            })}
            {/* 바닥 두께 */}
            <Polygon points={poly([[S, 0, 0], [S, 0, S], [S, -T, S], [S, -T, 0]])} fill={shade(FLOOR, 0.75)} />
            <Polygon points={poly([[0, 0, S], [S, 0, S], [S, -T, S], [0, -T, S]])} fill={shade(FLOOR, 0.65)} />
        </Svg>
    );
});

// 소품 한 개. at: 바닥 위 놓인 자리 (화면 px). center 면 자리 대신 자기 칸 원점에 그린다
const PropView = React.memo(function PropView({ part, at, kv, center, yaw = 0, tint }: {
    part: Part; at: [number, number]; kv: number; center?: boolean; yaw?: number; tint?: number;
}) {
    const { polys, box } = useMemo(() => {
        const r = renderPart(part, yaw, kv);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of r.polys) for (const pt of p.points.split(' ')) {
            const [x, y] = pt.split(',').map(Number);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        return { polys: r.polys, box: { x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, w: Math.ceil(x1 - x0) + 2, h: Math.ceil(y1 - y0) + 2 } };
    }, [part, kv, yaw]);
    // 공은 가운데를 축으로 돌아야 하므로 원점 기준 상자 안에 그린다
    return (
        <Svg width={box.w} height={box.h} pointerEvents="none"
            style={{ position: 'absolute', left: at[0] + box.x0, top: at[1] + box.y0, ...(center ? { left: box.x0, top: box.y0 } : null), ...(tint !== undefined ? { opacity: tint } : null) }}>
            <G transform={`translate(${-box.x0},${-box.y0})`}>
                {polys.map((p, i) => <Polygon key={i} points={p.points} fill={p.fill} />)}
            </G>
        </Svg>
    );
});

// 똥 한 개 — 톡 누르면 치운다
function PoopView({ p, l, onPress }: { p: PlacedPoop; l: SceneLayout; onPress: () => void }) {
    const at = useMemo(() => floorPoint(l, p.x, p.z), [l, p.x, p.z]);
    const size = 5 * l.kv;
    return (
        <>
            <PropView part={POOP_PART} at={at} kv={l.kv} />
            <Pressable onPress={onPress} hitSlop={8}
                style={{ position: 'absolute', left: at[0] - size / 2, top: at[1] - size * 0.75, width: size, height: size }} />
        </>
    );
}

// 알 — 쿠션 위에서 흔들흔들. 바닥 가운데를 축으로 기운다
function EggView({ at, kv, wobble, onPress, children }: {
    at: [number, number]; kv: number; wobble: Animated.Value; onPress: () => void; children?: React.ReactNode;
}) {
    const h = 7.2 * C * kv, w = 6 * kv;
    return (
        <Animated.View pointerEvents="box-none" style={{
            position: 'absolute', left: at[0] - w / 2, top: at[1] - h - w / 2, width: w, height: h + w / 2,
            transformOrigin: [w / 2, h + w / 4, 0],
            transform: [{ rotate: wobble.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) }],
        }}>
            <PropView part={EGG_PART} at={[w / 2, h + w / 2]} kv={kv} />
            <Pressable onPress={onPress} style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={{ position: 'absolute', left: w / 2, top: 0 }}>{children}</View>
        </Animated.View>
    );
}

// 머리 위로 떠올랐다 사라지는 그림 (💕, ❗, 💤)
function Effect({ emoji, onDone }: { emoji: string; onDone: () => void }) {
    const v = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(onDone);
    }, []);
    return (
        <Animated.Text style={[styles.effect, {
            opacity: v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -36] }) },
                { scale: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.15, 1] }) },
            ],
        }]}>{emoji}</Animated.Text>
    );
}

const styles = StyleSheet.create({
    awayWrap: { position: 'absolute', left: 0, right: 0, top: '40%', alignItems: 'center' },
    away: {
        backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
        fontSize: 15, color: '#3a4254', overflow: 'hidden',
    },
    effect: { position: 'absolute', left: -14, top: -24, width: 28, textAlign: 'center', fontSize: 22 },
    editBar: { paddingHorizontal: 8, paddingTop: 6, gap: 8 },
    editHint: { textAlign: 'center', fontSize: 13, color: '#5a6274' },
    editRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
    editBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#d8dce4' },
    editSave: { backgroundColor: '#3fa66a', borderColor: '#3fa66a' },
    editOff: { opacity: 0.4 },
    editBtnText: { fontSize: 14, color: '#3a4254', fontWeight: '600' },
});

