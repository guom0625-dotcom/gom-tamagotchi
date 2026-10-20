// 한 방향(yaw)에서 펫의 부위를 어떤 순서로 겹쳐 그릴지 정한다.
// 머리·눈·귀는 한 묶음으로 같이 움직이므로, 묶음 안에서 따로 순서를 정한다.
import { renderPart, type PartRender } from './voxel';
import { BODY_PARTS, HEAD_GROUP, type PartId, type PetModel } from './model';

export const YAW_STEPS = 16;
export const yawOf = (idx: number) => (((idx % YAW_STEPS) + YAW_STEPS) % YAW_STEPS) * (2 * Math.PI / YAW_STEPS);
/** 가장 가까운 방향 번호 */
export const yawIndex = (yaw: number) =>
    ((Math.round(yaw / (2 * Math.PI / YAW_STEPS)) % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
/** 화면(카메라)을 정면으로 보는 방향 — 얼굴이 (+x, +z) 쪽 */
export const FACE_CAMERA = yawIndex(Math.atan2(-1, -1));

export type Layer = { id: PartId; r: PartRender };
export interface PetLayers {
    /** 그리는 순서. 'head' 자리에 머리 묶음이 들어간다 */
    order: (PartId | 'headGroup')[];
    parts: Record<PartId, PartRender>;
    headOrder: PartId[];
}

const cache = new Map<string, PetLayers>();

export function petLayers(model: PetModel, modelKey: string, yawIdx: number, kv: number): PetLayers {
    const key = `${modelKey}:${yawIdx}:${kv.toFixed(2)}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const yaw = yawOf(yawIdx);
    const parts = {} as Record<PartId, PartRender>;
    for (const id of Object.keys(model.parts) as PartId[]) parts[id] = renderPart(model.parts[id], yaw, kv);

    // 머리 묶음은 머리 깊이로 다른 부위와 비교한다
    const top = [...BODY_PARTS.map(id => ({ id: id as PartId | 'headGroup', d: parts[id].depth })),
        { id: 'headGroup' as const, d: parts.head.depth }];
    top.sort((a, b) => a.d - b.d);
    // 눈은 머리 앞에 붙은 무늬라 항상 머리 다음. 귀는 머리 위에 서 있어 머리 다음
    const headOrder: PartId[] = ['head', ...HEAD_GROUP.filter(id => id !== 'head')
        .sort((a, b) => parts[a].depth - parts[b].depth)];

    const v: PetLayers = { order: top.map(t => t.id), parts, headOrder };
    if (cache.size > 200) cache.clear();
    cache.set(key, v);
    return v;
}
