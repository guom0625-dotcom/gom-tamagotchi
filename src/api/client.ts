// 기본은 어디서나 되는 외부 주소. 집 WiFi에서 내부 주소가 응답하면 useServerUrl 이 바꿔준다.
const DEFAULT_BASE = process.env.EXPO_PUBLIC_API_URL_EXTERNAL ?? 'https://guom0625.duckdns.org/hw';

let _base = DEFAULT_BASE;
let _key: string | null = null;

// 앱 시작 직후 서버 주소 판정(내부/외부)이 끝나기 전에 요청이 엉뚱한 주소로 나가지 않도록 기다린다
let _markReady: () => void = () => {};
const _baseReady = Promise.race([
    new Promise<void>(resolve => { _markReady = resolve; }),
    new Promise<void>(resolve => setTimeout(resolve, 4000)),  // 판정이 끝나지 않아도 무한정 막지는 않는다
]);
export const markApiBaseReady = () => _markReady();

export const setApiKey = (key: string | null) => { _key = key; };
export const setApiBase = (url: string) => { _base = url; };

export class ApiError extends Error {
    constructor(public status: number, public body: unknown, message: string) {
        super(message);
    }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
    };
    if (_key) headers['Authorization'] = `Bearer ${_key}`;

    await _baseReady;
    const base = _base;
    let res: Response;
    try {
        res = await fetch(`${base}${path}`, { ...init, headers });
    } catch (e) {
        // 집 WiFi(내부 주소)에서 다른 망으로 옮긴 직후엔 내부 주소가 안 닿는다 → 외부 주소로 바꾼다.
        // 조회(GET)만 바로 다시 보낸다 — 쓰기 요청은 서버에 이미 닿았을 수도 있어 중복을 피한다.
        if (base === DEFAULT_BASE) throw e;
        if (_base === base) _base = DEFAULT_BASE;
        if ((init.method ?? 'GET').toUpperCase() !== 'GET') throw e;
        res = await fetch(`${_base}${path}`, { ...init, headers });
    }
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body, (body as { error?: string }).error ?? 'request_failed');
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
}
