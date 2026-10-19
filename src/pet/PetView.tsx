// 펫 그림 — 부위마다 SVG 한 장씩 겹쳐 놓고, 부위별로 Animated transform 을 건다.
// 그림(다각형)은 방향(yaw)이 바뀔 때만 다시 만들고, 움직임은 네이티브 애니메이션이 맡는다.
import React, { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Ellipse, G, Polygon } from 'react-native-svg';
import { C, type PartRender } from './voxel';
import { petLayers } from './layers';
import type { PartId, PetModel } from './bear';

/** 펫 움직임 값 — 모두 네이티브 드라이버로 움직인다 */
export interface PetAnims {
    posX: Animated.Value;     // 발밑 화면 위치 (px)
    posY: Animated.Value;
    hop: Animated.Value;      // 폴짝 (px, 음수가 위)
    breath: Animated.Value;   // 0 ↔ 1 숨쉬기
    walk: Animated.Value;     // 0 → 1 걸음 한 주기 (멈추면 0)
    sit: Animated.Value;      // 0 서기, 1 앉기
    headDip: Animated.Value;  // 0 ~ 1 고개 숙이기 (냄새 맡기·먹기·졸기)
    headTilt: Animated.Value; // -1 ~ 1 고개 갸웃
    eyes: Animated.Value;     // 1 뜸, 0 감음
    earL: Animated.Value;     // -1 ~ 1 귀 쫑긋
    earR: Animated.Value;
    tail: Animated.Value;     // -1 ~ 1 꼬리 흔들기
    wave: Animated.Value;     // 0 ~ 1 손 흔들기 (팔 들기)
}

export function makePetAnims(): PetAnims {
    const v = (n = 0) => new Animated.Value(n);
    return {
        posX: v(), posY: v(), hop: v(), breath: v(), walk: v(), sit: v(), headDip: v(), headTilt: v(),
        eyes: v(1), earL: v(), earR: v(), tail: v(), wave: v(),
    };
}

/** 펫 그림 칸의 크기와 그 안에서 발밑 원점의 위치 */
export function petCanvas(model: PetModel, kv: number) {
    const m = 3;
    const left = (model.radius + m) * kv;
    const top = (model.height * C + model.radius * 0.71 + m) * kv;
    const bottom = (model.radius * 0.71 + m) * kv;
    return { width: left * 2, height: top + bottom, ox: left, oy: top };
}

interface Props {
    model: PetModel;
    modelKey: string;
    yawIdx: number;
    kv: number;
    a: PetAnims;
    children?: React.ReactNode;   // 머리 위 효과 (하트, Zz)
    onPress?: () => void;         // 펫을 톡 눌렀을 때
}

export function PetView({ model, modelKey, yawIdx, kv, a, children, onPress }: Props) {
    const cv = petCanvas(model, kv);
    const L = useMemo(() => petLayers(model, modelKey, yawIdx, kv), [model, modelKey, yawIdx, kv]);
    const u = C * kv;  // 높이 1칸의 화면 픽셀

    // 여러 부위가 같이 쓰는 움직임
    const t = useMemo(() => {
        const bob = a.walk.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -0.6 * u, 0, -0.6 * u, 0] });
        const sitY = a.sit.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5 * u] });
        const upper = Animated.add(sitY, bob);   // 몸통 위쪽 전체가 같이 내려가고 들썩인다
        const deg = (v: Animated.Value | Animated.AnimatedInterpolation<number>, d: number) =>
            v.interpolate({ inputRange: [-1, 1], outputRange: [`${-d}deg`, `${d}deg`] });
        const swing = a.walk.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 1, 0, -1, 0] });
        return {
            upper,
            bodyScale: a.breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
            // 어깨 들썩: 팔이 머리보다 조금 더 오르내린다
            armY: Animated.add(upper, a.breath.interpolate({ inputRange: [0, 1], outputRange: [0, -0.5 * u] })),
            headY: Animated.add(Animated.add(upper, a.breath.interpolate({ inputRange: [0, 1], outputRange: [0, -0.35 * u] })),
                a.headDip.interpolate({ inputRange: [0, 1], outputRange: [0, 1.1 * u] })),
            headRot: deg(a.headTilt, 10),
            legL: a.walk.interpolate({ inputRange: [0, 0.25, 0.5, 1], outputRange: [0, -0.9 * u, 0, 0] }),
            legR: a.walk.interpolate({ inputRange: [0, 0.5, 0.75, 1], outputRange: [0, 0, -0.9 * u, 0] }),
            legSquash: a.sit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }),
            armL: deg(swing, 16),
            armR: Animated.add(swing.interpolate({ inputRange: [-1, 1], outputRange: [16, -16] }),
                a.wave.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }))
                .interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }),
            earL: deg(a.earL, 18),
            earR: deg(a.earR, 18),
            tail: deg(a.tail, 25),
            eyes: a.eyes.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] }),
            containerY: Animated.add(a.posY, a.hop),
        };
    }, [a, u]);

    // 부위 한 장. origin: 그 부위가 돌거나 늘어나는 기준점
    const layer = (id: PartId, r: PartRender, transform: object[]) => (
        <Animated.View key={id} pointerEvents="none" style={[
            StyleSheet.absoluteFill,
            { transformOrigin: [cv.ox + r.pivot[0], cv.oy + r.pivot[1], 0], transform } as object,
        ]}>
            <Svg width={cv.width} height={cv.height}>
                <G transform={`translate(${cv.ox},${cv.oy})`}>
                    {r.polys.map((p, i) => <Polygon key={i} points={p.points} fill={p.fill} />)}
                </G>
            </Svg>
        </Animated.View>
    );

    const P = L.parts;
    const bodyLayer = (id: PartId) => {
        switch (id) {
            case 'legL': return layer(id, P[id], [{ translateY: t.legL }, { scaleY: t.legSquash }]);
            case 'legR': return layer(id, P[id], [{ translateY: t.legR }, { scaleY: t.legSquash }]);
            case 'body': return layer(id, P[id], [{ translateY: t.upper }, { scaleY: t.bodyScale }]);
            case 'tail': return layer(id, P[id], [{ translateY: t.upper }, { rotate: t.tail }]);
            case 'armL': return layer(id, P[id], [{ translateY: t.armY }, { rotate: t.armL }]);
            case 'armR': return layer(id, P[id], [{ translateY: t.armY }, { rotate: t.armR }]);
            default: return null;
        }
    };
    const headPart = (id: PartId) => {
        switch (id) {
            case 'eyeL': case 'eyeR': return layer(id, P[id], [{ scaleY: t.eyes }]);
            case 'earL': return layer(id, P[id], [{ rotate: t.earL }]);
            case 'earR': return layer(id, P[id], [{ rotate: t.earR }]);
            default: return layer(id, P[id], []);
        }
    };
    const neck = P.head.pivot;

    return (
        <Animated.View pointerEvents="box-none" style={{
            position: 'absolute', left: -cv.ox, top: -cv.oy, width: cv.width, height: cv.height,
            transform: [{ translateX: a.posX }, { translateY: t.containerY }],
        }}>
            {/* 그림자 — 폴짝 뛰어도 바닥에 남는다 */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateY: Animated.multiply(a.hop, -1) }] }]}>
                <Svg width={cv.width} height={cv.height}>
                    <Ellipse cx={cv.ox} cy={cv.oy} rx={model.radius * 0.9 * kv} ry={model.radius * 0.45 * kv} fill="rgba(60,40,20,0.16)" />
                </Svg>
            </Animated.View>
            {L.order.map(id => id === 'headGroup' ? (
                <Animated.View key="head" pointerEvents="none" style={[
                    StyleSheet.absoluteFill,
                    { transformOrigin: [cv.ox + neck[0], cv.oy + neck[1], 0], transform: [{ translateY: t.headY }, { rotate: t.headRot }] } as object,
                ]}>
                    {L.headOrder.map(headPart)}
                </Animated.View>
            ) : bodyLayer(id))}
            {onPress && (
                <Pressable onPress={onPress} hitSlop={10} style={{
                    position: 'absolute',
                    left: cv.ox - model.radius * kv, width: model.radius * 2 * kv,
                    top: cv.oy - (model.height * C + model.radius * 0.5) * kv, height: (model.height * C + model.radius) * kv,
                }} />
            )}
            <View pointerEvents="none" style={{ position: 'absolute', left: cv.ox, top: cv.oy - model.height * C * kv - 8 }}>
                {children}
            </View>
        </Animated.View>
    );
}
