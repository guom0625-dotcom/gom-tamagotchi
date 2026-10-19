import { useFonts } from 'expo-font';
import {
  Jua_400Regular,
} from '@expo-google-fonts/jua';
import {
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_700Bold,
} from '@expo-google-fonts/noto-sans-kr';
import {
  Fredoka_500Medium,
} from '@expo-google-fonts/fredoka';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useServerUrl } from './src/hooks/useServerUrl';
import { useDeepLink } from './src/hooks/useDeepLink';
import { useAuthStore } from './src/store/authStore';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoadingScreen, OfflineScreen, UnlinkedScreen } from './src/screens/UnlinkedScreen';
import { useUpdateCheck } from './src/hooks/useUpdateCheck';
import { colors, fontFamilies, fontSizes } from './src/theme';

// 새 버전이 있으면 앱을 가리고 업데이트를 끝낼 때까지 진행 상황을 보여준다
function UpdateOverlay({ state, retry, skip }: ReturnType<typeof useUpdateCheck>) {
  if (state.phase === 'idle') return null;

  return (
    <View style={styles.overlay}>
      <Text style={styles.overlayTitle}>새 버전 {state.version}</Text>

      {state.phase === 'downloading' && (
        <>
          <Text style={styles.overlayText}>업데이트 받는 중... {state.pct}%</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${state.pct}%` }]} />
          </View>
        </>
      )}

      {state.phase === 'ready' && (
        <>
          <Text style={styles.overlayText}>설치 화면에서 "업데이트"를 눌러주세요</Text>
          <TouchableOpacity style={styles.overlayBtn} onPress={retry}>
            <Text style={styles.overlayBtnText}>설치하기</Text>
          </TouchableOpacity>
        </>
      )}

      {state.phase === 'failed' && (
        <>
          <Text style={styles.overlayText}>업데이트를 받지 못했어요</Text>
          <TouchableOpacity style={styles.overlayBtn} onPress={retry}>
            <Text style={styles.overlayBtnText}>다시 시도</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={skip}>
            <Text style={styles.overlaySkip}>이번만 그냥 쓰기</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function AppContent() {
  const update = useUpdateCheck();
  useServerUrl();
  useDeepLink();
  const status = useAuthStore(s => s.status);

  return (
    <>
      <StatusBar style="dark" />
      {status === 'loading' && <LoadingScreen />}
      {status === 'unlinked' && <UnlinkedScreen />}
      {status === 'offline' && <OfflineScreen />}
      {status === 'linked' && <HomeScreen />}
      <UpdateOverlay {...update} />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Jua_400Regular,
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
    Fredoka_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(29,35,48,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 9999,
  },
  overlayTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes['2xl'],
    color: '#fff',
  },
  overlayBtn: {
    backgroundColor: colors.ocean[500],
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  overlayBtnText: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.lg,
    color: '#fff',
  },
  overlaySkip: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  overlayText: {
    fontFamily: fontFamilies.bodyMed,
    fontSize: fontSizes.lg,
    color: '#fff',
  },
  progressBg: {
    width: 240,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ocean[500],
  },
});
