// 미니게임 — 💩 똥피하기 / 🌲 숲길 달리기. 게임·캐릭터 고르기 → 게임 → 결과. 점수와 순위는 서버가 관리한다 (게임마다 따로, 판수는 같이).
// 지금 키우는 펫(알·떠남 제외)이나 도감(졸업)의 펫으로만 할 수 있다. 보상은 키우는 펫의 기분좋음.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import { Button } from './Button';
import { PetThumb } from './DexModal';
import { PoopGame, type GameChar } from '../game/PoopGame';
import { RunGame, type RunResult } from '../game/RunGame';
import { abilityOf, runAbilityOf, STAGE_NOTE } from '../game/abilities';
import { isSpecies, lookTitle, type Species } from '../pet/species';
import type { Build, BodyStage, Outfit } from '../pet/model';
import type { DexPet, GameInfo, GameKind } from '../pet/api';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

const EMOJI: Record<Species, string> = { bear: '🐻', dog: '🐶', cat: '🐱', rabbit: '🐰', squirrel: '🐿️', hamster: '🐹' };
const STAGE_NAME: Record<string, string> = { baby: '유아', teen: '청소년', adult: '성인' };
const ERRORS: Record<string, string> = {
    no_plays_left: '오늘은 다 했어요. 내일 또 해요',
    insufficient_gems: '토파즈가 모자라요',
    sick: '아플 때는 게임을 못 해요',
    hungry: '배가 고파서 못 해요. 밥을 먼저 주세요',
    egg: '알은 게임을 못 해요',
    gone: '펫이 떠났어요',
    not_found: '이 친구로는 할 수 없어요',
    expired: '너무 오래 지나서 기록하지 못했어요',
};
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
const fmt = (kind: GameKind, score: number) => kind === 'poop' ? secs(score) : `${score}점`;
const GAMES: { kind: GameKind; label: string }[] = [{ kind: 'run', label: '🌲 숲길 달리기' }, { kind: 'poop', label: '💩 똥피하기' }];

interface Char extends GameChar { id: string; name: string; current: boolean }

interface Props {
    visible: boolean;
    onClose: () => void;
    /** 지금 키우는 펫 (알·떠남이면 null) */
    current: { id: string; species: Species; variant: number; stage: BodyStage; build: Build; outfit: Outfit; name: string } | null;
    /** 지금 펫으로 못 하는 까닭 (자는 중 등). null 이면 할 수 있다 */
    currentBlock: string | null;
    dex: DexPet[];
    /** 한 판이 끝났다 (펫 기분이 바뀌었으니 다시 읽는다) */
    onPlayed: () => void;
}

export function GameModal({ visible, onClose, current, currentBlock, dex, onPlayed }: Props) {
    const insets = useSafeAreaInsets();
    const [kind, setKind] = useState<GameKind>('run');
    const [info, setInfo] = useState<GameInfo | null>(null);
    const [phase, setPhase] = useState<'pick' | 'play' | 'over'>('pick');
    const [pickId, setPickId] = useState<string | null>(null);
    const [game, setGame] = useState<{ id: string; char: Char; n: number } | null>(null);
    const [result, setResult] = useState<{ kind: GameKind; score: number; prevBest: number | null; run?: RunResult } | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // 고를 수 있는 친구: 지금 펫 + 도감 (같은 모습은 마지막 졸업한 하나만)
    const chars = useMemo<Char[]>(() => {
        const list: Char[] = [];
        if (current) list.push({ ...current, current: true });
        const seen = new Map<string, DexPet>();
        for (const d of dex) if (d.id && isSpecies(d.species)) seen.set(`${d.species}:${d.variant}`, d);
        for (const d of [...seen.values()].reverse()) {
            const sp = d.species as Species;
            list.push({ id: d.id!, species: sp, variant: d.variant, stage: 'adult', build: 'normal', name: d.name ?? lookTitle(sp, d.variant), current: false });
        }
        return list;
    }, [current, dex]);
    // 달리기에서 얼음에 갇혀 나올 친구들 (도감)
    const friends = useMemo(() => dex.filter(d => isSpecies(d.species)).map(d => ({ species: d.species as Species, variant: d.variant })), [dex]);
    const picked = chars.find(c => c.id === pickId) ?? chars.find(c => !(c.current && currentBlock)) ?? null;

    const load = useCallback(async (k: GameKind) => {
        try { setInfo(await api<GameInfo>(`/pet/game?kind=${k}`)); } catch { /* 다음에 */ }
    }, []);
    useEffect(() => {
        if (!visible) return;
        setPhase('pick'); setMsg(null); setResult(null);
        void load(kind);
    }, [visible, load]);
    const pickGame = (k: GameKind) => {
        if (k === kind) return;
        setKind(k); setInfo(null); setResult(null); setPhase('pick'); setMsg(null);
        void load(k);
    };
    const rowScore = (r: { score?: number; score_ms: number }) => r.score ?? r.score_ms;

    const errText = (e: unknown) => {
        const code = e instanceof ApiError ? (e.body as { error?: string })?.error : null;
        return (code && ERRORS[code]) ?? '잘 안 됐어요. 다시 해 주세요';
    };

    const start = async () => {
        if (!picked || busy) return;
        if (picked.current && currentBlock) { setMsg(currentBlock); return; }
        setBusy(true); setMsg(null);
        try {
            const r = await api<GameInfo & { game: { id: string } }>('/pet/game/start', { method: 'POST', body: JSON.stringify({ pet_id: picked.id, kind }) });
            setInfo(r);
            setResult(null);
            if (r.plays_left <= 0 && r.price) onPlayed();   // 토파즈를 냈으면 잔고를 다시 읽는다
            setGame(g => ({ id: r.game.id, char: picked, n: (g?.n ?? 0) + 1 }));
            setPhase('play');
        } catch (e) {
            setMsg(errText(e));
        } finally { setBusy(false); }
    };

    const over = async (ms: number, score: number, run?: RunResult) => {
        if (!game) return;
        const prevBest = info?.best ?? null;
        setResult({ kind, score, prevBest, run });
        setPhase('over');
        try {
            setInfo(await api<GameInfo>('/pet/game/end', { method: 'POST', body: JSON.stringify({ id: game.id, score_ms: ms, score }) }));
            onPlayed();
        } catch (e) {
            setMsg(errText(e));
        }
    };

    const close = () => { if (phase !== 'play') onClose(); };
    const newRecord = result && (result.prevBest === null || result.score > result.prevBest);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
            <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
                <View style={styles.inner}>
                    <View style={styles.header}>
                        <Text style={styles.title}>🎮 미니게임</Text>
                        {info && <Text style={styles.plays}>{info.plays_left > 0 ? `오늘 무료 ${info.plays_left}/${info.plays_per_day}판` : info.price ? `무료 판 끝 · 한 판 🔶${info.price}` : '오늘은 다 했어요'}</Text>}
                    </View>

                    {phase === 'play' && game ? (
                        kind === 'run'
                            ? <RunGame key={game.n} char={game.char} friends={friends} onOver={r => void over(r.ms, r.score, r)} />
                            : <PoopGame key={game.n} char={game.char} onOver={ms => void over(ms, ms)} />
                    ) : (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
                            <View style={styles.tabs}>
                                {GAMES.map(g => (
                                    <Pressable key={g.kind} onPress={() => pickGame(g.kind)} style={[styles.tab, kind === g.kind && styles.tabOn]}>
                                        <Text style={[styles.tabText, kind === g.kind && styles.tabTextOn]}>{g.label}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <Text style={styles.note}>{kind === 'run'
                                ? '폰을 기울여 좌우로 움직이고, 화면을 누르면 점프해요. 바위·그루터기는 피하거나 뛰어넘고, 웅덩이·시냇물은 뛰어넘어요. 🍎 사과는 10점! 우리에 갇힌 친구를 구하면 파워업!'
                                : '하늘에서 떨어지는 똥을 피해요. 아래 ◀ ▶ 칸을 꾹 눌러 움직여요.'}</Text>
                            {phase === 'over' && result && result.kind === kind && (
                                <View style={[styles.box, styles.resultBox]}>
                                    <Text style={styles.resultScore}>{result.run ? `${result.score}점!` : `${secs(result.score)} 버텼어요!`}</Text>
                                    {result.run && <Text style={styles.resultNote}>{result.run.dist}m 달리고 🍎 {result.run.fish}개</Text>}
                                    {newRecord && <Text style={styles.newRecord}>🎉 내 최고 기록!</Text>}
                                    {info?.rank && <Text style={styles.resultNote}>전체 {info.players}명 중 {info.rank}등 · 최고 {fmt(kind, info.best ?? 0)}</Text>}
                                    {current && <Text style={styles.resultNote}>😊 {current.name}의 기분이 좋아졌어요</Text>}
                                </View>
                            )}

                            <Text style={styles.section}>누구로 할까요?</Text>
                            {chars.length === 0 && <Text style={styles.note}>알이 깨어나면 할 수 있어요. 졸업한 친구도 할 수 있어요</Text>}
                            <View style={styles.grid}>
                                {chars.map(c => {
                                    const off = c.current && !!currentBlock;
                                    return (
                                        <Pressable key={c.id} onPress={() => setPickId(c.id)}
                                            style={[styles.cell, picked?.id === c.id && styles.cellOn, off && styles.cellOff]}>
                                            <PetThumb species={c.species} variant={c.variant} stage={c.stage} size={64} />
                                            <Text style={styles.cellName} numberOfLines={1}>{c.name}</Text>
                                            <Text style={styles.cellNote} numberOfLines={1}>{c.current ? `지금 펫 · ${STAGE_NAME[c.stage]}` : '도감'}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                            {picked && (
                                <View style={styles.box}>
                                    <Text style={styles.boxTitle}>{EMOJI[picked.species]} {picked.name} ({STAGE_NAME[picked.stage]})</Text>
                                    <Text style={styles.boxText}>{(kind === 'run' ? runAbilityOf : abilityOf)(picked.species, picked.stage, picked.build).text}</Text>
                                    <Text style={styles.note}>{STAGE_NOTE[picked.stage]}{picked.build === 'fat' || picked.build === 'chubby' ? ' · 살이 쪄서 조금 느려요' : ''}</Text>
                                    {picked.current && currentBlock && <Text style={styles.warn}>{currentBlock}</Text>}
                                </View>
                            )}
                            {msg && <Text style={styles.warn}>{msg}</Text>}
                            <Button variant="coral" disabled={busy || !picked || !info || (picked.current && !!currentBlock)
                                    || (info.plays_left <= 0 && (!info.price || (info.topaz ?? 0) < info.price))}
                                label={`${phase === 'over' ? '🔁 한 판 더' : '▶ 시작'}${info && info.plays_left <= 0 ? (info.price ? ` 🔶${info.price}` : ' (내일 또)') : ''}`}
                                onPress={start} style={{ alignSelf: 'center' }} />

                            <Text style={styles.section}>🏆 순위</Text>
                            {info && info.top.length === 0 && <Text style={styles.note}>아직 기록이 없어요. 첫 번째가 되어 보세요!</Text>}
                            {info?.top.map((r, i) => (
                                <View key={i} style={[styles.rankRow, r.me && styles.rankMe]}>
                                    <Text style={styles.rankNo}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`}</Text>
                                    <Text style={styles.rankName} numberOfLines={1}>
                                        {r.student} <Text style={styles.rankPet}>{isSpecies(r.species) ? EMOJI[r.species] : ''} {r.pet ?? ''}</Text>
                                    </Text>
                                    <Text style={styles.rankScore}>{fmt(kind, rowScore(r))}</Text>
                                </View>
                            ))}
                            {info?.rank && info.rank > 10 && <Text style={styles.note}>나는 {info.rank}등 · {fmt(kind, info.best ?? 0)}</Text>}
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
    tabs: { flexDirection: 'row', gap: 8 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink[100] },
    tabOn: { backgroundColor: colors.sky[100], borderColor: colors.sky[500] },
    tabText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[500] },
    tabTextOn: { color: colors.ink[900] },
    section: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.ink[700] },
    note: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: colors.ink[500] },
    warn: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.coral[700], textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cell: { width: 92, alignItems: 'center', paddingVertical: 8, gap: 2, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
    cellOn: { borderColor: colors.coral[500] },
    cellOff: { opacity: 0.5 },
    cellName: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm, color: colors.ink[900], maxWidth: 84 },
    cellNote: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.ink[500], maxWidth: 84 },
    box: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 4 },
    boxTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.ink[900] },
    boxText: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: colors.ink[700] },
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
