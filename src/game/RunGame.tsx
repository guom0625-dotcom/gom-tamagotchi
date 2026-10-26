// 🌲 숲길 달리기 (3D) — 슈퍼펭귄처럼: 폰을 기울여 좌우로 움직이고, 화면을 톡 누르면 점프한다 (2026-10-26 사용자 결정).
// three.js + expo-gl. 펫은 방에서 쓰는 복셀 모델을 그대로 3D 상자로 옮긴다(game3d/petMesh).
// 숲길은 굽고 오르내리며, 바위·그루터기는 피하거나 뛰어넘고, 웅덩이·시냇물은 뛰어넘고, 점프대는 높이 날려 준다.
// (2026-10-26 사용자 결정: 빙판 대신 숲길. 물고기 대신 🍎 사과)
// 슈퍼펭귄처럼 우리에 갇힌 친구(도감 친구)를 구하면 파워업: 🚀 로켓 · 🧲 자석 · 🦖 거대화 · 🛡️ 방패 (2026-10-26 사용자 결정).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Accelerometer } from 'expo-sensors';
import * as THREE from 'three';
import { petModel } from '../pet/model';
import { KINDS, SPECIES, SPECIES_NAME, type Species } from '../pet/species';
import { BoxBuilder, voxelMaterial } from '../game3d/boxes';
import { runAbilityOf } from './abilities';
import type { GameChar } from './PoopGame';
import { buildPet, poseFall, poseIdle, poseRun } from '../game3d/petMesh';
import { HW, headingAt, slopeAt, worldAt } from '../game3d/track';
import { CREEK_LEN, OBJ_HALF, SKY, World, type Obj, type ObjKind } from '../game3d/world';
import { fontFamilies, fontSizes } from '../theme';

export interface RunResult { ms: number; score: number; dist: number; fish: number }

interface Props {
    char: GameChar;
    /** 우리에 갇혀 나올 친구들 (도감). 없으면 아무 동물 */
    friends?: { species: Species; variant: number }[];
    onOver: (r: RunResult) => void;
}

type Power = 'rocket' | 'magnet' | 'giant' | 'shield';
const POWER_S: Record<Power, number> = { rocket: 3.2, magnet: 8, giant: 6, shield: 0 };
const POWER_NAME: Record<Power, string> = { rocket: '🚀 로켓', magnet: '🧲 자석', giant: '🦖 거대화', shield: '🛡️ 방패' };

const FISH_POINTS = 10;
const PET_H = 1.6;              // 펫 키 (m) — 단계와 상관없이 같게 (크면 잘 부딪혀서 불리했다)
const COUNT_S = 2.4;            // 3·2·1
// 좌우 조작 (2026-10-26 사용자: 반응을 더 빠르게) — 예전 값: 무감각 0.04, 배율 3.2, 속도 1.9, 따라잡기 9
const TILT_DEAD = 0.025;        // 이만큼 덜 기울이면 가만히 (g)
const TILT_GAIN = 5;            // 약 12° 기울이면 최대로
const SIDE_SPEED = 2.7;         // 좌우 최대 빠르기 (길 반폭/초)
const SIDE_SNAP = 18;           // 원하는 빠르기로 얼마나 빨리 바뀌나 (클수록 즉각)
const FISH_Y = 0.9, FISH_HIGH_Y = 3.4;   // 사과 높이 (보통 / 점프대 위)

interface Hud { dist: number; fish: number; shields: number; count: number; flash: string | null; dead: boolean; power: string | null }

export function RunGame({ char, friends, onOver }: Props) {
    const ab = useMemo(() => runAbilityOf(char.species, char.stage, char.build), [char]);
    const [hud, setHud] = useState<Hud>({ dist: 0, fish: 0, shields: ab.shields, count: 3, flash: null, dead: false, power: null });
    const [noSensor, setNoSensor] = useState(false);
    const noSensorRef = useRef(false);
    const onOverRef = useRef(onOver);
    onOverRef.current = onOver;
    const stopRef = useRef<() => void>(() => {});

    // 기울기: 3·2·1 동안 잡은 자세를 가운데로 친다
    const tilt = useRef({ x: 0, base: 0, n: 0, calibrating: true });
    useEffect(() => {
        let sub: { remove: () => void } | null = null;
        let alive = true;
        void Accelerometer.isAvailableAsync().then(ok => {
            if (!alive) return;
            if (!ok) { noSensorRef.current = true; setNoSensor(true); return; }
            Accelerometer.setUpdateInterval(20);
            sub = Accelerometer.addListener(m => {
                const t = tilt.current;
                const x = Platform.OS === 'android' ? -m.x : m.x;   // 오른쪽으로 기울이면 +
                if (t.calibrating) { t.base = (t.base * t.n + x) / (t.n + 1); t.n = Math.min(t.n + 1, 30); }
                t.x = x;
            });
        }).catch(() => { noSensorRef.current = true; setNoSensor(true); });
        return () => { alive = false; sub?.remove(); };
    }, []);

    // 누르기: 점프 (센서가 없으면 화면 양쪽 = 좌우, 가운데 = 점프)
    const touch = useRef({ left: false, right: false, jump: false, w: 1 });
    const onTouch = (e: { nativeEvent: { touches: { pageX: number }[]; changedTouches?: { pageX: number }[] } }, start: boolean) => {
        const T = touch.current;
        if (!noSensorRef.current) { if (start) T.jump = true; return; }
        let l = false, r = false;
        for (const t of e.nativeEvent.touches) { const f = t.pageX / T.w; if (f < 0.33) l = true; else if (f > 0.67) r = true; }
        T.left = l; T.right = r;
        if (start) for (const t of e.nativeEvent.changedTouches ?? []) { const f = t.pageX / T.w; if (f >= 0.33 && f <= 0.67) T.jump = true; }
    };

    useEffect(() => () => stopRef.current(), []);

    const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        // expo-gl 위에서 three.js 를 쓰는 방법 (expo-three 와 같다): 가짜 canvas 를 건넨다
        const canvas = {
            width: W, height: H, style: {}, clientHeight: H,
            addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
        } as unknown as HTMLCanvasElement;
        const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(1);
        renderer.setSize(W, H, false);

        const world = new World(W / H);
        const model = petModel(char.species, char.variant, 'happy', char.stage, char.outfit ?? {}, char.build);
        const normalR = petModel(char.species, char.variant, 'happy', char.stage).radius;
        const rig = buildPet(model, PET_H);
        world.scene.add(rig.root);
        // 로켓 가방 (로켓일 때만 보인다) — 등(+z)에 멘다
        const extraMat = voxelMaterial({ emissive: new THREE.Color('#3A1A00') });
        const jetG = new BoxBuilder()
            .add(-0.32, 0.55, 0.18, 0.32, 1.15, 0.5, '#9AA7B4', '#C9D3DC')
            .add(-0.28, 0.3, 0.22, -0.08, 0.55, 0.46, '#5B6672').add(0.08, 0.3, 0.22, 0.28, 0.55, 0.46, '#5B6672').build();
        const flameG = new BoxBuilder().add(-0.26, -0.45, 0.24, -0.1, 0.3, 0.44, '#FF8A1E', '#FFD23A').add(0.1, -0.45, 0.24, 0.26, 0.3, 0.44, '#FF8A1E', '#FFD23A').build();
        const jet = new THREE.Mesh(jetG, extraMat);
        const flame = new THREE.Mesh(flameG, extraMat);
        jet.add(flame); jet.visible = false; rig.root.add(jet);
        // 방패 거품
        const bubbleG = new THREE.SphereGeometry(1.15, 18, 12);
        const bubbleM = new THREE.MeshLambertMaterial({ color: '#7FD8FF', transparent: true, opacity: 0.28, depthWrite: false, emissive: new THREE.Color('#1A4A66') });
        const bubble = new THREE.Mesh(bubbleG, bubbleM);
        bubble.position.y = 0.85; bubble.visible = false; bubble.renderOrder = 3; rig.root.add(bubble);
        // 우리에 갇힌 친구 그림 (모습마다 한 번만 만든다)
        const friendRigs = new Map<string, ReturnType<typeof buildPet>>();
        const pickFriend = () => {
            const pool = friends?.length ? friends : SPECIES.map(sp => ({ species: sp, variant: Math.floor(Math.random() * KINDS[sp].looks.length) }));
            return pool[Math.floor(Math.random() * pool.length)];
        };
        // 부딪힘 반지름 (m): 보통 체형 기준 같은 크기, 살찐 만큼 넓고 능력·단계만큼 좁다
        const petR = normalR * rig.scale * 0.8 * (model.radius / normalR) * ab.hit;
        const cam = world.camera;

        const st = {
            t: -COUNT_S, s: 0, u: 0, vu: 0, phase: 0, y: 0,
            jumpT: -1, jumpDur: 0.72 * ab.jump, jumpH: 2.0 * Math.sqrt(ab.jump), jumpBoost: 1,
            fish: 0, shields: ab.shields, invUntil: 0, nextSeed: ab.seed?.every ?? Infinity,
            objs: [] as Obj[], nextAt: 45, nextFriend: 180 + Math.random() * 120,
            power: null as Power | null, powerUntil: 0, giantK: 1,
            deadAt: 0, deadKind: '' as ObjKind | '',
            shown: '', flash: null as string | null, flashUntil: 0,
        };
        world.prepare(0);

        const say = (m: string) => { st.flash = m; st.flashUntil = st.t + 1; };
        const spawn = (kind: ObjKind, s: number, u: number, raised = FISH_Y) => {
            const mesh = world.take(kind);
            if (!mesh) return;
            const [x, y, z] = worldAt(s, u);
            mesh.position.set(x, y + (kind === 'fruit' ? raised : 0), z);
            // 납작한 것(웅덩이·시냇물·점프대)은 길 기울기를 따라 눕힌다 (안 그러면 내리막에서 반쯤 묻힌다)
            const flat = kind === 'puddle' || kind === 'creek' || kind === 'ramp';
            mesh.rotation.order = 'YXZ';
            mesh.rotation.set(flat ? Math.atan(slopeAt(s).dy) : 0, headingAt(s), 0);
            mesh.userData.raised = raised;
            if (kind === 'friend') {
                const f = pickFriend();
                const key = `${f.species}:${f.variant}`;
                let fr = friendRigs.get(key);
                if (!fr) { fr = buildPet(petModel(f.species, f.variant, 'sad', 'baby'), 1.75); friendRigs.set(key, fr); }
                const inside = mesh.getObjectByName('inside')!;
                inside.clear(); inside.add(fr.root);
                fr.root.position.set(0, 0.05, 0); fr.root.rotation.set(0, Math.PI, 0);   // 펫 쪽(카메라)을 본다
                poseIdle(fr, Math.random() * 3);
                mesh.userData.friend = f;
            }
            st.objs.push({ kind, s, u, mesh, done: false });
        };
        const lane = () => (Math.random() * 2 - 1) * 0.72;
        // 앞쪽에 새 무리를 놓는다. 시간이 갈수록 촘촘
        const pattern = (s: number) => {
            const r = Math.random();
            if (ab.seed && st.t >= st.nextSeed) { spawn('seed', s, lane()); st.nextSeed = st.t + ab.seed.every; return; }
            // 우리에 갇힌 친구: 200~350m 마다
            if (s >= st.nextFriend) { spawn('friend', s, lane() * 0.8); st.nextFriend = s + 200 + Math.random() * 150; return; }
            // 시냇물: 길 전체를 가로질러서 꼭 뛰어넘어야 한다 (앞뒤로는 비워 둔다)
            if (st.t > 14 && r < 0.12) { spawn('creek', s, 0); st.nextAt += 10; return; }
            if (r < 0.22) { const u = lane(); for (let i = 0; i < 5; i++) spawn('fruit', s + i * 2.5, u); }
            else if (r < 0.32 && st.t > 8) {     // 점프대 + 하늘에 사과 (점프대로 날아야 먹는다)
                const u = lane() * 0.6; spawn('ramp', s, u);
                for (let i = 1; i <= 4; i++) spawn('fruit', s + 2 + i * 3.4, u, FISH_HIGH_Y);
            }
            else if (r < 0.5) spawn('puddle', s, lane());
            else if (r < 0.66 && st.t > 10) {    // 둘 사이로 빠져나가거나 뛰어넘기
                const gap = (Math.random() * 2 - 1) * 0.45;
                spawn(Math.random() < 0.5 ? 'rock' : 'stump', s, gap - 0.62);
                spawn(Math.random() < 0.5 ? 'rock' : 'stump', s, gap + 0.62);
            } else {
                spawn(Math.random() < 0.55 ? 'rock' : 'stump', s, lane());
                if (Math.random() < 0.5) spawn('fruit', s + 7, lane());
            }
        };

        const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
        const look = new THREE.Vector3(...worldAt(0, 0, 1));
        let raf = 0, last = Date.now(), stopped = false, overSent = false;
        const stop = () => {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(raf);
            sub.remove();
            rig.dispose(); world.dispose(); renderer.dispose();
            friendRigs.forEach(f => f.dispose()); jetG.dispose(); flameG.dispose(); extraMat.dispose(); bubbleG.dispose(); bubbleM.dispose();
        };
        stopRef.current = stop;
        const sub = AppState.addEventListener('change', x => { if (x !== 'active' && st.t > 0) die(''); });

        function die(kind: ObjKind | '') {
            if (st.deadAt) return;
            st.deadAt = Date.now(); st.deadKind = kind;
            const r: RunResult = { ms: Math.round(Math.max(0, st.t) * 1000), dist: Math.floor(st.s), fish: st.fish, score: Math.floor(st.s) + st.fish * FISH_POINTS };
            setTimeout(() => { if (!overSent) { overSent = true; onOverRef.current(r); } }, 1600);
        }

        const frame = () => {
            if (stopped) return;
            const now = Date.now();
            const dt = Math.min(now - last, 50) / 1000;
            last = now;
            const T = touch.current;
            const dead = st.deadAt > 0;

            if (!dead) st.t += dt;
            if (st.t > 0) tilt.current.calibrating = false;
            const playing = st.t > 0 && !dead;

            if (playing) {
                // 앞으로: 점점 빨라진다. 내리막이면 조금 더
                const power = st.power && st.t < st.powerUntil ? st.power : null;
                if (!power && st.power) { st.power = null; say('파워업 끝!'); }
                const rocket = power === 'rocket', magnet = power === 'magnet', giant = power === 'giant';
                const base = Math.min(34, 15 + 0.32 * st.t) * (1 - slopeAt(st.s).dy * 0.6);
                const v = rocket ? Math.min(58, Math.max(base * 1.8, 45)) : base;
                const prevS = st.s;
                st.s += v * dt;

                // 좌우: 기울기
                let steer: number;
                if (!noSensorRef.current) {
                    const raw = tilt.current.x - tilt.current.base;
                    steer = Math.abs(raw) < TILT_DEAD ? 0 : Math.max(-1, Math.min(1, (raw - Math.sign(raw) * TILT_DEAD) * TILT_GAIN));
                } else steer = (T.right ? 1 : 0) - (T.left ? 1 : 0);
                st.vu += (steer * SIDE_SPEED * ab.steer - st.vu) * Math.min(1, dt * SIDE_SNAP);
                const lim = 1 - (petR / HW) * 0.7;
                st.u = Math.max(-lim, Math.min(lim, st.u + st.vu * dt));

                // 점프 (점프대는 더 높이·오래)
                if (T.jump) { T.jump = false; if (st.jumpT < 0) { st.jumpT = 0; st.jumpBoost = 1; } }
                let air = false;
                if (rocket) {
                    // 로켓: 하늘 높이 날아간다 (끝날 때쯤 내려온다)
                    const left = st.powerUntil - st.t;
                    st.y += ((left > 0.6 ? 4.2 : 0) - st.y) * Math.min(1, dt * 4);
                    st.jumpT = -1; air = st.y > 0.45;
                } else if (st.jumpT >= 0) {
                    st.jumpT += dt;
                    const f = st.jumpT / (st.jumpDur * st.jumpBoost);
                    if (f >= 1) { st.jumpT = -1; st.y = 0; }
                    else { st.y = 4 * st.jumpH * st.jumpBoost * f * (1 - f); air = st.y > 0.45; }
                } else if (st.y > 0) { st.y = Math.max(0, st.y - dt * 8); air = st.y > 0.45; }
                // 거대화: 커졌다가 돌아온다
                st.giantK += ((giant ? 1.8 : 1) - st.giantK) * Math.min(1, dt * 6);
                rig.root.scale.setScalar(st.giantK);
                jet.visible = rocket;
                flame.scale.y = 0.7 + Math.random() * 0.6;
                bubble.visible = st.shields > 0;

                // 새 무리 (보이는 끝쯤에)
                if (st.s + 150 >= st.nextAt) {
                    pattern(st.nextAt);
                    st.nextAt += Math.max(9, 24 - st.t * 0.18) * (0.8 + Math.random() * 0.5);
                }

                // 부딪힘: 이번 프레임에 그 자리를 지나갔나 (빠르면 한 프레임에 건너뛰므로 구간으로 본다)
                const inv = st.t < st.invUntil || rocket;
                const R = petR * st.giantK;
                for (let i = st.objs.length - 1; i >= 0; i--) {
                    const o = st.objs[i];
                    const half = o.kind === 'creek' ? CREEK_LEN / 2 : 0.5;
                    if (!o.done && o.s > prevS - half && o.s <= st.s + half) {
                        const dx = o.kind === 'creek' ? 0 : Math.abs(o.u - st.u) * HW;
                        if (o.kind === 'fruit' || o.kind === 'seed') {
                            const reach = magnet ? HW * 2 : R + OBJ_HALF[o.kind] * (o.kind === 'fruit' ? ab.magnet : 1);
                            const high = (o.mesh.userData.raised as number) > 2;
                            if (dx < reach && (!high || st.y > 1.8 || magnet)) {
                                o.done = true; world.give(o.mesh);
                                if (o.kind === 'fruit') st.fish++;
                                else { st.invUntil = st.t + ab.seed!.dur; say('🌻 냠! 무적'); }
                            }
                        } else if (o.kind === 'friend') {
                            if (dx < R + OBJ_HALF.friend) {
                                // 우리를 부수고 친구를 구하면 파워업 하나
                                o.done = true; world.give(o.mesh);
                                const list: Power[] = ['rocket', 'magnet', 'giant', 'shield'];
                                const pw = list[Math.floor(Math.random() * list.length)];
                                const f = o.mesh.userData.friend as { species: Species };
                                if (pw === 'shield') st.shields++;
                                else { st.power = pw; st.powerUntil = st.t + POWER_S[pw]; }
                                say(`🔓 ${SPECIES_NAME[f.species]} 구출! ${POWER_NAME[pw]}`);
                            }
                        } else if (o.kind === 'ramp') {
                            if (dx < OBJ_HALF.ramp && st.y < 0.6) {
                                o.done = true; st.jumpT = 0; st.jumpBoost = 1.55; say('🚀 슝!');
                            }
                        } else if (o.kind === 'creek') {
                            // 시냇물: 공중이거나 거대하면 건넌다. 다 지나가야 끝
                            if (!air && !giant && !inv) {
                                o.done = true;
                                if (st.shields > 0) { st.shields--; st.invUntil = st.t + 1; st.jumpT = 0; st.jumpBoost = 0.8; say('🛡️ 휴, 살았다!'); }
                                else { die('creek'); break; }
                            } else if (o.s + half <= st.s) o.done = true;
                        } else if (dx < R + OBJ_HALF[o.kind] && !air) {
                            if (giant || inv) {
                                if (giant && (o.kind === 'rock' || o.kind === 'stump')) { o.done = true; world.give(o.mesh); say('🦖 쾅!'); }
                                continue;
                            }
                            o.done = true;
                            if (st.shields > 0) {
                                st.shields--; st.invUntil = st.t + 1; world.give(o.mesh);
                                say(o.kind === 'puddle' ? '🛡️ 영차! 빠져나왔다' : '🛡️ 쾅! 버텼다');
                            } else { die(o.kind); break; }
                        }
                    }
                    if (o.s < st.s - 12) { world.give(o.mesh); st.objs.splice(i, 1); }
                }
                // 자석: 앞쪽 사과가 펫에게 날아온다
                if (magnet) for (const o of st.objs) if (o.kind === 'fruit' && !o.done && o.s - st.s < 22) {
                    o.u += (st.u - o.u) * Math.min(1, dt * 5);
                    o.mesh.userData.raised = (o.mesh.userData.raised as number) + ((st.y + 0.9) - (o.mesh.userData.raised as number)) * Math.min(1, dt * 5);
                    const [x, , z] = worldAt(o.s, o.u); o.mesh.position.x = x; o.mesh.position.z = z;
                }
                st.phase += dt * (8 + v * 0.35);
                poseRun(rig, st.phase, st.vu / SIDE_SPEED, air);
            } else if (dead) {
                // 넘어짐 (웅덩이면 풍덩 빠진다)
                const f = (now - st.deadAt) / 900;
                if (st.deadKind === 'puddle' || st.deadKind === 'creek') { st.y = -Math.min(1, f) * (st.deadKind === 'creek' ? 6 : 1.4); poseFall(rig, Math.min(1, f) * 0.3); }
                else { poseFall(rig, f); st.y = Math.max(0, st.y - dt * 6); }
            } else {
                poseIdle(rig, st.t + COUNT_S);
            }

            // 펫 자리·방향
            const [px, py, pz] = worldAt(st.s, st.u, st.y);
            rig.root.position.set(px, py, pz);
            rig.root.rotation.y = headingAt(st.s) - st.vu * 0.09;
            const [gx, gy, gz] = worldAt(st.s, st.u, 0.04);
            world.shadow.position.set(gx, gy, gz);
            const sh = Math.max(0.35, 1 - Math.max(0, st.y) * 0.18) * PET_H * 0.42;
            world.shadow.scale.set(sh, sh, 1);
            rig.root.visible = !(playing && st.t < st.invUntil && Math.floor(st.t * 12) % 2 === 1);

            // 사과는 빙글빙글
            for (const o of st.objs) if ((o.kind === 'fruit' || o.kind === 'seed') && !o.done) {
                o.mesh.rotation.y += dt * 3.5;
                if (o.kind === 'fruit') o.mesh.position.y = worldAt(o.s, o.u)[1] + (o.mesh.userData.raised as number) + Math.sin(now / 250 + o.s) * 0.15;
            }

            // 카메라: 펫 뒤 위에서 따라간다. 3·2·1 동안은 앞에서 얼굴을 보다가 뒤로 돈다
            const intro = Math.max(0, Math.min(1, -st.t / COUNT_S));     // 1 → 0
            const k = intro * intro * (3 - 2 * intro);
            const back = worldAt(st.s - 7.5 - (st.giantK - 1) * 3, st.u * 0.55, 3.7 + Math.max(0, st.y) * 0.6 + (st.giantK - 1) * 2);
            const front = worldAt(st.s + 4.5, st.u, 1.7);
            camPos.set(back[0] + (front[0] - back[0]) * k, back[1] + (front[1] - back[1]) * k, back[2] + (front[2] - back[2]) * k);
            const lookFar = worldAt(st.s + 10, st.u * 0.4, 1.0), lookPet = worldAt(st.s, st.u, 1.0);
            camLook.set(lookFar[0] + (lookPet[0] - lookFar[0]) * k, lookFar[1] + (lookPet[1] - lookFar[1]) * k, lookFar[2] + (lookPet[2] - lookFar[2]) * k);
            const ease = intro > 0 ? 1 : 1 - Math.exp(-dt * 7);
            cam.position.lerp(camPos, ease);
            look.lerp(camLook, ease);
            cam.lookAt(look);
            const fov = 62 + (playing ? Math.min(10, st.t * 0.12) : 0);
            if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }

            world.update(st.s, cam.position, dt);
            renderer.render(world.scene, cam);
            gl.endFrameEXP();

            // 화면 글자 (바뀔 때만)
            const count = st.t < 0 ? Math.ceil(-st.t / (COUNT_S / 3)) : 0;
            const flash = st.flash && st.t < st.flashUntil ? st.flash : null;
            const pw = st.power && st.t < st.powerUntil ? `${POWER_NAME[st.power]} ${Math.ceil(st.powerUntil - st.t)}` : null;
            const key = `${Math.floor(st.s)}|${st.fish}|${st.shields}|${count}|${flash}|${dead}|${pw}`;
            if (key !== st.shown) {
                st.shown = key;
                setHud({ dist: Math.floor(st.s), fish: st.fish, shields: st.shields, count, flash, dead, power: pw });
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
    };

    return (
        <View style={styles.wrap} onLayout={e => { touch.current.w = e.nativeEvent.layout.width; }}
            onStartShouldSetResponder={() => true}
            onTouchStart={e => onTouch(e, true)} onTouchMove={e => onTouch(e, false)} onTouchEnd={e => onTouch(e, false)}>
            <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
            <View style={styles.hud} pointerEvents="none">
                <Text style={styles.score}>{hud.dist}m</Text>
                <Text style={styles.side}>🍎 {hud.fish}{hud.shields > 0 ? `  ${'🛡️'.repeat(Math.min(hud.shields, 3))}` : ''}</Text>
            </View>
            {hud.power && !hud.dead && <Text style={styles.power} pointerEvents="none">{hud.power}</Text>}
            {hud.flash && !hud.dead && <Text style={styles.flash} pointerEvents="none">{hud.flash}</Text>}
            {hud.count > 0 && (
                <View style={styles.countWrap} pointerEvents="none">
                    <Text style={styles.count}>{hud.count}</Text>
                    <Text style={styles.countNote}>{noSensor
                        ? '화면 왼쪽·오른쪽을 눌러 움직이고\n가운데를 누르면 점프해요'
                        : '편하게 잡은 자세 그대로 있어 주세요\n폰을 기울여 움직이고, 화면을 누르면 점프해요'}</Text>
                </View>
            )}
            {hud.dead && <Text style={styles.over} pointerEvents="none">꽈당!</Text>}
        </View>
    );
}

const shadowText = { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 };
const styles = StyleSheet.create({
    wrap: { flex: 1, overflow: 'hidden', borderRadius: 22, backgroundColor: SKY },
    hud: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    score: { fontFamily: fontFamilies.num, fontSize: 30, color: '#fff', ...shadowText },
    side: { fontFamily: fontFamilies.num, fontSize: 22, color: '#fff', ...shadowText },
    power: { position: 'absolute', top: 104, alignSelf: 'center', fontFamily: fontFamilies.num, fontSize: 20, color: '#FFE070', ...shadowText },
    flash: { position: 'absolute', top: 64, alignSelf: 'center', fontFamily: fontFamilies.display, fontSize: 26, color: '#fff', ...shadowText },
    countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
    count: { fontFamily: fontFamilies.num, fontSize: 84, color: '#fff', ...shadowText },
    countNote: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: '#fff', textAlign: 'center', lineHeight: 22, ...shadowText },
    over: { position: 'absolute', top: '36%', alignSelf: 'center', fontFamily: fontFamilies.display, fontSize: 44, color: '#fff', ...shadowText },
});
