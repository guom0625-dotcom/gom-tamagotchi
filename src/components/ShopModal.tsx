import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ITEMS, isPlaceable } from '../pet/catalog';
import type { PetResponse } from '../pet/api';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

type Tab = 'snack' | 'toy' | 'decor' | 'gadget' | 'storage' | 'special';
const TABS: [Tab, string][] = [
    ['snack', '🍪 간식'], ['toy', '🧸 장난감'], ['decor', '🛋️ 가구'], ['gadget', '⚙️ 능력'], ['storage', '📦 창고'], ['special', '⭐ 특별'],
];
const ROOM_NAME = ['작은 방', '중간 방', '큰 방'];

interface Props {
    visible: boolean;
    data: PetResponse;
    busy: boolean;
    /** 서버에 일을 시킨다. 성공하면 true */
    act: (path: string, body?: object) => Promise<boolean>;
    onSnack: (emoji: string) => void;
    onClose: () => void;
}

/** 상점 — 간식·장난감·가구·능력 물건 사기, 창고에서 꺼내기, 돌봄 도우미 */
export function ShopModal({ visible, data, busy, act, onSnack, onClose }: Props) {
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState<Tab>('snack');
    const { pet, shop, room } = data;
    const owned = new Map(data.items.map(i => [i.key, i.placed]));
    const egg = pet.stage === 'egg';
    const gone = !!pet.gone;
    const full = room.used >= room.slots;

    const buy = (key: string) => void act('/pet/buy', { item: key });
    const giveSnack = async (key: string) => {
        if (await act('/pet/snack', { item: key })) { onClose(); onSnack(ITEMS[key].emoji); }
    };

    const row = (key: string, right: React.ReactNode, note?: string) => {
        const info = ITEMS[key];
        return (
            <View key={key} style={styles.row}>
                <Text style={styles.emoji}>{info.emoji}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{info.name}</Text>
                    <Text style={styles.itemDesc}>{note ?? info.desc}</Text>
                </View>
                {right}
            </View>
        );
    };
    const btn = (label: string, onPress: () => void, disabled = false, ghost = false) => (
        <TouchableOpacity style={[styles.btn, ghost && styles.btnGhost, (disabled || busy) && styles.btnOff]} disabled={disabled || busy} onPress={onPress}>
            <Text style={[styles.btnText, ghost && styles.btnGhostText]}>{label}</Text>
        </TouchableOpacity>
    );
    // 사기 / 가지고 있음 (벽지·쿠션은 붙이기)
    const buyRow = (key: string, price: number) => {
        const kind = ITEMS[key]?.kind;
        if (!owned.has(key)) return row(key, btn(`🔶${price}`, () => buy(key)));
        if (kind === 'wall' || kind === 'cushion') {
            const field = kind === 'wall' ? 'wallpaper' : 'cushion';
            const using = data.decor[field] === key;
            return row(key, btn(using ? '쓰는 중' : '붙이기', () => void act('/pet/decor', { [field]: using ? null : key }), false, using));
        }
        return row(key, <Text style={styles.have}>{owned.get(key) ? '방에 있어요' : '창고에 있어요'}</Text>);
    };

    let body: React.ReactNode;
    if (tab === 'snack') {
        const left = pet.snacks_per_day - pet.snacks_today;
        body = <>
            <Text style={styles.note}>간식은 하루 {pet.snacks_per_day}번까지 (오늘 {Math.max(0, left)}번 남음). 배는 부르지 않아요.</Text>
            {Object.entries(shop.snacks).map(([k, s]) => row(k, btn(`주기 🔶${s.price}`, () => void giveSnack(k), egg || gone || left <= 0)))}
            {egg && <Text style={styles.note}>알은 아직 먹지 않아요</Text>}
        </>;
    } else if (tab === 'toy') {
        body = <>
            <Text style={styles.note}>방에 꺼내 두면 혼자 가지고 놀아요</Text>
            {Object.entries(shop.toys).map(([k, p]) => buyRow(k, p))}
        </>;
    } else if (tab === 'decor') {
        body = Object.entries(shop.decor).map(([k, p]) => buyRow(k, p));
    } else if (tab === 'gadget') {
        body = <>
            <Text style={styles.note}>방에 꺼내 놓았을 때만 작동해요</Text>
            {Object.entries(shop.gadgets).map(([k, p]) => buyRow(k, p))}
        </>;
    } else if (tab === 'storage') {
        const list = data.items.filter(i => isPlaceable(i.key));
        body = <>
            <Text style={styles.note}>{ROOM_NAME[room.level]}에는 {room.slots}개까지 꺼내 놓을 수 있어요 (지금 {room.used}개)</Text>
            {list.length === 0 && <Text style={styles.empty}>아직 산 물건이 없어요</Text>}
            {list.map(i => row(i.key, i.placed
                ? btn('넣기', () => void act('/pet/place', { item: i.key, placed: false }), false, true)
                : btn('꺼내기', () => void act('/pet/place', { item: i.key, placed: true }), full),
            i.placed ? '방에 있어요' : full ? '방이 꽉 찼어요' : '창고에 있어요'))}
        </>;
    } else {
        body = <>
            <View style={styles.row}>
                <Text style={styles.emoji}>🧚</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>돌봄 도우미</Text>
                    <Text style={styles.itemDesc}>빠진 날 하루를 채워 줘요. 일주일에 1번</Text>
                </View>
                {btn(`🔶${shop.helper}`, () => void act('/pet/helper'), !pet.helper_ready || gone)}
            </View>
            {!pet.helper_ready && <Text style={styles.note}>지금은 쓸 수 없어요 (빠진 날이 없거나 이번 주에 이미 썼어요)</Text>}
        </>;
    }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={styles.head}>
                        <Text style={styles.title}>🛒 상점</Text>
                        <Text style={styles.balance}>🔶 {data.topaz}</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                        {TABS.map(([t, label]) => (
                            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
                                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{label}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                    <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>{body}</ScrollView>
                    <TouchableOpacity style={styles.close} onPress={onClose}>
                        <Text style={styles.closeText}>닫기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
    card: {
        width: '100%', maxWidth: 480,
        backgroundColor: colors.paper,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        padding: 18,
        gap: 10,
    },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: colors.ink[900] },
    balance: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.ink[700] },
    tabs: { gap: 6, paddingVertical: 2 },
    tab: { borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.ink[200], paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card },
    tabOn: { borderColor: colors.ocean[500], backgroundColor: colors.ocean[50] },
    tabText: { fontFamily: fontFamilies.bodyMed, fontSize: fontSizes.sm, color: colors.ink[700] },
    tabTextOn: { color: colors.ocean[700] },
    note: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: colors.ink[500] },
    empty: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: colors.ink[300], textAlign: 'center', paddingVertical: 20 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.lg, padding: 10 },
    emoji: { fontSize: 28, width: 36, textAlign: 'center' },
    itemName: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[900] },
    itemDesc: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.ink[500] },
    have: { fontFamily: fontFamilies.bodyMed, fontSize: fontSizes.sm, color: colors.mint[500] },
    btn: { backgroundColor: colors.sun[500], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
    btnGhost: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.ink[200] },
    btnOff: { opacity: 0.4 },
    btnText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm, color: colors.ink[900] },
    btnGhostText: { color: colors.ink[700] },
    close: { paddingVertical: 8, alignItems: 'center' },
    closeText: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: colors.ink[300] },
});
