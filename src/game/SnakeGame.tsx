// 🐍 놀아주기 — 고전 뱀 게임 (2026-11-03 사용자 결정).
// 칸 단위로 움직이고, 화면을 위·아래·왼쪽·오른쪽으로 밀어 방향을 바꾼다. 🍎 사과를 먹으면 무작위 아기 동물이 꼬리에 한 마리씩 붙는다.
// 울타리나 내 줄에 부딪히면 끝. 동물별 능력은 없다. 점수 = 먹은 사과 수.
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { petModel } from '../pet/model';
import { KINDS, SPECIES } from '../pet/species';
import { buildPet, cloneRig, poseFall, poseIdle, poseRun, type PetRig } from '../game3d/petMesh';
import { COLS, ROWS, Yard, cellX, cellZ } from '../game3d/yard';
import { SKY } from '../game3d/world';
import type { GameChar } from './RunGame';
import { fontFamilies, fontSizes } from '../theme';

export interface SnakeResult { ms: number; score: number }

interface Props {
    char: GameChar;
    onOver: (r: SnakeResult) => void;
}

const COUNT_S = 3;            // 3·2·1
const HEAD_H = 1.75;          // 머리(내 펫) 키 (칸 = 1m)
const TAIL_H = 1.4;           // 따라오는 아기 동물 키
const SPEED0 = 3.6;           // 처음 빠르기 (칸/초)
const SPEED_UP = 0.12;        // 사과 하나마다
const SPEED_MAX = 8;
const SWIPE = 22;             // 이만큼(px) 밀면 방향을 바꾼다

type Dir = 0 | 1 | 2 | 3;     // 위 오른쪽 아래 왼쪽
const DC = [0, 1, 0, -1], DR = [-1, 0, 1, 0];
// 펫 모델은 -z(위)를 본다. 오른쪽(+x)을 보려면 -90°
const YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

interface Seg { rig: PetRig; c: number; r: number; pc: number; pr: number; yaw: number; born: number }

export function SnakeGame({ char, onOver }: Props) {
    const [hud, setHud] = useState({ score: 0, count: 3, dead: false });
    const onOverRef = useRef(onOver);
    onOverRef.current = onOver;
    const stopRef = useRef<() => void>(() => {});
    // 밀기: 손가락이 움직인 방향을 차례로 쌓는다 (빨리 두 번 꺾어도 놓치지 않게 2개까지)
    const input = useRef({ x: 0, y: 0, queue: [] as Dir[] });
    const onStart = (e: { nativeEvent: { pageX: number; pageY: number } }) => { input.current.x = e.nativeEvent.pageX; input.current.y = e.nativeEvent.pageY; };
    const onMove = (e: { nativeEvent: { pageX: number; pageY: number } }) => {
        const I = input.current;
        const dx = e.nativeEvent.pageX - I.x, dy = e.nativeEvent.pageY - I.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
        const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
        if (I.queue[I.queue.length - 1] !== d && I.queue.length < 2) I.queue.push(d);
        I.x = e.nativeEvent.pageX; I.y = e.nativeEvent.pageY;
    };

    useEffect(() => () => stopRef.current(), []);

    const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const canvas = {
            width: W, height: H, style: {}, clientHeight: H,
            addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
        } as unknown as HTMLCanvasElement;
        const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(1);
        renderer.setSize(W, H, false);

        const yard = new Yard(W / H);
        const scene = yard.scene;
        const headRig = buildPet(petModel(char.species, char.variant, 'happy', char.stage, char.outfit ?? {}, char.build), HEAD_H);
        headRig.root.add(yard.makeShadow(0.45));
        // 아기 동물 그림은 모습마다 한 번만 만들고 복사해 쓴다
        const templates = new Map<string, PetRig>();
        const babyRig = () => {
            const sp = SPECIES[Math.floor(Math.random() * SPECIES.length)];
            const v = Math.floor(Math.random() * KINDS[sp].looks.length);
            const key = `${sp}:${v}`;
            let t = templates.get(key);
            if (!t) { t = buildPet(petModel(sp, v, 'happy', 'baby'), TAIL_H); templates.set(key, t); }
            const rig = cloneRig(t);
            rig.root.add(yard.makeShadow(0.38));
            return rig;
        };

        const c0 = Math.floor(COLS / 2), r0 = ROWS - 4;
        const segs: Seg[] = [{ rig: headRig, c: c0, r: r0, pc: c0, pr: r0, yaw: 0, born: -99 }];
        scene.add(headRig.root);
        const st = { t: -COUNT_S, dir: 0 as Dir, acc: 0, speed: SPEED0, score: 0, apple: [0, 0], deadAt: 0, phase: 0, shown: '' };

        const placeApple = () => {
            const used = new Set(segs.map(s => `${s.c},${s.r}`));
            const free: [number, number][] = [];
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!used.has(`${c},${r}`)) free.push([c, r]);
            if (!free.length) return false;
            const [c, r] = free[Math.floor(Math.random() * free.length)];
            st.apple = [c, r];
            yard.apple.position.set(cellX(c), 0, cellZ(r));
            return true;
        };
        // 첫 사과는 위쪽 어딘가
        st.apple = [Math.floor(Math.random() * COLS), 2 + Math.floor(Math.random() * 4)];
        yard.apple.position.set(cellX(st.apple[0]), 0, cellZ(st.apple[1]));

        let raf = 0, last = Date.now(), stopped = false, overSent = false;
        const stop = () => {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(raf);
            sub.remove();
            headRig.dispose(); templates.forEach(t => t.dispose()); yard.dispose(); renderer.dispose();
        };
        stopRef.current = stop;
        const sub = AppState.addEventListener('change', x => { if (x !== 'active' && st.t > 0) die(); });

        function die() {
            if (st.deadAt) return;
            st.deadAt = Date.now();
            const r: SnakeResult = { ms: Math.round(Math.max(0, st.t) * 1000), score: st.score };
            setTimeout(() => { if (!overSent) { overSent = true; onOverRef.current(r); } }, 1500);
        }

        /** 한 칸 나아가기 */
        const step = () => {
            const q = input.current.queue;
            while (q.length) {
                const d = q.shift()!;
                // 줄이 있으면 바로 뒤로 돌 수 없다
                if (segs.length > 1 && (d + 2) % 4 === st.dir) continue;
                st.dir = d; break;
            }
            const h = segs[0];
            const nc = h.c + DC[st.dir], nr = h.r + DR[st.dir];
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) { die(); return; }
            const eat = nc === st.apple[0] && nr === st.apple[1];
            // 꼬리 끝은 이번에 비켜 주므로 (먹지 않으면) 부딪히지 않는다
            const body = eat ? segs : segs.slice(0, -1);
            if (body.some(s => s.c === nc && s.r === nr)) { die(); return; }
            const tail = segs[segs.length - 1];
            const tc = tail.c, tr = tail.r;
            for (let i = segs.length - 1; i > 0; i--) {
                const s = segs[i], p = segs[i - 1];
                s.pc = s.c; s.pr = s.r; s.c = p.c; s.r = p.r;
            }
            h.pc = h.c; h.pr = h.r; h.c = nc; h.r = nr;
            if (eat) {
                st.score++;
                st.speed = Math.min(SPEED_MAX, st.speed + SPEED_UP);
                const rig = babyRig();
                scene.add(rig.root);
                segs.push({ rig, c: tc, r: tr, pc: tc, pr: tr, yaw: tail.yaw, born: st.t });
                if (!placeApple()) { yard.apple.visible = false; die(); }   // 판을 다 채웠다!
            }
        };

        const frame = () => {
            if (stopped) return;
            const now = Date.now();
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const dead = !!st.deadAt;
            if (!dead) st.t += dt;
            const playing = st.t > 0 && !dead;
            if (playing) {
                st.acc += dt * st.speed;
                while (st.acc >= 1 && !st.deadAt) { st.acc -= 1; step(); }
                st.phase += dt * st.speed * 3.2;
            }
            const f = playing ? st.acc : 1;   // 끝나면 마지막 칸에 멈춘다

            segs.forEach((s, i) => {
                const x = cellX(s.pc + (s.c - s.pc) * f), z = cellZ(s.pr + (s.r - s.pr) * f);
                // 새로 붙은 친구는 퐁 하고 나타난다
                const age = st.t - s.born;
                const pop = age < 0.3 ? Math.sin((age / 0.3) * Math.PI / 2) : 1;
                s.rig.root.position.set(x, age < 0.3 ? Math.sin((age / 0.3) * Math.PI) * 0.4 : 0, z);
                s.rig.root.scale.setScalar(Math.max(0.05, pop));
                // 움직이는 방향을 본다 (부드럽게 돈다)
                if (s.c !== s.pc || s.r !== s.pr) {
                    const d = s.c > s.pc ? 1 : s.c < s.pc ? 3 : s.r > s.pr ? 2 : 0;
                    let diff = YAW[d] - s.yaw;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    s.yaw += diff * Math.min(1, dt * 16);
                } else if (i === 0 && !playing && !dead) s.yaw = YAW[st.dir];
                s.rig.root.rotation.y = s.yaw;
                if (dead) {
                    if (i === 0) poseFall(s.rig, (now - st.deadAt) / 900);
                    else poseIdle(s.rig, st.t + i);
                } else if (playing) poseRun(s.rig, st.phase + i * 0.9, 0, false);
                else poseIdle(s.rig, st.t + COUNT_S + i);
            });
            // 사과는 빙글빙글 통통
            yard.apple.rotation.y += dt * 3;
            yard.apple.children[0].position.y = 0.5 + Math.sin(now / 250) * 0.1;

            renderer.render(scene, yard.camera);
            gl.endFrameEXP();

            const count = st.t < 0 ? Math.ceil(-st.t) : 0;
            const key = `${st.score}|${count}|${dead}`;
            if (key !== st.shown) { st.shown = key; setHud({ score: st.score, count, dead }); }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
    };

    return (
        <View style={styles.wrap} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
            onResponderGrant={onStart} onResponderMove={onMove}>
            <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
            <View style={styles.hud} pointerEvents="none">
                <Text style={styles.score}>🍎 {hud.score}</Text>
                <Text style={styles.side}>{hud.score > 0 ? `친구 ${hud.score}마리` : ''}</Text>
            </View>
            {hud.count > 0 && (
                <View style={styles.countWrap} pointerEvents="none">
                    <Text style={styles.count}>{hud.count}</Text>
                    <Text style={styles.countNote}>{'화면을 위·아래·왼쪽·오른쪽으로 밀어서\n방향을 바꿔요. 🍎를 먹으면 친구가 따라와요!\n울타리나 친구 줄에 부딪히면 끝!'}</Text>
                </View>
            )}
            {hud.dead && <Text style={styles.over} pointerEvents="none">꽝!</Text>}
        </View>
    );
}

const shadowText = { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 };
const styles = StyleSheet.create({
    wrap: { flex: 1, overflow: 'hidden', borderRadius: 22, backgroundColor: SKY },
    hud: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    score: { fontFamily: fontFamilies.num, fontSize: 28, color: '#fff', ...shadowText },
    side: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: '#fff', ...shadowText },
    countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
    count: { fontFamily: fontFamilies.num, fontSize: 84, color: '#fff', ...shadowText },
    countNote: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: '#fff', textAlign: 'center', lineHeight: 22, ...shadowText },
    over: { position: 'absolute', top: '36%', alignSelf: 'center', fontFamily: fontFamilies.display, fontSize: 44, color: '#fff', ...shadowText },
});
