// 펫의 방 — 벽·바닥·소품을 그리고, 그 안에서 펫이 혼자 논다. 펫을 누르거나 부르기 버튼을 누르면 쳐다본다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Polygon } from 'react-native-svg';
import { C, renderPart, shade, type Part } from './voxel';
import { bearModel, type Expr } from './bear';
import { PetView, makePetAnims } from './PetView';
import { PetBrain, type PetMode } from './brain';
import {
    makeSceneLayout, floorPoint, ROOM, WALL_H, CUSHION, BOWL, BOWL_FULL_PART, BALL_PART, BALL_START, POOP_PART, LETTER_PART, type SceneLayout,
} from './room';

const WALL = '#efe4d0';
const FLOOR = '#e2c79f';
/** 방에 비해 펫 크기 (나중에 아기·어린이·어른 단계별로 바꾼다) */
const PET_SCALE = 0.8;

export interface Poop { id: string; x: number; z: number }

interface Props {
    mode: PetMode;
    poops: Poop[];
    gone?: boolean;                       // 떠나고 편지만 남음
    onClean?: (id: string) => void;       // 똥을 톡 눌러 치움
    bowlFull?: boolean;                   // 밥그릇에 밥이 담겨 있다
    onAte?: () => void;                   // 펫이 밥을 다 먹었다
    /** 부르기 버튼을 눌렀을 때 바깥에서 호출할 수 있게 */
    callRef?: React.MutableRefObject<(() => void) | null>;
}

export function PetScene(props: Props) {
    const [width, setWidth] = useState(0);
    const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
    // 화면이 다시 그려질 때마다 새 배치를 만들면 펫이 처음부터 다시 시작된다
    const layout = useMemo(() => makeSceneLayout(width), [width]);
    return (
        <View onLayout={onLayout} style={{ width: '100%' }}>
            {width > 0 && <Room key={`${width}:${props.gone ? 'gone' : 'pet'}`} layout={layout} {...props} />}
        </View>
    );
}

function Room({ layout: l, callRef, mode, poops, gone, onClean, bowlFull = false, onAte }: Props & { layout: SceneLayout }) {
    const a = useMemo(makePetAnims, []);
    const [yaw, setYaw] = useState(0);
    const [expr, setExpr] = useState<Expr>('normal');
    const poopsRef = useRef(poops);
    poopsRef.current = poops;
    const bowlRef = useRef(bowlFull);
    bowlRef.current = bowlFull;
    const onAteRef = useRef(onAte);
    onAteRef.current = onAte;
    const [sparkles, setSparkles] = useState<{ id: string; at: [number, number] }[]>([]);
    const [petDepth, setPetDepth] = useState(30);
    const [ballDepth, setBallDepth] = useState(BALL_START.x + BALL_START.z);
    const [effects, setEffects] = useState<{ id: number; emoji: string }[]>([]);
    const effectId = useRef(0);

    // 공 위치와 굴러가는 회전
    const ball = useMemo(() => {
        const [sx, sy] = floorPoint(l, BALL_START.x, BALL_START.z);
        return { x: new Animated.Value(sx), y: new Animated.Value(sy), spin: new Animated.Value(0), pos: { ...BALL_START }, turns: 0 };
    }, [l]);

    const brain = useMemo(() => new PetBrain(a, {
        layout: l,
        setYaw,
        setExpr,
        setPetDepth,
        poops: () => poopsRef.current,
        bowlFull: () => bowlRef.current,
        ate: () => { bowlRef.current = false; onAteRef.current?.(); },
        effect: emoji => setEffects(list => [...list.slice(-3), { id: ++effectId.current, emoji }]),
        moveBall: (x, z, ms) => new Promise(res => {
            const [sx, sy] = floorPoint(l, x, z);
            const dist = Math.hypot(x - ball.pos.x, z - ball.pos.z);
            ball.turns += (x - z > ball.pos.x - ball.pos.z ? 1 : -1) * dist / 6;
            ball.pos = { x, z, r: BALL_START.r };
            setTimeout(() => setBallDepth(x + z), ms / 2);
            Animated.parallel([
                Animated.timing(ball.x, { toValue: sx, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(ball.y, { toValue: sy, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(ball.spin, { toValue: ball.turns, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]).start(() => res());
        }),
    }), [a, l, ball]);

    useEffect(() => {
        if (gone) return;
        brain.ball = { x: BALL_START.x, z: BALL_START.z };
        brain.start(mode);
        if (callRef) callRef.current = () => { void brain.call(); };
        return () => {
            brain.dispose();
            if (callRef) callRef.current = null;
        };
    }, [brain, callRef, gone]);
    useEffect(() => { if (!gone) brain.setMode(mode); }, [brain, mode, gone]);
    useEffect(() => { if (!gone && bowlFull) brain.feed(); }, [brain, bowlFull, gone]);

    const clean = (p: Poop) => {
        setSparkles(list => [...list, { id: p.id, at: floorPoint(l, p.x, p.z, 2) }]);
        onClean?.(p.id);
    };

    const cushionAt = useMemo(() => floorPoint(l, CUSHION.x, CUSHION.z), [l]);
    const bowlAt = useMemo(() => floorPoint(l, BOWL.x, BOWL.z), [l]);
    const origin = useMemo<[number, number]>(() => [0, 0], []);

    // 소품·공·펫을 뒤(작은 x + z)부터 그린다
    // 납작하고 넓은 물건은 가운데로 비교하면 위에 올라선 펫을 덮는다.
    // 쿠션·편지는 바닥 깔개처럼 늘 맨 아래, 밥그릇·똥은 뒤쪽 가장자리로 비교한다
    const FLOOR = -100;
    const things: { depth: number; el: React.ReactNode }[] = [
        { depth: FLOOR, el: <PropView key="cushion" part={CUSHION.part} at={cushionAt} kv={l.kv} /> },
        { depth: BOWL.x + BOWL.z - 5.2, el: <PropView key="bowl" part={bowlFull ? BOWL_FULL_PART : BOWL.part} at={bowlAt} kv={l.kv} /> },
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
            depth: FLOOR, el: <PropView key="letter" part={LETTER_PART} at={floorPoint(l, 15, 15)} kv={l.kv} />,
        } : {
            depth: petDepth + 0.5, el: (
                <PetView key="pet" model={bearModel(expr)} modelKey={`bear-${expr}`} yawIdx={yaw} kv={l.kv * PET_SCALE} a={a} onPress={() => { void brain.call(); }}>
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
            <RoomShell l={l} />
            {things.map(t => t.el)}
            {sparkles.map(sp => (
                <View key={sp.id} pointerEvents="none" style={{ position: 'absolute', left: sp.at[0], top: sp.at[1] }}>
                    <Effect emoji="✨" onDone={() => setSparkles(list => list.filter(x => x.id !== sp.id))} />
                </View>
            ))}
        </View>
    );
}

// 벽·바닥 (움직이지 않는다)
const RoomShell = React.memo(function RoomShell({ l }: { l: SceneLayout }) {
    const P = (x: number, y: number, z: number) => floorPoint(l, x, z, y).join(',');
    const poly = (pts: [number, number, number][]) => pts.map(([x, y, z]) => P(x, y, z)).join(' ');
    const S = ROOM, H = WALL_H, T = 1.2;
    const grid: [string, string][] = [];
    for (let i = 5; i < S; i += 5) {
        grid.push([P(i, 0, 0), P(i, 0, S)], [P(0, 0, i), P(S, 0, i)]);
    }
    return (
        <Svg width={l.width} height={l.height} style={StyleSheet.absoluteFill}>
            <Polygon points={poly([[0, 0, 0], [S, 0, 0], [S, H, 0], [0, H, 0]])} fill={WALL} />
            <Polygon points={poly([[0, 0, 0], [0, 0, S], [0, H, S], [0, H, 0]])} fill={shade(WALL, 0.92)} />
            {/* 창문 (오른쪽 벽) */}
            <Polygon points={poly([[15, 4, 0], [24, 4, 0], [24, 10.5, 0], [15, 10.5, 0]])} fill="#ffffff" />
            <Polygon points={poly([[15.6, 4.6, 0], [23.4, 4.6, 0], [23.4, 9.9, 0], [15.6, 9.9, 0]])} fill="#bfe3ff" />
            <Polygon points={poly([[19.3, 4.6, 0], [19.7, 4.6, 0], [19.7, 9.9, 0], [19.3, 9.9, 0]])} fill="#ffffff" />
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
const PropView = React.memo(function PropView({ part, at, kv, center }: { part: Part; at: [number, number]; kv: number; center?: boolean }) {
    const { polys, box } = useMemo(() => {
        const r = renderPart(part, 0, kv);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of r.polys) for (const pt of p.points.split(' ')) {
            const [x, y] = pt.split(',').map(Number);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        return { polys: r.polys, box: { x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, w: Math.ceil(x1 - x0) + 2, h: Math.ceil(y1 - y0) + 2 } };
    }, [part, kv]);
    // 공은 가운데를 축으로 돌아야 하므로 원점 기준 상자 안에 그린다
    return (
        <Svg width={box.w} height={box.h} pointerEvents="none"
            style={{ position: 'absolute', left: at[0] + box.x0, top: at[1] + box.y0, ...(center ? { left: box.x0, top: box.y0 } : null) }}>
            <G transform={`translate(${-box.x0},${-box.y0})`}>
                {polys.map((p, i) => <Polygon key={i} points={p.points} fill={p.fill} />)}
            </G>
        </Svg>
    );
});

// 똥 한 개 — 톡 누르면 치운다
function PoopView({ p, l, onPress }: { p: Poop; l: SceneLayout; onPress: () => void }) {
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
    effect: { position: 'absolute', left: -14, top: -24, width: 28, textAlign: 'center', fontSize: 22 },
});

