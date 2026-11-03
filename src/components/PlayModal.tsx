// 🐍 놀아주기 — 뱀 게임 한 판 (2026-11-03 사용자 결정). 하루 필수 돌봄: 지금 키우는 펫과 한 판 시작하면 그날 놀아 준 날(점수 기준 없음).
// 하루 첫 판 무료, 그 뒤로 한 판 🔶1 (산책 판 수와 따로). 순위는 서버 전체, 보상은 펫 기분좋음.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import { Button } from './Button';
import { PetThumb } from './DexModal';
import { SnakeGame, type SnakeResult } from '../game/SnakeGame';
import { isSpecies, type Species } from '../pet/species';
import type { Build, BodyStage, Outfit } from '../pet/model';
import type { GameInfo } from '../pet/api';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

const EMOJI: Record<Species, string> = { bear: '🐻', dog: '🐶', cat: '🐱', rabbit: '🐰', squirrel: '🐿️', hamster: '🐹' };
const ERRORS: Record<string, string> = {
    insufficient_gems: '토파즈가 모자라요',
    sick: '아플 때는 못 놀아요',
    hungry: '배가 고파서 못 놀아요. 밥을 먼저 주세요',
    egg: '알은 아직 못 놀아요',
    gone: '펫이 떠났어요',
    not_found: '지금은 할 수 없어요',
    expired: '너무 오래 지나서 기록하지 못했어요',
};
/** '초코랑' / '콩이랑' — 받침이 있으면 '이랑' */
const withRang = (name: string) => {
    const c = name.charCodeAt(name.length - 1);
    return name + (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '이랑' : '랑');
};

interface Props {
    visible: boolean;
    onClose: () => void;
    /** 지금 키우는 펫 (알·떠남이면 null) */
    current: { id: string; species: Species; variant: number; stage: BodyStage; build: Build; outfit: Outfit; name: string } | null;
    /** 지금 펫으로 못 하는 까닭 (자는 중 등). null 이면 할 수 있다 */
    currentBlock: string | null;
    /** 오늘 놀아 줬나 */
    playedToday: boolean;
    /** 한 판을 시작했거나 끝났다 (놀아 준 날·기분·잔고가 바뀌었으니 다시 읽는다) */
    onPlayed: () => void;
}

export function PlayModal({ visible, onClose, current, currentBlock, playedToday, onPlayed }: Props) {
    const insets = useSafeAreaInsets();
    const [info, setInfo] = useState<GameInfo | null>(null);
    const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
    const [game, setGame] = useState<{ id: string; n: number } | null>(null);
    const [result, setResult] = useState<{ score: number; prevBest: number | null } | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try { setInfo(await api<GameInfo>('/pet/game?kind=snake')); } catch { /* 다음에 */ }
    }, []);
    useEffect(() => {
        if (!visible) return;
        setPhase('ready'); setMsg(null); setResult(null);
        void load();
    }, [visible, load]);

    const errText = (e: unknown) => {
        const code = e instanceof ApiError ? (e.body as { error?: string })?.error : null;
        return (code && ERRORS[code]) ?? '잘 안 됐어요. 다시 해 주세요';
    };

    const start = async () => {
        if (!current || busy) return;
        if (currentBlock) { setMsg(currentBlock); return; }
        setBusy(true); setMsg(null);
        try {
            const r = await api<GameInfo & { game: { id: string } }>('/pet/game/start', { method: 'POST', body: JSON.stringify({ pet_id: current.id, kind: 'snake' }) });
            setInfo(r);
            setResult(null);
            onPlayed();   // 놀아 준 날이 됐다 (토파즈를 냈으면 잔고도)
            setGame(g => ({ id: r.game.id, n: (g?.n ?? 0) + 1 }));
            setPhase('play');
        } catch (e) {
            setMsg(errText(e));
        } finally { setBusy(false); }
    };

    const over = async (r: SnakeResult) => {
        if (!game) return;
        const prevBest = info?.best ?? null;
        setResult({ score: r.score, prevBest });
        setPhase('over');
        try {
            setInfo(await api<GameInfo>('/pet/game/end', { method: 'POST', body: JSON.stringify({ id: game.id, score_ms: r.ms, score: r.score }) }));
            onPlayed();
        } catch (e) {
            setMsg(errText(e));
        }
    };

    const close = () => { if (phase !== 'play') onClose(); };
    const newRecord = result && result.score > 0 && (result.prevBest === null || result.score > result.prevBest);
    const free = !!info && info.plays_left > 0;
    const cantPay = !!info && !free && (!info.price || (info.topaz ?? 0) < info.price);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
            <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
                <View style={styles.inner}>
                    <View style={styles.header}>
                        <Text style={styles.title}>🐍 놀아주기</Text>
                        {info && <Text style={styles.plays}>{free ? '오늘 첫 판 무료' : info.price ? `한 판 🔶${info.price}` : ''}</Text>}
                    </View>

                    {phase === 'play' && game && current ? (
                        <SnakeGame key={game.n} char={current} onOver={r => void over(r)} />
                    ) : (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
                            {current && (
                                <View style={[styles.day, playedToday && styles.dayDone]}>
                                    <PetThumb species={current.species} variant={current.variant} stage={current.stage} size={56} />
                                    <Text style={styles.dayText}>{playedToday
                                        ? `✅ 오늘 ${withRang(current.name)} 놀았어요!`
                                        : `🐍 오늘 ${withRang(current.name)} 한 판 놀아 주세요`}</Text>
                                </View>
                            )}
                            <Text style={styles.note}>화면을 위·아래·왼쪽·오른쪽으로 밀어서 방향을 바꿔요. 🍎 사과를 먹을 때마다 아기 동물 친구가 한 마리씩 줄을 서서 따라와요. 울타리나 친구 줄에 부딪히면 끝!</Text>
                            {phase === 'over' && result && (
                                <View style={[styles.box, styles.resultBox]}>
                                    <Text style={styles.resultScore}>🍎 {result.score}개!</Text>
                                    {result.score > 0 && <Text style={styles.resultNote}>친구 {result.score}마리가 따라왔어요</Text>}
                                    {newRecord && <Text style={styles.newRecord}>🎉 내 최고 기록!</Text>}
                                    {info?.rank && <Text style={styles.resultNote}>전체 {info.players}명 중 {info.rank}등 · 최고 {info.best ?? 0}개</Text>}
                                    {current && <Text style={styles.resultNote}>😊 {current.name}의 기분이 좋아졌어요</Text>}
                                </View>
                            )}
                            {!current && <Text style={styles.note}>알이 깨어나면 같이 놀 수 있어요</Text>}
                            {current && currentBlock && <Text style={styles.warn}>{currentBlock}</Text>}
                            {msg && <Text style={styles.warn}>{msg}</Text>}
                            <Button variant="coral" disabled={busy || !current || !info || !!currentBlock || cantPay}
                                label={`${phase === 'over' ? '🔁 한 판 더' : '▶ 시작'}${info && !free && info.price ? ` 🔶${info.price}` : ''}`}
                                onPress={start} style={{ alignSelf: 'center' }} />

                            <Text style={styles.section}>🏆 순위</Text>
                            {info && info.top.length === 0 && <Text style={styles.note}>아직 기록이 없어요. 첫 번째가 되어 보세요!</Text>}
                            {info?.top.map((r, i) => (
                                <View key={i} style={[styles.rankRow, r.me && styles.rankMe]}>
                                    <Text style={styles.rankNo}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`}</Text>
                                    <Text style={styles.rankName} numberOfLines={1}>
                                        {r.student} <Text style={styles.rankPet}>{isSpecies(r.species) ? EMOJI[r.species] : ''} {r.pet ?? ''}</Text>
                                    </Text>
                                    <Text style={styles.rankScore}>🍎 {r.score ?? r.score_ms}</Text>
                                </View>
                            ))}
                            {info?.rank && info.rank > 10 && <Text style={styles.note}>나는 {info.rank}등 · 🍎 {info.best ?? 0}</Text>}
                        </ScrollView>
                    )}

                    {phase !== 'play' && (
                        <Pressable onPress={close} style={styles.closeBtn}><Text style={styles.closeText}>닫기</Text></Pressable>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.paper, alignItems: 'center' },
    inner: { flex: 1, width: '100%', maxWidth: 480, paddingHorizontal: 16, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    title: { fontFamily: fontFamilies.display, fontSize: 24, color: colors.ink[900] },
    plays: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[500] },
    day: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.sun[300], borderWidth: 2, borderColor: colors.coral[500] },
    dayDone: { backgroundColor: colors.card, borderColor: colors.ink[100] },
    dayText: { flex: 1, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[900] },
    section: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.ink[700] },
    note: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: colors.ink[500] },
    warn: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.coral[700], textAlign: 'center' },
    box: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 4 },
    resultBox: { alignItems: 'center', backgroundColor: colors.sun[300] },
    resultScore: { fontFamily: fontFamilies.display, fontSize: 28, color: colors.ink[900] },
    newRecord: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: colors.coral[700] },
    resultNote: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[700] },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.card, borderRadius: radius.md },
    rankMe: { backgroundColor: colors.ocean[50], borderWidth: 2, borderColor: colors.ocean[300] },
    rankNo: { width: 28, textAlign: 'center', fontFamily: fontFamilies.num, fontSize: fontSizes.lg, color: colors.ink[700] },
    rankName: { flex: 1, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[900] },
    rankPet: { fontFamily: fontFamilies.body, color: colors.ink[500] },
    rankScore: { fontFamily: fontFamilies.num, fontSize: fontSizes.lg, color: colors.ink[900] },
    closeBtn: { paddingVertical: 8, alignItems: 'center' },
    closeText: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: colors.ink[300] },
});
