import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useAuthStore } from '../store/authStore';

/** gomtamagotchi://link?code=… 에서 연결 코드를 꺼낸다 */
export function linkCodeFrom(url: string | null): string | null {
    if (!url) return null;
    const m = url.match(/^gomtamagotchi:\/\/link\?(?:.*&)?code=([0-9a-f]{32})(?:&|$)/i);
    return m ? m[1].toLowerCase() : null;
}

/**
 * 앱 시작: 숙제앱 딥링크로 열렸으면 그 코드로 연결하고, 아니면 저장된 키로 시작한다.
 * 켜져 있는 동안 딥링크가 다시 오면(다른 학생으로 바꾸기 등) 그 코드로 다시 연결한다.
 */
export function useDeepLink() {
    const handled = useRef(new Set<string>());

    useEffect(() => {
        const { init, linkWithCode } = useAuthStore.getState();
        const handle = (url: string | null) => {
            const code = linkCodeFrom(url);
            if (!code || handled.current.has(code)) return false;
            handled.current.add(code);
            linkWithCode(code);
            return true;
        };

        Linking.getInitialURL()
            .then(url => { if (!handle(url)) init(); })
            .catch(() => init());
        const sub = Linking.addEventListener('url', ({ url }) => { handle(url); });
        return () => sub.remove();
    }, []);
}
