import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, AppState, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { api, ApiError } from '../api/client';
import { Price } from '../components/Price';
import { Button } from '../components/Button';
import { TopazExchangeModal } from '../components/TopazExchangeModal';
import { NameModal } from '../components/NameModal';
import { isSpecies, lookTitle } from '../pet/species';
import { ShopModal } from '../components/ShopModal';
import { DexModal } from '../components/DexModal';
import { WalkModal } from '../components/WalkModal';
import { PetScene, type PetControl, type Stage } from '../pet/PetScene';
import type { PetMode } from '../pet/brain';
import type { Build } from '../pet/model';
import type { Cond, GrowCond, PetResponse } from '../pet/api';
import { colors, fontFamilies, fontSizes, radius, shadows } from '../theme';

const STAGE_NAME: Record<Stage, string> = { egg: '알', baby: '유아', teen: '청소년', adult: '성인' };
const ROOM_NAME = ['작은 방', '중간 방', '큰 방'];
const BUILD_NAME: Record<Build, string> = { thin: '홀쭉', normal: '보통', chubby: '통통', fat: '뚱뚱' };
const BUILDS: Build[] = ['thin', 'normal', 'chubby', 'fat'];

const ERRORS: Record<string, string> = {
    insufficient_gems: '토파즈가 모자라요',
    already_fed: '오늘은 벌써 밥을 먹었어요',
    already_patted: '오늘은 벌써 쓰다듬어 줬어요',
    nothing_to_clean: '치울 똥이 없어요',
    not_ready: '아직 자랄 준비가 안 됐어요',
    sick: '아플 때는 자라지 않아요',
    max_room: '가장 큰 방이에요',
    egg: '알은 아직 할 수 없어요',
    gone: '펫이 떠났어요',
    severe: '약으로는 안 나아요. 병원에 가야 해요',
    not_severe: '약을 먹으면 나아요',
    already_medicine: '약은 벌써 먹었어요',
    already_hospital: '오늘은 병원에 다녀왔어요',
    too_many_snacks: '간식은 하루 2번까지예요',
    room_full: '방이 꽉 찼어요. 다른 걸 창고에 넣어 주세요',
    sick_in_use: '아픈 동안은 침대와 구급상자를 창고에 넣을 수 없어요',
    helper_cooldown: '돌봄 도우미는 일주일에 1번이에요',
    no_missed_day: '채울 빠진 날이 없어요',
    already_owned: '벌써 가지고 있어요',
    room_not_ready: '더 잘 돌봐 주면 방을 넓힐 수 있어요',
    not_owned: '이 옷은 지금 몸에 안 맞아요',
    not_adult: '성인이 되어야 졸업할 수 있어요',
};

/** 잠자는 시간 (한국 시각): 밤 0~7시, 낮 9~16시. 주말도 같다 */
function isSleepTime(now = Date.now()) {
    const h = new Date(now + 9 * 3600_000).getUTCHours();
    return h < 7 || (h >= 9 && h < 16);
}

/** 연결된 뒤의 첫 화면 — 펫의 방, 돌보기, 성장, 상점, 토파즈 교환 */
export function HomeScreen() {
    const me = useAuthStore(s => s.me)!;
    const refresh = useAuthStore(s => s.refresh);
    const setGems = useAuthStore(s => s.setGems);
    const linkError = useAuthStore(s => s.linkError);
    const insets = useSafeAreaInsets();
    const [exchangeOpen, setExchangeOpen] = useState(false);
    const [shopOpen, setShopOpen] = useState(false);
    const [dexOpen, setDexOpen] = useState(false);
    const [gameOpen, setGameOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const [refreshing, setRefreshing] = useState(false);
    const ctrl = useRef<PetControl | null>(null);

    const [data, setData] = useState<PetResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [bowlFull, setBowlFull] = useState(false);
    // 밥을 차려도 다 먹기 전까지는 하트를 그대로 둔다 (서버는 차리는 순간 가득 찬 값을 준다)
    const [heldFullness, setHeldFullness] = useState<number | null>(null);
    const [naming, setNaming] = useState<'hatch' | 'rename' | null>(null);
    const pet = data?.pet ?? null;
    const egg = pet?.stage === 'egg';
    const gone = !!pet?.gone;
    // '치즈 고양이'처럼 털색·무늬까지
    const speciesName = isSpecies(pet?.species) ? lookTitle(pet.species, pet.variant) : '아기';
    const petName = pet?.name ?? speciesName;

    const apply = useCallback((res: PetResponse) => {
        setData(res);
        setGems({ diamonds: res.diamonds, topaz: res.topaz });
    }, [setGems]);

    const loadPet = useCallback(async () => {
        try { apply(await api<PetResponse>('/pet')); } catch { /* 다음에 다시 */ }
    }, [apply]);

    /** 서버에 일을 시키고 결과로 화면을 바꾼다. 성공하면 true */
    const busyRef = useRef(false);
    const act = useCallback(async (path: string, body?: object): Promise<boolean> => {
        if (busyRef.current) return false;
        busyRef.current = true;
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
            busyRef.current = false;
            setBusy(false);
        }
    }, [apply, loadPet]);

    const feed = async () => {
        const before = data?.pet.fullness ?? null;
        if (await act('/pet/feed')) { setHeldFullness(before); setBowlFull(true); }
    };
    const pat = async () => { if (await act('/pet/pat')) ctrl.current?.pat(); };
    const medicine = async () => { if (await act('/pet/medicine')) ctrl.current?.medicine(); };
    const hospital = async () => { if (await act('/pet/hospital')) ctrl.current?.hospital(); };
    const cleanOne = (id: string) => {
        // 바로 사라지게 하고 서버에 알린다
        setData(d => d && { ...d, pet: { ...d.pet, poops: d.pet.poops.filter(p => p.id !== id) } });
        void act('/pet/clean', { id });
    };
    const grow = async () => {
        // 알이 깨어나면 무엇이 나왔는지 보여 주고 이름을 묻는다
        if (await act('/pet/grow') && egg) setNaming('hatch');
    };
    // 졸업: 도감에 남기고 새 알을 받는다. 방은 작은 방으로, 물건은 모두 창고로
    const graduate = () => {
        Alert.alert(`🎓 ${withIGa(petName)} 졸업할까요?`, '도감에 남고 새 알을 받아요.\n방은 작은 방으로 돌아가고, 물건은 모두 창고에 들어가요.', [
            { text: '아직이요', style: 'cancel' },
            { text: '졸업시키기', onPress: async () => { if (await act('/pet/graduate')) { askedName.current = false; setDexOpen(true); } } },
        ]);
    };
    const submitName = async (name: string) => {
        if (await act('/pet/name', { name })) setNaming(null);
    };
    // 깨어났는데 아직 이름이 없으면 (이름 짓기 창을 닫았거나 앱을 껐을 때) 한 번 더 묻는다
    const askedName = useRef(false);
    useEffect(() => {
        if (pet && pet.stage !== 'egg' && !pet.gone && !pet.name && !askedName.current) {
            askedName.current = true;
            setNaming('hatch');
        }
    }, [pet]);

    // 시험 패널 (시험 계정에서 아이 이름을 5번 누르면 나온다)
    const tester = !!data?.tester;
    const [testOpen, setTestOpen] = useState(false);
    const [testMode, setTestMode] = useState<PetMode | null>(null);
    const [testBuild, setTestBuild] = useState<Build | null>(null);
    const [showConds, setShowConds] = useState(true);   // 시험 계정만: 성장 조건 숫자 보기
    const nameTaps = useRef<number[]>([]);
    const tapName = () => {
        if (!tester) return;
        const now = Date.now();
        nameTaps.current = [...nameTaps.current.filter(t => now - t < 3000), now];
        if (nameTaps.current.length >= 5) { nameTaps.current = []; setTestOpen(o => !o); }
    };

    // 잠자는 시간이 바뀌면 다시 그린다
    const [sleeping, setSleeping] = useState(isSleepTime());
    useEffect(() => {
        const id = setInterval(() => setSleeping(isSleepTime()), 60_000);
        return () => clearInterval(id);
    }, []);
    // 기분·상태: 아픔 > 잠 > 서버 기분 (시험 패널에서 고르면 그것)
    const build: Build = testBuild ?? pet?.build ?? 'normal';
    const mode: PetMode = testMode ?? (!pet ? 'normal' : pet.mood === 'sick' ? 'sick' : sleeping ? 'sleep' : pet.mood);

    useEffect(() => { void loadPet(); }, [loadPet]);

    // 숙제앱에서 다이아를 벌고 돌아왔을 때 잔고가 바로 맞도록
    useEffect(() => {
        const sub = AppState.addEventListener('change', next => { if (next === 'active') { void refresh(); void loadPet(); } });
        return () => sub.remove();
    }, [refresh, loadPet]);

    // 다음에 무언가 바뀌는 시각(똥·아픔·간식 끝)에 다시 읽는다
    useEffect(() => {
        const at = pet?.next_change_at;
        if (!at) return;
        const id = setTimeout(() => { void loadPet(); }, Math.min(Math.max(at - Date.now(), 0) + 1000, 6 * 3600_000));
        return () => clearTimeout(id);
    }, [pet?.next_change_at, loadPet]);

    const pull = async () => {
        setRefreshing(true);
        await Promise.all([refresh(), loadPet()]);
        setRefreshing(false);
    };

    const condLabel = (key: Cond) =>
        key === 'feed' ? '🍚 밥 주기' : key === 'pat' ? (egg ? '🥚 품어주기' : '🤚 쓰다듬기') : key === 'clean' ? '🧹 청소' : key === 'walk' ? '🌲 산책' : '🏠 방 넓히기';
    const condValue = (c: GrowCond) =>
        c.key === 'room' ? `${ROOM_NAME[c.need]} 이상`
            : `${c.missed > 0 && c.have < c.need ? `빠진 날 ${c.missed} · ` : ''}${c.have}/${c.need}일`;

    const placed = data ? data.items.filter(i => i.placed).map(i => i.key) : [];
    const h = pet?.health;

    return (
        <ScrollView
            ref={scrollRef}
            style={styles.screen}
            contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
            scrollEnabled={!editing}
        >
            <View style={styles.header}>
                <Pressable onPress={tapName} style={{ flexShrink: 1 }}>
                    <Text style={styles.name}>{me.name}</Text>
                </Pressable>
                <Price diamonds={me.diamonds} rubies={me.rubies} topaz={me.topaz} size={18} showZero />
            </View>

            {linkError && <Text style={styles.error}>{linkError}</Text>}

            <View style={styles.petCard}>
                {pet && data && (
                    <Pressable disabled={egg || gone} onPress={() => setNaming('rename')} style={styles.petTitle}>
                        <Text style={styles.petName}>{egg ? '🥚 알' : `${petName} ✏️`}</Text>
                        <Text style={styles.petStage}>
                            {egg ? '무엇이 나올까요? ❓' : `${STAGE_NAME[pet.stage]} ${speciesName}`}{!egg && build !== 'normal' ? ` · ${BUILD_NAME[build]}` : ''} · {ROOM_NAME[data.room.level]}
                            {!egg && !gone && sleeping && pet.mood !== 'sick' ? ' · 💤' : ''}
                        </Text>
                    </Pressable>
                )}
                {pet && data && (
                    <PetScene ctrlRef={ctrl} mode={mode} stage={pet.stage} roomLevel={data.room.level}
                        poops={pet.poops} gone={gone} bowlFull={bowlFull} onAte={() => { setBowlFull(false); setHeldFullness(null); }} onClean={cleanOne}
                        decor={{ items: placed, wallpaper: data.decor.wallpaper, cushion: data.decor.cushion }}
                        robotCleaned={pet.robot_cleaned} outfit={pet.wear} species={pet.species} variant={pet.variant} build={build}
                        placement={data.layout ?? {}} editing={editing}
                        onEditDone={async layout => {
                            if (!layout) { setEditing(false); return; }
                            if (await act('/pet/layout', { layout })) setEditing(false);
                        }} />
                )}
            </View>

            {pet && data && (gone ? (
                <View style={styles.letter}>
                    <Text style={styles.letterText}>
                        ✉️ {withIGa(petName)} 편지를 남겼어요{'\n'}
                        "{pet.gone?.reason === 'hunger' ? '배가 너무 고팠어요.' : '너무 아팠어요.'} 더 잘 돌봐 줄 주인을 찾아 떠날게요"
                    </Text>
                    <Button variant="sun" disabled={busy} label={`🥚 새 알 받기 🔶${data.shop.new_egg}`} onPress={() => void act('/pet/new-egg')} style={{ alignSelf: 'center' }} />
                </View>
            ) : (
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
                                    label={pet.auto_fed_today ? '🍽️ 급식기가 줬어요' : pet.fed_today ? '🍚 오늘 먹었어요' : `🍚 밥 주기 🔶${data.shop.feed}`} onPress={feed} />
                                <Button variant="ghost" size="sm" label={pet.walked_today ? '🌲 산책 성공' : pet.walk?.score ? `🌲 산책 ${pet.walk.score}/${pet.walk.goal}` : '🌲 산책하기'} onPress={() => setGameOpen(true)} />
                                {pet.poops.length > 0 && (
                                    <Button variant="ghost" size="sm" disabled={busy} label={`🧹 청소 (${pet.poops.length})`} onPress={() => void act('/pet/clean')} />
                                )}
                            </>
                        )}
                        <Button variant="coral" size="sm" label="🛒 상점" onPress={() => setShopOpen(true)} />
                        {data.dex && <Button variant="ghost" size="sm" label={`📖 도감 ${data.dex.pets.length > 0 ? new Set(data.dex.pets.map(d => `${d.species}:${d.variant}`)).size : 0}/${data.dex.total}`} onPress={() => setDexOpen(true)} />}
                    </View>
                    {!egg && <Text style={styles.fullness}>배부름 {'❤️'.repeat(heldFullness ?? pet.fullness)}{'🤍'.repeat(3 - (heldFullness ?? pet.fullness))}</Text>}
                    {msg && <Text style={styles.error}>{msg}</Text>}

                    {/* 아플 때 */}
                    {h && (
                        <View style={[styles.box, styles.sickBox]}>
                            <Text style={styles.boxTitle}>{h.severe ? '🚑 많이 아파요! 약으로는 안 나아요' : `🤒 ${withIGa(petName)} 아파요`}</Text>
                            {h.severe ? (
                                <Text style={styles.condText}>🏥 병원 {h.hospital_visits}/{h.hospital_needed}일 다니기</Text>
                            ) : (
                                <Text style={styles.condText}>{h.med_given ? '✅' : '⬜'} 💊 약 먹기</Text>
                            )}
                            {h.hungry && <Text style={styles.condText}>⬜ 🍚 밥도 먹어야 나아요</Text>}
                            {h.dirty && <Text style={styles.condText}>⬜ 🧹 똥도 치워야 나아요</Text>}
                            {h.severe ? (
                                <Button variant="coral" size="sm" disabled={h.visited_today || busy} style={{ alignSelf: 'center' }}
                                    label={h.visited_today ? '🏥 오늘은 다녀왔어요' : `🏥 병원 가기 🔶${data.shop.hospital}`} onPress={hospital} />
                            ) : !h.med_given && (
                                <Button variant="coral" size="sm" disabled={busy} style={{ alignSelf: 'center' }}
                                    label={`💊 약 주기 🔶${data.shop.medicine}`} onPress={medicine} />
                            )}
                        </View>
                    )}

                    {/* 성장 — 아이에게는 무엇이 몇 번 남았는지 보이지 않는다 */}
                    <View style={styles.box}>
                        {!pet.growth.next ? (
                            <>
                                <Text style={styles.boxTitle}>🎉 {withIGa(petName)} 다 자랐어요!</Text>
                                <Text style={styles.boxNote}>졸업하면 도감에 남고 새 알을 받아요. 더 키워도 돼요</Text>
                                <Button variant="coral" disabled={busy || !!h} style={{ alignSelf: 'center', marginTop: 4 }}
                                    label="🎓 졸업시키기" onPress={graduate} />
                            </>
                        ) : tester && showConds && pet.growth.conds.length > 0 ? (
                            <>
                                <Text style={styles.boxTitle}>
                                    {egg ? '🐣 알에서 깨어나려면' : `⬆️ ${withRo(STAGE_NAME[pet.growth.next])} 자라려면`} (시험 계정만 보임)
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
                            </>
                        ) : pet.growth.ready ? (
                            <Text style={styles.boxTitle}>{egg ? '🐣 알이 꿈틀꿈틀! 깨어날 것 같아요' : `✨ ${withIGa(petName)} 자랄 준비가 됐어요!`}</Text>
                        ) : (
                            <>
                                <Text style={styles.boxTitle}>{egg ? '🥚 매일 품어 주면 언젠가 깨어나요' : '🌱 매일 잘 돌봐 주면 언젠가 자라요'}</Text>
                                {data.room.can_upgrade && (
                                    <Text style={styles.boxNote}>🏠 방을 넓혀 주면 자랄 수 있어요!</Text>
                                )}
                            </>
                        )}
                        {pet.growth.next && pet.growth.ready && (
                            <Button variant="coral" disabled={busy} style={{ alignSelf: 'center', marginTop: 4 }}
                                label={egg ? '🐣 깨어나게 하기' : `⬆️ ${withRo(STAGE_NAME[pet.growth.next])} 성장시키기`} onPress={grow} />
                        )}
                    </View>

                    {/* 방 넓히기 */}
                    <View style={[styles.box, styles.roomBox]}>
                        <View>
                            <Text style={styles.boxTitle}>🏠 {ROOM_NAME[data.room.level]}</Text>
                            <Text style={styles.boxNote}>물건 {data.room.used}/{data.room.slots}개 꺼내 놓음</Text>
                            {data.room.next_price !== null && !data.room.can_upgrade && (
                                <Text style={styles.boxNote}>잘 돌봐 주면 넓힐 수 있어요</Text>
                            )}
                        </View>
                        <View style={{ gap: 6, alignItems: 'flex-end' }}>
                            <Button variant="ghost" size="sm" disabled={busy || editing} label="🪄 꾸미기"
                                onPress={() => { setEditing(true); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} />
                            {data.room.next_price !== null ? (
                                // 돌봄 조건을 다 채워야 켜진다 → 넓히면 성장 버튼이 켜진다
                                <Button variant={data.room.can_upgrade ? 'coral' : 'ghost'} size="sm" disabled={busy || !data.room.can_upgrade}
                                    label={`${withRo(ROOM_NAME[data.room.level + 1])} 넓히기 🔶${data.room.next_price}`}
                                    onPress={() => void act('/pet/room')} />
                            ) : (
                                <Text style={styles.boxNote}>가장 큰 방이에요</Text>
                            )}
                        </View>
                    </View>
                </>
            ))}

            {tester && testOpen && (
                <View style={styles.test}>
                    <Text style={styles.testTitle}>시험용 — 화면만 바꾸기 (서버는 그대로)</Text>
                    <View style={styles.chips}>
                        <Chip on={testMode === null} label="⚙️ 자동" onPress={() => setTestMode(null)} />
                        {TEST_MODES.map(([m, label]) => <Chip key={m} on={testMode === m} label={label} onPress={() => setTestMode(m)} />)}
                    </View>
                    <View style={styles.chips}>
                        <Chip on={testBuild === null} label={`⚙️ 체형 자동 (${BUILD_NAME[pet?.build ?? 'normal']}${pet?.build_score !== undefined ? ` ${pet.build_score}점` : ''})`} onPress={() => setTestBuild(null)} />
                        {BUILDS.map(b => <Chip key={b} on={testBuild === b} label={BUILD_NAME[b]} onPress={() => setTestBuild(b)} />)}
                    </View>
                    <View style={styles.chips}>
                        <Chip on={showConds} label="📋 성장 조건 숫자 보기" onPress={() => setShowConds(v => !v)} />
                    </View>
                    <Text style={styles.testTitle}>시험용 — 서버 상태 바꾸기 (이 계정만)</Text>
                    <View style={styles.chips}>
                        {TEST_ACTIONS.map(([action, label]) => (
                            <Chip key={action} label={label} onPress={() => void act('/pet/test', { action })} />
                        ))}
                    </View>
                    <Text style={styles.testNote}>
                        하루 지나기: 날짜 기록을 하루 과거로 밀어요 (배고픔·아픔·성장 일수 확인용).{'\n'}
                        8시간 지나기: 똥이 나오는 시간·간식 기분이 그만큼 지나요.{'\n'}
                        잠: 밤 0~7시, 낮 9~16시에는 자동으로 자요. 위 칩으로 바꿔 볼 수 있어요.{'\n'}
                        10초 안에 펫을 5번 누르면 1분 동안 화나요.
                    </Text>
                </View>
            )}

            <Button variant="sun" label="💎 보석을 🔶 토파즈로 바꾸기" onPress={() => setExchangeOpen(true)} style={{ alignSelf: 'center' }} />

            <TopazExchangeModal visible={exchangeOpen} onClose={() => setExchangeOpen(false)} />
            {data && (
                <ShopModal visible={shopOpen} data={data} busy={busy} act={act}
                    onSnack={emoji => setTimeout(() => ctrl.current?.snack(emoji), 300)} onClose={() => setShopOpen(false)} />
            )}
            {data?.dex && pet && (
                <WalkModal visible={gameOpen} onClose={() => setGameOpen(false)} dex={data.dex.pets} onPlayed={() => void loadPet()}
                    walkedToday={!!pet.walked_today} walk={pet.walk ?? null}
                    current={!egg && !gone && isSpecies(pet.species) ? {
                        id: pet.id, species: pet.species, variant: pet.variant, stage: pet.stage as Exclude<Stage, 'egg'>,
                        build: pet.build ?? 'normal', outfit: pet.wear, name: petName,
                    } : null}
                    currentBlock={pet.mood === 'sick' ? '아플 때는 산책을 못 해요' : pet.mood === 'hungry' ? '배가 고파서 못 가요. 밥을 먼저 주세요'
                        : mode === 'sleep' ? '자는 중이에요. 깨어 있을 때 가요 (도감 친구와는 갈 수 있어요)' : null} />
            )}
            {data?.dex && <DexModal visible={dexOpen} pets={data.dex.pets} total={data.dex.total} onClose={() => setDexOpen(false)} />}
            <NameModal
                visible={naming !== null}
                title={naming === 'hatch' ? `🐣 ${withIGa(speciesName)} 태어났어요!` : '이름 바꾸기'}
                note={naming === 'hatch' ? '어떤 이름을 지어 줄까요?' : undefined}
                initial={naming === 'rename' ? petName : ''}
                confirmLabel={naming === 'hatch' ? '이 이름으로 할래요' : '바꾸기'}
                busy={busy}
                onConfirm={submitName}
                onClose={() => setNaming(null)}
            />
        </ScrollView>
    );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
            <Text style={styles.chipText}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.paper },
    // 덱스·태블릿처럼 넓은 화면에서도 폰 너비로 가운데에 (방이 너무 커지지 않게)
    content: { paddingHorizontal: 20, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' },
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
    sickBox: { borderWidth: 2, borderColor: colors.coral[300] },
    roomBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
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
    testNote: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.ink[500], lineHeight: 17 },
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

// 서버 /pet/test 의 action
const TEST_ACTIONS: [string, string][] = [
    ['game_reset', '🌲 산책 판수 되돌리기'],
    ['next_day', '⏩ 하루 지나기'], ['hours_8', '⏩ 8시간 지나기'], ['fill', '✅ 성장 조건 채우기'],
    ['reset_today', '🔄 오늘 기록 지우기'], ['poop', '💩 똥 싸기'], ['poop_old', '💩 하루 지난 똥'],
    ['sick', '🤒 아프게'], ['severe', '🚑 중병으로'], ['heal', '💚 다 낫게'],
    ['leave', '✉️ 떠나게'], ['new_egg', '🥚 새 알 (무료)'], ['reset_items', '🧹 방·아이템 초기화'],
    ['next_look', '🎨 다음 종류·무늬'], ['notify', '🔔 알림 지금 받기'],
];
