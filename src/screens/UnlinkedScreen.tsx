import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/Button';
import { colors, fontFamilies, fontSizes, radius, shadows } from '../theme';

/** 아직 숙제앱과 연결되지 않음 — 가입·로그인 화면은 없고 숙제앱 버튼으로만 들어온다 */
export function UnlinkedScreen() {
    const linkError = useAuthStore(s => s.linkError);
    const linkWithCode = useAuthStore(s => s.linkWithCode);

    // 숨은 입력칸: 알을 빠르게 5번 누르면 연결 코드를 직접 넣을 수 있다 (숙제앱 없이 시험할 때)
    const taps = React.useRef<number[]>([]);
    const [manual, setManual] = React.useState(false);
    const [code, setCode] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const tapEgg = () => {
        const now = Date.now();
        taps.current = [...taps.current.filter(t => now - t < 3000), now];
        if (taps.current.length >= 5) setManual(true);
    };
    const clean = code.trim().toLowerCase();
    const valid = /^[0-9a-f]{32}$/.test(clean);
    const submit = async () => {
        setBusy(true);
        await linkWithCode(clean);
        setBusy(false);
    };

    return (
        <View style={styles.wrap}>
            <Pressable onPress={tapEgg} hitSlop={12}>
                <Text style={styles.egg}>🥚</Text>
            </Pressable>
            <Text style={styles.title}>gomTamagotchi</Text>
            <View style={styles.card}>
                <Text style={styles.body}>숙제앱의 <Text style={styles.strong}>🐾 우리 펫</Text>에서{'\n'}<Text style={styles.strong}>🐣 펫 앱에서 돌보기</Text>를 눌러 주세요</Text>
                <Text style={styles.sub}>숙제앱 계정으로 바로 들어와요</Text>
            </View>
            {linkError && <Text style={styles.error}>{linkError}</Text>}
            {manual && (
                <View style={styles.manual}>
                    <TextInput
                        style={styles.input}
                        value={code}
                        onChangeText={setCode}
                        placeholder="연결 코드"
                        placeholderTextColor={colors.ink[300]}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {busy
                        ? <ActivityIndicator color={colors.ink[500]} />
                        : <Button variant="ocean" size="sm" label="연결" onPress={submit} disabled={!valid} style={{ alignSelf: 'center' }} />}
                </View>
            )}
        </View>
    );
}

/** 저장된 계정은 있는데 서버에 닿지 않음 */
export function OfflineScreen() {
    const refresh = useAuthStore(s => s.refresh);
    const [busy, setBusy] = React.useState(false);
    const retry = async () => {
        setBusy(true);
        await refresh();
        setBusy(false);
    };
    return (
        <View style={styles.wrap}>
            <Text style={styles.egg}>📡</Text>
            <Text style={styles.body}>서버에 연결할 수 없어요{'\n'}인터넷을 확인해 주세요</Text>
            {busy
                ? <ActivityIndicator color={colors.ink[500]} />
                : <Button variant="ocean" label="다시 시도" onPress={retry} style={{ alignSelf: 'center' }} />}
        </View>
    );
}

export function LoadingScreen() {
    return (
        <View style={styles.wrap}>
            <ActivityIndicator size="large" color={colors.sun[700]} />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flex: 1,
        backgroundColor: colors.paper,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 18,
    },
    egg: { fontSize: 72 },
    title: {
        fontFamily: fontFamilies.display,
        fontSize: fontSizes['6xl'],
        color: colors.ink[900],
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        paddingVertical: 22,
        paddingHorizontal: 28,
        alignItems: 'center',
        gap: 8,
        ...shadows.card,
    },
    body: {
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes.xl,
        color: colors.ink[700],
        textAlign: 'center',
        lineHeight: 28,
    },
    strong: { fontFamily: fontFamilies.bodyBold, color: colors.ink[900] },
    sub: {
        fontFamily: fontFamilies.body,
        fontSize: fontSizes.sm,
        color: colors.ink[500],
    },
    manual: { width: '100%', gap: 10 },
    input: {
        backgroundColor: colors.card,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: colors.ink[200],
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontFamily: fontFamilies.num,
        fontSize: fontSizes.md,
        color: colors.ink[900],
    },
    error: {
        fontFamily: fontFamilies.bodyMed,
        fontSize: fontSizes.md,
        color: colors.coral[700],
        textAlign: 'center',
        lineHeight: 22,
    },
});
