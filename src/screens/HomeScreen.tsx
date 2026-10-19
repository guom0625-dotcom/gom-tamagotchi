import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, AppState, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { api, ApiError } from '../api/client';
import { Price } from '../components/Price';
import { Button } from '../components/Button';
import { TopazExchangeModal } from '../components/TopazExchangeModal';
import { PetScene, type Poop } from '../pet/PetScene';
import type { PetMode } from '../pet/brain';
import { BOWL, CUSHION, WALK_MAX, WALK_MIN } from '../pet/room';
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
    const setGems = useAuthStore(s => s.setGems);
    const [pet, setPet] = useState<PetInfo | null>(null);
    const petName = pet?.name ?? '곰돌이';   // 이름 짓기는 다음 단계
    const [bowlFull, setBowlFull] = useState(false);
    const [feeding, setFeeding] = useState(false);
    const [feedMsg, setFeedMsg] = useState<string | null>(null);

    const loadPet = async () => {
        try { setPet((await api<{ pet: PetInfo }>('/pet')).pet); } catch { /* 다음에 다시 */ }
    };
    useEffect(() => { void loadPet(); }, []);

    const feed = async () => {
        if (feeding || !pet || pet.fed_today) return;
        setFeeding(true);
        setFeedMsg(null);
        try {
            const res = await api<{ pet: PetInfo; diamonds: number; topaz: number }>('/pet/feed', { method: 'POST' });
            setPet(res.pet);
            setGems({ diamonds: res.diamonds, topaz: res.topaz });
            setBowlFull(true);
        } catch (e) {
            const code = e instanceof ApiError ? (e.body as { error?: string })?.error : null;
            if (code === 'insufficient_gems') setFeedMsg(`토파즈가 모자라요 (🔶${FEED_PRICE} 필요)`);
            else if (code === 'already_fed') { setFeedMsg('오늘은 벌써 밥을 먹었어요'); void loadPet(); }
            else setFeedMsg('밥을 주지 못했어요. 다시 해 주세요');
        } finally {
            setFeeding(false);
        }
    };

    // 시험판: 기분·상태·똥을 손으로 바꿔 본다 (이름을 5번 누르면 나온다). 고르지 않으면 서버 배부름을 따른다
    const [testMode, setMode] = useState<PetMode | null>(null);
    const mode: PetMode = testMode ?? (pet && pet.fullness === 0 ? 'hungry' : 'normal');
    const [poops, setPoops] = useState<Poop[]>([]);
    const [gone, setGone] = useState(false);
    const [testOpen, setTestOpen] = useState(false);
    const nameTaps = useRef<number[]>([]);
    const tapName = () => {
        const now = Date.now();
        nameTaps.current = [...nameTaps.current.filter(t => now - t < 3000), now];
        if (nameTaps.current.length >= 5) { nameTaps.current = []; setTestOpen(o => !o); }
    };
    const addPoop = () => setPoops(list => [...list, randomPoop(list)]);

    // 숙제앱에서 다이아를 벌고 돌아왔을 때 잔고가 바로 맞도록
    useEffect(() => {
        const sub = AppState.addEventListener('change', next => { if (next === 'active') { refresh(); void loadPet(); } });
        return () => sub.remove();
    }, [refresh]);

    const pull = async () => {
        setRefreshing(true);
        await Promise.all([refresh(), loadPet()]);
        setRefreshing(false);
    };

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
        >
            <View style={styles.header}>
                <Pressable onPress={tapName} style={{ flexShrink: 1 }}>
                    <Text style={styles.name}>{me.name}</Text>
                </Pressable>
                <Price diamonds={me.diamonds} topaz={me.topaz} size={18} showZero />
            </View>

            {linkError && <Text style={styles.error}>{linkError}</Text>}

            <View style={styles.petCard}>
                <PetScene callRef={callPet} mode={mode} poops={poops} gone={gone}
                    bowlFull={bowlFull} onAte={() => setBowlFull(false)}
                    onClean={id => setPoops(list => list.filter(p => p.id !== id))} />
            </View>

            {gone ? (
                <View style={styles.letter}>
                    <Text style={styles.letterText}>✉️ {petName}가 편지를 남겼어요{'\n'}"더 잘 돌봐 줄 주인을 찾아 떠날게요"</Text>
                    <Button variant="sun" label="🥚 새 알 받기 (🔶20)" onPress={() => { setGone(false); setMode(null); setPoops([]); }} style={{ alignSelf: 'center' }} />
                </View>
            ) : (
                <View style={styles.actions}>
                    <Button variant="ocean" label={`👋 ${callName(petName)}!`} onPress={() => callPet.current?.()} />
                    <Button variant="sun" disabled={!pet || pet.fed_today || feeding}
                        label={pet?.fed_today ? '🍚 오늘 먹었어요' : `🍚 밥 주기 🔶${FEED_PRICE}`} onPress={feed} />
                    {poops.length > 0 && <Button variant="ghost" label={`🧹 청소 (${poops.length})`} onPress={() => setPoops([])} />}
                </View>
            )}

            {!gone && feedMsg && <Text style={styles.error}>{feedMsg}</Text>}
            {!gone && pet && <Text style={styles.fullness}>배부름 {'❤️'.repeat(pet.fullness)}{'🤍'.repeat(3 - pet.fullness)}</Text>}

            {testOpen && (
                <View style={styles.test}>
                    <Text style={styles.testTitle}>시험용 — 기분·상태 바꾸기</Text>
                    <View style={styles.chips}>
                        <Pressable onPress={() => setMode(null)} style={[styles.chip, testMode === null && styles.chipOn]}>
                            <Text style={styles.chipText}>⚙️ 자동</Text>
                        </Pressable>
                        {TEST_MODES.map(([m, label]) => (
                            <Pressable key={m} onPress={() => setMode(m)} style={[styles.chip, testMode === m && styles.chipOn]}>
                                <Text style={styles.chipText}>{label}</Text>
                            </Pressable>
                        ))}
                    </View>
                    <View style={styles.chips}>
                        <Pressable onPress={addPoop} style={styles.chip}><Text style={styles.chipText}>💩 똥 싸기</Text></Pressable>
                        <Pressable onPress={() => setGone(g => !g)} style={[styles.chip, gone && styles.chipOn]}><Text style={styles.chipText}>✉️ 떠남</Text></Pressable>
                    </View>
                    <Text style={styles.testNote}>10초 안에 펫을 5번 누르면 1분 동안 화나요</Text>
                </View>
            )}

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
    fullness: {
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes.md,
        color: colors.ink[700],
        textAlign: 'center',
        marginTop: -8,
    },
    actions: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
    letter: { alignItems: 'center', gap: 12 },
    letterText: {
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes.lg,
        color: colors.ink[700],
        textAlign: 'center',
        lineHeight: 24,
    },
    test: {
        backgroundColor: colors.paper2,
        borderRadius: radius.lg,
        padding: 14,
        gap: 10,
    },
    testTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm, color: colors.ink[500] },
    testNote: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.ink[500] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
        backgroundColor: colors.card,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: colors.ink[200],
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipOn: { borderColor: colors.ocean[500], backgroundColor: colors.ocean[50] },
    chipText: { fontFamily: fontFamilies.bodyMed, fontSize: fontSizes.sm, color: colors.ink[700] },
    petCard: {
        backgroundColor: colors.card,
        borderRadius: radius.xl,
        overflow: 'hidden',
        ...shadows.card,
    },
});

const FEED_PRICE = 3;

interface PetInfo {
    id: string;
    species: string;
    name: string | null;
    fed_days: number;
    fed_today: boolean;
    fullness: number;   // 0~3
}

/** 부르는 말: 받침이 있으면 '아', 없으면 '야' (곰돌이 → 곰돌이야, 토순 → 토순아) */
export function callName(name: string): string {
    const last = name.charCodeAt(name.length - 1);
    if (last < 0xac00 || last > 0xd7a3) return name;
    return name + ((last - 0xac00) % 28 ? '아' : '야');
}

const TEST_MODES: [PetMode, string][] = [
    ['happy', '😊 좋음'], ['normal', '🙂 보통'], ['sad', '😢 우울'], ['angry', '😠 화남'],
    ['hungry', '🍚 배고픔'], ['sleep', '💤 잠'], ['sick', '🤒 아픔'],
];

// 똥 자리: 쿠션·밥그릇·다른 똥과 겹치지 않게
let poopSeq = 0;
function randomPoop(list: Poop[]): Poop {
    const avoid = [CUSHION, BOWL, ...list.map(p => ({ ...p, r: 1.5 }))];
    let x = 15, z = 15;
    for (let i = 0; i < 30; i++) {
        x = WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN);
        z = WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN);
        if (avoid.every(o => Math.hypot(x - o.x, z - o.z) > o.r + 2.5)) break;
    }
    return { id: `p${++poopSeq}`, x, z };
}
