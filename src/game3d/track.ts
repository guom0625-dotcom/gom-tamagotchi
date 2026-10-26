// 얼음길 코스 모양 — 거리 s(m)에 따라 좌우로 굽고 위아래로 오르내리며 내려간다.
// 길 위의 자리는 (s, u): u = -1(왼쪽 끝) ~ 1(오른쪽 끝). 월드 좌표는 앞쪽이 -z.
// three.js 없이 계산만 한다 (게임 판정과 시험에 같이 쓴다).

export const HW = 4.2;        // 길 반폭 (m)
export const BANK = 1.6;      // 길 양옆 눈 둑 너비
export const BANK_H = 1.1;    // 눈 둑 높이

/** 길 가운데의 x (좌우로 굽는다). 처음 60m 는 곧게 */
export function cxAt(s: number): number {
    const k = Math.min(1, Math.max(0, (s - 20) / 80));
    return k * (9 * Math.sin(s / 70) + 3.5 * Math.sin(s / 27 + 1.3));
}

/** 길 높이: 계속 내려가면서 언덕이 있다 */
export function yAt(s: number): number {
    const k = Math.min(1, Math.max(0, (s - 20) / 80));
    return -0.1 * s + k * (2.2 * Math.sin(s / 38) + 0.8 * Math.sin(s / 15 + 2));
}

/** 길이 향하는 방향 (x 기울기 dx/ds, y 기울기 dy/ds) */
export function slopeAt(s: number): { dx: number; dy: number } {
    const e = 0.5;
    return { dx: (cxAt(s + e) - cxAt(s - e)) / (2 * e), dy: (yAt(s + e) - yAt(s - e)) / (2 * e) };
}

/** 길 위의 자리 → 월드 좌표. 앞이 -z 이므로 z = -s (굽은 만큼의 길이 차이는 무시한다) */
export function worldAt(s: number, u: number, up = 0): [number, number, number] {
    return [cxAt(s) + u * HW, yAt(s) + up, -s];
}

/** 그 자리에서 앞을 보는 방향(y 축 회전). 0 이면 -z 를 본다 */
export function headingAt(s: number): number {
    return -Math.atan(slopeAt(s).dx);
}
