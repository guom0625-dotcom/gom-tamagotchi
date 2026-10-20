import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

// 앱이 켜져 있는 동안 온 알림도 알림바에 보여 준다
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * 연결된 펫 앱을 알림 받는 기기로 서버에 등록한다 (아침 8시·오후 5시 펫 소식).
 * 권한을 거절했거나 Firebase 설정 없이 빌드된 앱이어도 앱은 그대로 동작한다.
 */
export function usePetPush(linked: boolean) {
    useEffect(() => {
        if (!linked || Platform.OS !== 'android') return;
        void (async () => {
            try {
                // Android 13+: 채널이 먼저 있어야 권한 요청 창이 뜬다. 서버는 channel_id 'default' 로 보낸다
                await Notifications.setNotificationChannelAsync('default', {
                    name: '펫 소식',
                    importance: Notifications.AndroidImportance.HIGH,
                });
                let { status } = await Notifications.getPermissionsAsync();
                if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
                if (status !== 'granted') return;
                const token = await Notifications.getDevicePushTokenAsync();
                if (typeof token.data !== 'string') return;
                await api('/pet/push', { method: 'POST', body: JSON.stringify({ token: token.data }) });
            } catch {
                // Firebase 설정 없이 빌드된 앱 등 — 알림 없이 쓴다
            }
        })();
    }, [linked]);
}
