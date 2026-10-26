// 얼음길 달리기 3D 화면을 PNG 로 (폰 없이 확인). 실행: npx tsx scripts/preview-run3d.ts out.png   (S=거리 U=좌우 INTRO=1 SPECIES=cat VARIANT=2 STAGE=baby)
import * as THREE from 'three';
import { renderPNG } from './r3d';
import { World } from '../src/game3d/world';
import { worldAt, headingAt } from '../src/game3d/track';
import { buildPet, poseRun, poseIdle } from '../src/game3d/petMesh';
import { petModel } from '../src/pet/model';
const W = 270, H = 520;
const S = Number(process.env.S ?? 140), U = Number(process.env.U ?? 0.15), INTRO = process.env.INTRO === '1';
const world = new World(W / H);
const sp = (process.env.SPECIES ?? 'bear') as any;
const rig = buildPet(petModel(sp, Number(process.env.VARIANT ?? 0), 'happy', (process.env.STAGE ?? 'adult') as any), 1.6);
world.scene.add(rig.root);
const [px, py, pz] = worldAt(S, U); rig.root.position.set(px, py, pz); rig.root.rotation.y = headingAt(S);
if (INTRO) poseIdle(rig, 0.3); else poseRun(rig, 1.2, 0.3, false);
world.shadow.position.set(...worldAt(S, U, 0.04)); world.shadow.scale.set(0.67, 0.67, 1);
const put = (kind: any, s: number, u: number, up = 0) => { const m = world.take(kind)!; const [x, y, z] = worldAt(s, u); m.position.set(x, y + up, z); m.rotation.y = headingAt(s); };
put('ice', S + 14, -0.5); put('snowman', S + 14, 0.55); put('hole', S + 26, 0.1); put('ramp', S + 40, -0.3);
for (let i = 0; i < 5; i++) put('fish', S + 6 + i * 2.5, 0.2, 0.9);
for (let i = 0; i < 4; i++) put('fish', S + 44 + i * 3.4, -0.3, 3.4);
world.prepare(S);
const cam = world.camera;
if (INTRO) { cam.position.set(...worldAt(S + 4.5, U, 1.7)); cam.lookAt(new THREE.Vector3(...worldAt(S, U, 1.0))); }
else { cam.position.set(...worldAt(S - 7.5, U * 0.55, 3.7)); cam.lookAt(new THREE.Vector3(...worldAt(S + 10, U * 0.4, 1.0))); }
cam.updateProjectionMatrix();
world.update(S, cam.position, 0);
renderPNG(world.scene, cam, W, H, process.argv[2]);
