import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError, setApiKey } from '../api/client';

const STORE_KEY = 'pet_auth_key';

export interface Me {
    id: string;
    name: string;
    diamonds: number;
    topaz: number;
}

/**
 * - loading: 저장된 키 확인 중
 * - unlinked: 키가 없거나 서버가 거부함 → 숙제앱에서 🐣 버튼을 눌러야 한다
 * - linked: 연결됨
 * - offline: 키는 있는데 서버에 닿지 못함 (키는 지우지 않는다)
 */
type Status = 'loading' | 'unlinked' | 'linked' | 'offline';

interface AuthState {
    status: Status;
    me: Me | null;
    linkError: string | null;

    init: () => Promise<void>;
    refresh: () => Promise<void>;
    linkWithCode: (code: string) => Promise<void>;
    setGems: (g: { diamonds: number; topaz: number }) => void;
}

const fetchMe = async (): Promise<Me> => {
    const me = await api<Me & { role: string }>('/me');
    return { id: me.id, name: me.name, diamonds: me.diamonds ?? 0, topaz: me.topaz ?? 0 };
};

export const useAuthStore = create<AuthState>((set, get) => ({
    status: 'loading',
    me: null,
    linkError: null,

    init: async () => {
        const key = await SecureStore.getItemAsync(STORE_KEY).catch(() => null);
        if (!key) { set({ status: 'unlinked' }); return; }
        setApiKey(key);
        await get().refresh();
    },

    refresh: async () => {
        try {
            const me = await fetchMe();
            set({ status: 'linked', me });
        } catch (e) {
            // 서버가 키를 거부(401)한 경우에만 연결을 끊는다.
            // 네트워크 문제로 실패했을 때 키를 지우면 숙제앱에서 다시 연결해야 한다.
            if (e instanceof ApiError && e.status === 401) {
                await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
                setApiKey(null);
                set({ status: 'unlinked', me: null });
            } else if (get().status !== 'linked') {
                set({ status: 'offline' });
            }
        }
    },

    // 숙제앱이 딥링크로 넘겨준 1회용 코드를 같은 계정의 새 키로 바꾼다
    linkWithCode: async (code) => {
        set({ linkError: null });
        try {
            const res = await api<{ id: string; name: string; key: string }>('/auth/link', {
                method: 'POST',
                body: JSON.stringify({ code }),
            });
            await SecureStore.setItemAsync(STORE_KEY, res.key);
            setApiKey(res.key);
            await get().refresh();
        } catch (e) {
            const msg = e instanceof ApiError
                ? (e.status === 429 ? '잠시 뒤에 다시 해 주세요' : '연결 코드가 만료됐어요. 숙제앱에서 🐣 버튼을 다시 눌러 주세요')
                : '서버에 연결하지 못했어요. 인터넷을 확인하고 숙제앱에서 다시 눌러 주세요';
            set({ linkError: msg });
            // 이미 연결된 계정이 있으면 그대로 쓴다
            if (get().status === 'loading') await get().init();
        }
    },

    setGems: ({ diamonds, topaz }) => {
        const me = get().me;
        if (me) set({ me: { ...me, diamonds, topaz } });
    },
}));
