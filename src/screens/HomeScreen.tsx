import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, AppState, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { Price } from '../components/Price';
import { Button } from '../components/Button';
import { TopazExchangeModal } from '../components/TopazExchangeModal';
import { PetScene } from '../pet/PetScene';
import { colors, fontFamilies, fontSizes, radius, shadows } from '../theme';

/** 연결된 뒤의 첫 화면 — 펫의 방, 부르기, 토파즈 교환. (시험판: 곰 한 마리, 이름·밥·성장은 서버 연결 때) */
export function HomeScreen() {
    const me = useAuthStore(s => s.me)!;
    const refresh = useAuthStore(s => s.refresh);
    const linkError = useAuthStore(s => s.linkError);
    const insets = useSafeAreaInsets();
    const [exchangeOpen, setExchangeOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const callPet = useRef<(() => void) | null>(null);
    const petName = '곰돌이';   // 시험판: 이름 짓기는 서버 연결 때

    // 숙제앱에서 다이아를 벌고 돌아왔을 때 잔고가 바로 맞도록
    useEffect(() => {
        const sub = AppState.addEventListener('change', next => { if (next === 'active') refresh(); });
        return () => sub.remove();
    }, [refresh]);

    const pull = async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
    };

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
        >
            <View style={styles.header}>
                <Text style={styles.name}>{me.name}</Text>
                <Price diamonds={me.diamonds} topaz={me.topaz} size={18} showZero />
            </View>

            {linkError && <Text style={styles.error}>{linkError}</Text>}

            <View style={styles.petCard}>
                <PetScene callRef={callPet} />
            </View>

            <Button variant="ocean" label={`👋 ${callName(petName)}!`} onPress={() => callPet.current?.()} style={{ alignSelf: 'center' }} />

            <Button variant="sun" label="💎 → 🔶 토파즈로 바꾸기" onPress={() => setExchangeOpen(true)} style={{ alignSelf: 'center' }} />

            <TopazExchangeModal visible={exchangeOpen} onClose={() => setExchangeOpen(false)} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.paper },
    content: { paddingHorizontal: 20, gap: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    name: {
        fontFamily: fontFamilies.display,
        fontSize: fontSizes['4xl'],
        color: colors.ink[900],
        flexShrink: 1,
    },
    error: {
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes.sm,
        color: colors.coral[700],
        textAlign: 'center',
    },
    petCard: {
        backgroundColor: colors.card,
        borderRadius: radius.xl,
        overflow: 'hidden',
        ...shadows.card,
    },
});

/** 부르는 말: 받침이 있으면 '아', 없으면 '야' (곰돌이 → 곰돌이야, 토순 → 토순아) */
export function callName(name: string): string {
    const last = name.charCodeAt(name.length - 1);
    if (last < 0xac00 || last > 0xd7a3) return name;
    return name + ((last - 0xac00) % 28 ? '아' : '야');
}
