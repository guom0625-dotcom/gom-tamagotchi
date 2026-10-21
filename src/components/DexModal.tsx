import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PetView, makePetAnims, petCanvas } from '../pet/PetView';
import { petModel } from '../pet/model';
import { FACE_CAMERA } from '../pet/layers';
import { KINDS, SPECIES, SPECIES_NAME, lookTitle, type Species } from '../pet/species';
import type { DexPet } from '../pet/api';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

const THUMB = 76;

/** 졸업한 펫 그림 한 장 (움직이지 않는다, 어른 모습으로 정면) */
function PetThumb({ species, variant }: { species: Species; variant: number }) {
    const model = useMemo(() => petModel(species, variant, 'happy', 'adult'), [species, variant]);
    const a = useMemo(makePetAnims, []);
    const one = petCanvas(model, 1);
    const kv = THUMB / Math.max(one.width, one.height);
    const cv = petCanvas(model, kv);
    return (
        <View style={{ width: THUMB, height: THUMB }}>
            <View style={{ position: 'absolute', left: (THUMB - cv.width) / 2 + cv.ox, top: (THUMB - cv.height) / 2 + cv.oy }}>
                <PetView model={model} modelKey={`dex-${species}-${variant}`} yawIdx={FACE_CAMERA} kv={kv} a={a} />
            </View>
        </View>
    );
}

interface Props { visible: boolean; pets: DexPet[]; total: number; onClose: () => void }

/** 도감 — 졸업한 펫. 아직 못 만난 종류·무늬는 ❓ */
export function DexModal({ visible, pets, total, onClose }: Props) {
    const insets = useSafeAreaInsets();
    // 같은 모습을 여러 번 졸업시켰으면 마지막 이름과 횟수
    const got = new Map<string, { name: string | null; n: number }>();
    for (const p of pets) {
        const k = `${p.species}:${p.variant}`;
        got.set(k, { name: p.name, n: (got.get(k)?.n ?? 0) + 1 });
    }
    const kinds = new Set(pets.map(p => `${p.species}:${p.variant}`)).size;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
            <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
                <View style={[styles.card, { paddingBottom: insets.bottom + 20 }]}>
                    <Text style={styles.title}>📖 도감 {kinds}/{total}</Text>
                    <Text style={styles.note}>졸업한 친구들이 여기에 남아요. 한 번 만난 친구는 알에서 다시 나오지 않아요</Text>
                    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14 }}>
                        {SPECIES.map(sp => (
                            <View key={sp} style={{ gap: 6 }}>
                                <Text style={styles.kind}>{SPECIES_NAME[sp]}</Text>
                                <View style={styles.grid}>
                                    {KINDS[sp].looks.map((_, v) => {
                                        const g = got.get(`${sp}:${v}`);
                                        return (
                                            <View key={v} style={[styles.cell, !g && styles.cellOff]}>
                                                {g ? <PetThumb species={sp} variant={v} /> : <Text style={styles.unknown}>❓</Text>}
                                                <Text style={styles.cellName} numberOfLines={1}>{g ? (g.name ?? lookTitle(sp, v)) : '???'}</Text>
                                                {g && <Text style={styles.cellLook} numberOfLines={1}>{lookTitle(sp, v)}{g.n > 1 ? ` ×${g.n}` : ''}</Text>}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                        <Text style={styles.cancelText}>닫기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
    card: {
        width: '100%', maxWidth: 480, flexShrink: 1,
        backgroundColor: colors.paper,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        padding: 20,
        gap: 10,
    },
    title: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: colors.ink[900], textAlign: 'center' },
    note: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: colors.ink[500], textAlign: 'center' },
    kind: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.ink[700] },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cell: {
        width: 96, alignItems: 'center', paddingVertical: 8, gap: 2,
        backgroundColor: colors.card, borderRadius: radius.md,
    },
    cellOff: { opacity: 0.55 },
    unknown: { width: THUMB, height: THUMB, textAlign: 'center', textAlignVertical: 'center', fontSize: 30 },
    cellName: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm, color: colors.ink[900], maxWidth: 88 },
    cellLook: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.ink[500], maxWidth: 88 },
    cancelBtn: { paddingVertical: 8, alignItems: 'center' },
    cancelText: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: colors.ink[300] },
});
