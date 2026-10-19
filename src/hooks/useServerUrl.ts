import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { markApiBaseReady, setApiBase } from '../api/client';

const INTERNAL_URL = process.env.EXPO_PUBLIC_API_URL_INTERNAL ?? 'http://192.168.1.225:3100';
const EXTERNAL_URL = process.env.EXPO_PUBLIC_API_URL_EXTERNAL ?? 'https://guom0625.duckdns.org/hw';
const PROBE_TIMEOUT_MS = 1500;

// 집 WiFi 안에서는 공유기가 자기 공인 주소로 되돌아오는 접속을 못 받아 외부 주소가 안 될 수 있다.
// WiFi 이름(SSID)으로 구분하려면 위치 권한이 필요하므로, 대신 내부 주소가 실제로 응답하는지 직접 찔러본다.
async function internalReachable(): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
        const res = await fetch(`${INTERNAL_URL}/health`, { signal: ctrl.signal });
        if (!res.ok) return false;
        const body = await res.json() as { app?: string };
        return body.app === 'gom-homework';  // 다른 집 공유기의 같은 주소에 속지 않도록
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

async function resolveUrl(isWifi: boolean): Promise<string> {
    return isWifi && await internalReachable() ? INTERNAL_URL : EXTERNAL_URL;
}

/** 네트워크가 바뀌거나 앱이 다시 앞으로 나올 때마다 서버 주소(내부/외부)를 다시 고른다. 첫 판정이 끝나야 API 요청이 나간다. */
export function useServerUrl() {
    useEffect(() => {
        let seq = 0;
        const apply = async (isWifi: boolean) => {
            const mine = ++seq;
            const url = await resolveUrl(isWifi);
            if (mine !== seq) return;  // 그 사이 네트워크가 또 바뀜
            setApiBase(url);
            markApiBaseReady();
        };

        NetInfo.fetch().then(state => apply(state.type === 'wifi')).catch(() => markApiBaseReady());
        const unsub = NetInfo.addEventListener(state => { apply(state.type === 'wifi'); });
        // 앱이 뒤에 있는 동안 망이 바뀌면 이벤트를 놓칠 수 있어, 앞으로 나올 때도 다시 고른다
        const sub = AppState.addEventListener('change', next => {
            if (next === 'active') NetInfo.fetch().then(state => apply(state.type === 'wifi')).catch(() => {});
        });
        return () => { unsub(); sub.remove(); };
    }, []);
}
