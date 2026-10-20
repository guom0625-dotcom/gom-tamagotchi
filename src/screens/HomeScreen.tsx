import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, AppState, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { api, ApiError } from '../api/client';
import { Price } from '../components/Price';
import { Button } from '../components/Button';
import { TopazExchangeModal } from '../components/TopazExchangeModal';
import { NameModal } from '../components/NameModal';
import { PetScene, type PetControl, type Poop, type Stage } from '../pet/PetScene';
import type { PetMode } from '../pet/brain';
import { colors, fontFamilies, fontSizes, radius, shadows } from '../theme';

const FEED_PRICE = 3;

type Cond = 'feed' | 'pat' | 'clean' | 'room';
interface GrowCond { key: Cond; have: number; need: number; missed: number }
interface PetInfo {
    id: string;
    species: string;
    name: string | null;
    stage: Stage;
    fed_today: boolean;
    patted_today: boolean;
    fullness: number;            // 0~3
    poops: Poop[];
    next_poop_at: number | null;
    growth: { next: Stage | null; ready: boolean; conds: GrowCond[] };
}
interface PetState {
    pet: PetInfo;
    room: { level: number; max: number; next_price: number | null };
}
type PetResponse = PetState & { diamonds: number; topaz: number };

const STAGE_NAME: Record<Stage, string> = { egg: '알', baby: '유아', teen: '청소년', adult: '성인' };
const ROOM_NAME = ['작은 방', '중간 방', '큰 방'];

const ERRORS: Record<string, string> = {
    insufficient_gems: '토파즈가 모자라요',
    already_fed: '오늘은 벌써 밥을 먹었어요',
    already_patted: '오늘은 벌써 쓰다듬어 줬어요',
    nothing_to_clean: '치울 똥이 없어요',
    not_ready: '아직 조건을 다 채우지 못했어요',
    max_room: '가장 큰 방이에요',
    egg: '알은 아직 밥을 먹지 않아요',
};

/** 연결된 뒤의 첫 화면 — 펫의 방, 돌보기, 성장, 토파즈 교환 */
export function HomeScreen() {
    const me = useAuthStore(s => s.me)!;
    const refresh = useAuthStore(s => s.refresh);
    const setGems = useAuthStore(s => s.setGems);
    const linkError = useAuthStore(s => s.linkError);
    const insets = useSafeAreaInsets();
    const [exchangeOpen, setExchangeOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const ctrl = useRef<PetControl | null>(null);

    const [state, setState] = useState<PetState | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [bowlFull, setBowlFull] = useState(false);
    const [naming, setNaming] = useState<'hatch' | 'rename' | null>(null);
    const pet = state?.pet ?? null;
    const egg = pet?.stage === 'egg';
    const petName = pet?.name ?? '곰돌이';

    const apply = useCallback((res: PetResponse) => {
        setState({ pet: res.pet, room: res.room });
        setGems({ diamonds: res.diamonds, topaz: res.topaz });
    }, [setGems]);

    const loadPet = useCallback(async () => {
        try { apply(await api<PetResponse>('/pet')); } catch { /* 다음에 다시 */ }
    }, [apply]);

    /** 서버에 일을 시키고 결과로 화면을 바꾼다. 성공하면 true */
    const act = async (path: string, body?: object): Promise<boolean> => {
        if (busy) return false;
        setBusy(true);
        setMsg(null);
        try {
            apply(await api<PetResponse>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }));
            return true;
        } catch (e) {
            const code = e instanceof ApiError ? (e.body as { error?: string })?.error : null;
            setMsg((code && ERRORS[code]) ?? '잘 안 됐어요. 다시 해 주세요');
            void loadPet();
            return false;
        } finally {
            setBusy(false);
        }
    };

    const feed = async () => { if (await act('/pet/feed')) setBowlFull(true); };
    const pat = async () => { if (await act('/pet/pat')) ctrl.current?.pat(); };
    const cleanOne = (id: string) => {
        // 바로 사라지게 하고 서버에 알린다
        setState(s => s && { ...s, pet: { ...s.pet, poops: s.pet.poops.filter(p => p.id !== id) } });
        void act('/pet/clean', { id });
    };
    const grow = async () => {
        if (egg) { setNaming('hatch'); return; }
        await act('/pet/grow');
    };
    const submitName = async (name: string) => {
        const ok = naming === 'hatch' ? await act('/pet/grow', { name }) : await act('/pet/name', { name });
        if (ok) setNaming(null);
    };

    // 시험판: 기분·상태를 손으로 바꿔 본다 (아이 이름을 5번 누르면 나온다). 고르지 않으면 서버 배부름을 따른다
    const [testMode, setTestMode] = useState<PetMode | null>(null);
    const mode: PetMode = testMode ?? (pet && pet.fullness === 0 ? 'hungry' : 'normal');
    const [gone, setGone] = useState(false);
    const [testOpen, setTestOpen] = useState(false);
    const nameTaps = useRef<number[]>([]);
    const tapName = () => {
        const now = Date.now();
        nameTaps.current = [...nameTaps.current.filter(t => now - t < 3000), now];
        if (nameTaps.current.length >= 5) { nameTaps.current = []; setTestOpen(o => !o); }
    };

    useEffect(() => { void loadPet(); }, [loadPet]);

    // 숙제앱에서 다이아를 벌고 돌아왔을 때 잔고가 바로 맞도록
    useEffect(() => {
        const sub = AppState.addEventListener('change', next => { if (next === 'active') { void refresh(); void loadPet(); } });
        return () => sub.remove();
    }, [refresh, loadPet]);

    // 다음 똥이 나올 시간에 다시 읽는다
    useEffect(() => {
        const at = pet?.next_poop_at;
        if (!at) return;
        const id = setTimeout(() => { void loadPet(); }, Math.min(Math.max(at - Date.now(), 0) + 1000, 6 * 3600_000));
        return () => clearTimeout(id);
    }, [pet?.next_poop_at, loadPet]);

    const pull = async () => {
        setRefreshing(true);
        await Promise.all([refresh(), loadPet()]);
        setRefreshing(false);
    };

    const condLabel = (key: Cond) =>
        key === 'feed' ? '🍚 밥 주기' : key === 'pat' ? (egg ? '🥚 품어주기' : '🤚 쓰다듬기') : key === 'clean' ? '🧹 청소' : '🏠 방 넓히기';
    const condValue = (c: GrowCond) =>
        c.key === 'room' ? `${ROOM_NAME[c.need]} 이상`
            : `${c.missed > 0 && c.have < c.need ? `빠진 날 ${c.missed} · ` : ''}${c.have}/${c.need}일`;

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
                {pet && (
                    <Pressable disabled={egg || gone} onPress={() => setNaming('rename')} style={styles.petTitle}>
                        <Text style={styles.petName}>{egg ? '🥚 알' : `${petName} ✏️`}</Text>
                        <Text style={styles.petStage}>{STAGE_NAME[pet.stage]} · {ROOM_NAME[state!.room.level]}</Text>
                    </Pressable>
                )}
                {pet && (
                    <PetScene ctrlRef={ctrl} mode={mode} stage={pet.stage} roomLevel={state!.room.level}
                        poops={pet.poops} gone={gone} bowlFull={bowlFull} onAte={() => setBowlFull(false)} onClean={cleanOne} />
                )}
            </View>

            {gone ? (
                <View style={styles.letter}>
                    <Text style={styles.letterText}>✉️ {withIGa(petName)} 편지를 남겼어요{'\n'}"더 잘 돌봐 줄 주인을 찾아 떠날게요"</Text>
                    <Button variant="sun" label="🥚 새 알 받기 (🔶20)" onPress={() => { setGone(false); setTestMode(null); }} style={{ alignSelf: 'center' }} />
                </View>
            ) : pet && (
                <>
                    <View style={styles.actions}>
                        {egg ? (
                            <Button variant="sun" size="sm" disabled={pet.patted_today || busy}
                                label={pet.patted_today ? '🥚 오늘 품었어요' : '🥚 품어주기'} onPress={pat} />
                        ) : (
                            <>
                                <Button variant="ocean" size="sm" label={`👋 ${callName(petName)}!`} onPress={() => ctrl.current?.call()} />
                                <Button variant="grape" size="sm" disabled={pet.patted_today || busy}
                                    label={pet.patted_today ? '🤚 쓰다듬었어요' : '🤚 쓰다듬기'} onPress={pat} />
                                <Button variant="sun" size="sm" disabled={pet.fed_today || busy}
                                    label={pet.fed_today ? '🍚 오늘 먹었어요' : `🍚 밥 주기 🔶${FEED_PRICE}`} onPress={feed} />
                                {pet.poops.length > 0 && (
                                    <Button variant="ghost" size="sm" disabled={busy} label={`🧹 청소 (${pet.poops.length})`} onPress={() => void act('/pet/clean')} />
                                )}
                            </>
                        )}
                    </View>
                    {!egg && <Text style={styles.fullness}>배부름 {'❤️'.repeat(pet.fullness)}{'🤍'.repeat(3 - pet.fullness)}</Text>}
                    {msg && <Text style={styles.error}>{msg}</Text>}

                    {/* 성장 조건 */}
                    <View style={styles.box}>
                        {pet.growth.next ? (
                            <>
                                <Text style={styles.boxTitle}>
                                    {egg ? '🐣 알에서 깨어나려면' : `⬆️ ${withRo(STAGE_NAME[pet.growth.next])} 자라려면`}
                                </Text>
                                {pet.growth.conds.map(c => {
                                    const done = c.have >= c.need;
                                    return (
                                        <View key={c.key} style={styles.condRow}>
                                            <Text style={[styles.condText, done && styles.condDone]}>{done ? '✅' : '⬜'} {condLabel(c.key)}</Text>
                                            <Text style={[styles.condValue, done && styles.condDone]}>{condValue(c)}</Text>
                                        </View>
                                    );
                                })}
                                <Text style={styles.boxNote}>빠진 날이 이틀 쌓일 때마다 하루씩 줄어요</Text>
                                <Button variant="coral" disabled={!pet.growth.ready || busy} style={{ alignSelf: 'center', marginTop: 4 }}
                                    label={egg ? '🐣 깨어나게 하기' : `⬆️ ${withRo(STAGE_NAME[pet.growth.next])} 성장시키기`} onPress={grow} />
                            </>
                        ) : (
                            <Text style={styles.boxTitle}>🎉 {withIGa(petName)} 다 자랐어요!</Text>
                        )}
                    </View>

                    {/* 방 넓히기 */}
                    <View style={[styles.box, styles.roomBox]}>
                        <Text style={styles.boxTitle}>🏠 {ROOM_NAME[state!.room.level]}</Text>
                        {state!.room.next_price !== null ? (
                            <Button variant="ghost" size="sm" disabled={busy}
                                label={`${withRo(ROOM_NAME[state!.room.level + 1])} 넓히기 🔶${state!.room.next_price}`}
                                onPress={() => void act('/pet/room')} />
                        ) : (
                            <Text style={styles.boxNote}>가장 큰 방이에요</Text>
                        )}
                    </View>
                </>
            )}

            {testOpen && (
                <View style={styles.test}>
                    <Text style={styles.testTitle}>시험용 — 기분·상태 바꾸기</Text>
                    <View style={styles.chips}>
                        <Pressable onPress={() => setTestMode(null)} style={[styles.chip, testMode === null && styles.chipOn]}>
                            <Text style={styles.chipText}>⚙️ 자동</Text>
                        </Pressable>
                        {TEST_MODES.map(([m, label]) => (
                            <Pressable key={m} onPress={() => setTestMode(m)} style={[styles.chip, testMode === m && styles.chipOn]}>
                                <Text style={styles.chipText}>{label}</Text>
                            </Pressable>
                        ))}
                    </View>
                    <View style={styles.chips}>
                        <Pressable onPress={() => setGone(g => !g)} style={[styles.chip, gone && styles.chipOn]}><Text style={styles.chipText}>✉️ 떠남</Text></Pressable>
                    </View>
                    <Text style={styles.testNote}>10초 안에 펫을 5번 누르면 1분 동안 화나요</Text>
                </View>
            )}

            <Button variant="sun" label="💎 → 🔶 토파즈로 바꾸기" onPress={() => setExchangeOpen(true)} style={{ alignSelf: 'center' }} />

            <TopazExchangeModal visible={exchangeOpen} onClose={() => setExchangeOpen(false)} />
            <NameModal
                visible={naming !== null}
                title={naming === 'hatch' ? '🐣 알이 깨어나요!' : '이름 바꾸기'}
                note={naming === 'hatch' ? '어떤 이름을 지어 줄까요?' : undefined}
                initial={naming === 'rename' ? petName : ''}
                confirmLabel={naming === 'hatch' ? '이 이름으로 깨우기' : '바꾸기'}
                busy={busy}
                onConfirm={submitName}
                onClose={() => setNaming(null)}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.paper },
    content: { paddingHorizontal: 20, gap: 16 },
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
    petTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
    petName: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: colors.ink[900] },
    petStage: { fontFamily: fontFamilies.bodyMed, fontSize: fontSizes.sm, color: colors.ink[500] },
    actions: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
    fullness: {
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes.md,
        color: colors.ink[700],
        textAlign: 'center',
    },
    box: {
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: 14,
        gap: 8,
        ...shadows.card,
    },
    roomBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
    boxTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.ink[900] },
    boxNote: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.ink[500] },
    condRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    condText: { fontFamily: fontFamilies.bodyMed, fontSize: fontSizes.md, color: colors.ink[700] },
    condValue: { fontFamily: fontFamilies.bodyMed, fontSize: fontSizes.md, color: colors.ink[500] },
    condDone: { color: colors.mint[500] },
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
});

/** 끝 글자의 받침 (0 = 없음, 8 = ㄹ). 한글이 아니면 -1 */
function batchim(word: string): number {
    const c = word.charCodeAt(word.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : -1;
}
/** 유아로 · 청소년으로 · 큰 방으로 (ㄹ받침은 '로') */
const withRo = (w: string) => w + (batchim(w) > 0 && batchim(w) !== 8 ? '으로' : '로');
/** 곰돌이가 · 뭉치가 · 별님이 */
const withIGa = (w: string) => w + (batchim(w) > 0 ? '이' : '가');

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
