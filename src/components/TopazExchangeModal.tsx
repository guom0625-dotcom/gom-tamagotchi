import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Gem } from './Gem';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

// 서버와 같은 비율: 다이아 1 = 토파즈 10 (토파즈 → 다이아는 안 됨)
export const TOPAZ_PER_DIAMOND = 10;
export const TOPAZ_PER_RUBY = 3;   // 2026-10-21 사용자 결정

interface Props {
    visible: boolean;
    onClose: () => void;
}

type Source = 'diamond' | 'ruby';
const NAME: Record<Source, string> = { diamond: '다이아', ruby: '루비' };

/** 다이아나 루비를 토파즈로 바꾸기 — 무엇을 몇 개 바꿀지 고르고 확인 */
export function TopazExchangeModal({ visible, onClose }: Props) {
    const diamonds = useAuthStore(s => s.me?.diamonds ?? 0);
    const rubies = useAuthStore(s => s.me?.rubies ?? 0);
    const [source, setSource] = useState<Source>('diamond');
    const rate = source === 'diamond' ? TOPAZ_PER_DIAMOND : TOPAZ_PER_RUBY;
    const setGems = useAuthStore(s => s.setGems);
    const [count, setCount] = useState(1);
    const [busy, setBusy] = useState(false);
    const insets = useSafeAreaInsets();

    useEffect(() => { if (visible) setCount(1); }, [visible, source]);

    const max = source === 'diamond' ? diamonds : rubies;
    const step = (d: number) => setCount(c => Math.max(1, Math.min(max, c + d)));

    const exchange = async () => {
        setBusy(true);
        try {
            const res = await api<{ diamonds: number; rubies: number; topaz: number }>('/room/exchange', {
                method: 'POST',
                body: JSON.stringify(source === 'diamond' ? { diamonds: count } : { rubies: count }),
            });
            setGems(res);
            onClose();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            Alert.alert('오류', msg === 'insufficient_gems' ? `${NAME[source]}가 부족해요` : '바꾸지 못했어요');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
            <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
                <View style={[styles.card, { paddingBottom: insets.bottom + 20 }]}>
                    <Text style={styles.title}>토파즈로 바꾸기</Text>
                    <Text style={styles.note}>
                        다이아 1개 = 토파즈 {TOPAZ_PER_DIAMOND}개 · 루비 1개 = 토파즈 {TOPAZ_PER_RUBY}개{'\n'}토파즈는 다시 바꿀 수 없어요
                    </Text>
                    <View style={styles.sources}>
                        {(['diamond', 'ruby'] as const).map(k => (
                            <TouchableOpacity key={k} style={[styles.source, source === k && styles.sourceOn]} onPress={() => setSource(k)}>
                                <Gem size={18} kind={k} />
                                <Text style={[styles.sourceText, source === k && styles.sourceTextOn]}>{NAME[k]} {k === 'diamond' ? diamonds : rubies}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {max < 1 ? (
                        <Text style={styles.empty}>바꿀 {NAME[source]}가 없어요</Text>
                    ) : (
                        <>
                            <View style={styles.stepper}>
                                <TouchableOpacity style={styles.stepBtn} onPress={() => step(-1)} disabled={count <= 1}>
                                    <Text style={[styles.stepText, count <= 1 && styles.stepOff]}>−</Text>
                                </TouchableOpacity>
                                <View style={styles.amount}>
                                    <Gem size={22} kind={source} />
                                    <Text style={styles.amountNum}>{count}</Text>
                                </View>
                                <TouchableOpacity style={styles.stepBtn} onPress={() => step(1)} disabled={count >= max}>
                                    <Text style={[styles.stepText, count >= max && styles.stepOff]}>+</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.result}>
                                <Text style={styles.arrow}>↓</Text>
                                <View style={styles.amount}>
                                    <Gem size={22} kind="topaz" />
                                    <Text style={styles.amountNum}>{count * rate}</Text>
                                </View>
                            </View>
                            <Text style={styles.have}>가진 {NAME[source]} {max}개</Text>
                            <TouchableOpacity style={styles.confirmBtn} onPress={exchange} disabled={busy}>
                                {busy
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.confirmText}>바꾸기</Text>}
                            </TouchableOpacity>
                        </>
                    )}
                    <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                        <Text style={styles.cancelText}>닫기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    sources: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
    source: {
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: radius.pill, backgroundColor: colors.paper2, borderWidth: 2, borderColor: 'transparent',
    },
    sourceOn: { borderColor: colors.ink[700], backgroundColor: '#fff' },
    sourceText: { fontFamily: fontFamilies.bodyMed, fontSize: fontSizes.sm, color: colors.ink[500] },
    sourceTextOn: { color: colors.ink[900] },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
    card: {
        width: '100%', maxWidth: 480,
        backgroundColor: colors.paper,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        padding: 20,
        gap: 10,
    },
    title: {
        fontFamily: fontFamilies.display,
        fontSize: fontSizes['2xl'],
        color: colors.ink[900],
        textAlign: 'center',
    },
    note: {
        fontFamily: fontFamilies.body,
        fontSize: fontSizes.sm,
        color: colors.ink[500],
        textAlign: 'center',
        lineHeight: 20,
    },
    empty: {
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes.base,
        color: colors.ink[300],
        textAlign: 'center',
        paddingVertical: 16,
    },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 6 },
    stepBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.card,
        borderWidth: 1.5,
        borderColor: colors.ink[200],
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepText: { fontSize: 24, lineHeight: 28, color: colors.ink[700] },
    stepOff: { color: colors.ink[200] },
    amount: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 80, justifyContent: 'center' },
    amountNum: {
        fontFamily: fontFamilies.num,
        fontSize: fontSizes['2xl'],
        fontWeight: '700',
        color: colors.ink[900],
    },
    result: { alignItems: 'center' },
    arrow: { fontSize: 20, color: colors.ink[300] },
    have: {
        fontFamily: fontFamilies.body,
        fontSize: fontSizes.xs,
        color: colors.ink[500],
        textAlign: 'center',
    },
    confirmBtn: {
        backgroundColor: colors.sun[500],
        borderRadius: radius.md,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 4,
    },
    confirmText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.base, color: colors.ink[900] },
    cancelBtn: { paddingVertical: 8, alignItems: 'center' },
    cancelText: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: colors.ink[300] },
});
