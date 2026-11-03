// 🐍 놀아주기 마당을 PNG 로 (폰 없이 확인). 실행: npx tsx scripts/preview-snake.ts out.png   (SPECIES=cat VARIANT=2 STAGE=teen N=6)
import { renderPNG } from './r3d';
import { Yard, cellX, cellZ } from '../src/game3d/yard';
import { buildPet, poseRun } from '../src/game3d/petMesh';
import { petModel } from '../src/pet/model';
import { SPECIES } from '../src/pet/species';
const W = 340, H = 560;
const yard = new Yard(W / H);
const sp = (process.env.SPECIES ?? 'bear') as any;
const N = Number(process.env.N ?? 6);
// 머리는 (5,6) 에서 오른쪽을 보고, 몸은 아래로 꺾여 있다
const cells = ([[5, 6], [4, 6], [3, 6], [3, 7], [3, 8], [3, 9], [4, 9], [5, 9], [6, 9]] as [number, number][]).slice(0, N + 1);
cells.forEach(([c, r], i) => {
    const rig = i === 0 ? buildPet(petModel(sp, Number(process.env.VARIANT ?? 0), 'happy', (process.env.STAGE ?? 'adult') as any), 1.75)
        : buildPet(petModel(SPECIES[i % SPECIES.length], 0, 'happy', 'baby'), 1.4);
    const next = i === 0 ? [6, 6] : cells[i - 1];
    const dx = next[0] - c, dz = next[1] - r;
    rig.root.rotation.y = dx > 0 ? -Math.PI / 2 : dx < 0 ? Math.PI / 2 : dz > 0 ? Math.PI : 0;
    rig.root.position.set(cellX(c), 0, cellZ(r));
    poseRun(rig, 1 + i, 0, false);
    rig.root.add(yard.makeShadow(0.42));
    yard.scene.add(rig.root);
});
yard.apple.position.set(cellX(8), 0, cellZ(3));
renderPNG(yard.scene, yard.camera, W, H, process.argv[2]);
