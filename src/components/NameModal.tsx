import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

interface Props {
    visible: boolean;
    title: string;
    note?: string;
    initial?: string;
    confirmLabel: string;
    busy?: boolean;
    onConfirm: (name: string) => void;
    onClose: () => void;
}

export const NAME_MAX = 8;

/** 펫 이름 짓기 / 바꾸기 */
export function NameModal({ visible, title, note, initial = '', confirmLabel, busy, onConfirm, onClose }: Props) {
    const [name, setName] = useState(initial);
    useEffect(() => { if (visible) setName(initial); }, [visible, initial]);
    const trimmed = name.trim();

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>{title}</Text>
                    {note && <Text style={styles.note}>{note}</Text>}
                    <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        maxLength={NAME_MAX}
                        placeholder="이름"
                        placeholderTextColor={colors.ink[300]}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => { if (trimmed) onConfirm(trimmed); }}
                    />
                    <TouchableOpacity style={[styles.confirmBtn, !trimmed && styles.off]} disabled={!trimmed || busy}
                        onPress={() => onConfirm(trimmed)}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>{confirmLabel}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                        <Text style={styles.cancelText}>닫기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    card: {
        backgroundColor: colors.paper,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        padding: 20,
        paddingBottom: 32,
        gap: 10,
    },
    title: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: colors.ink[900], textAlign: 'center' },
    note: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: colors.ink[500], textAlign: 'center' },
    input: {
        backgroundColor: colors.card,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: colors.ink[200],
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes['2xl'],
        color: colors.ink[900],
        textAlign: 'center',
    },
    confirmBtn: {
        backgroundColor: colors.sun[500],
        borderRadius: radius.md,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 4,
    },
    off: { opacity: 0.5 },
    confirmText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.base, color: colors.ink[900] },
    cancelBtn: { paddingVertical: 8, alignItems: 'center' },
    cancelText: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: colors.ink[300] },
});
