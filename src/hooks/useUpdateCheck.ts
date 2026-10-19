import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';

const REPO = (Constants.expoConfig?.extra as { updateRepo?: string })?.updateRepo
    ?? 'guom0625-dotcom/gom-tamagotchi';
// releases/latest 는 "가장 나중에 발행된" 릴리즈라, 빌드가 순서와 다르게 끝나면 더 낮은 버전을 가리킬 수 있다.
// 그래서 최근 릴리즈 목록을 받아 버전이 가장 높은 것을 직접 고른다.
const API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
// GitHub 비로그인 API는 IP당 시간당 60회 제한 — 기기당 최대 20회/시간이 되도록 3분 간격
const RECHECK_INTERVAL_MS = 3 * 60_000;

interface GHRelease {
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: { name: string; browser_download_url: string }[];
}

/**
 * 강제 업데이트 상태. idle 이 아니면 앱 화면을 가리고 업데이트를 진행한다.
 *  - downloading: 새 버전 APK를 묻지 않고 내려받는 중
 *  - ready: 내려받기 완료, 시스템 설치 화면을 띄움 (안드로이드의 설치 확인은 앱이 건너뛸 수 없다)
 *  - failed: 내려받기/설치 화면 실행 실패
 */
export type UpdateState =
    | { phase: 'idle' }
    | { phase: 'downloading'; version: string; pct: number }
    | { phase: 'ready'; version: string }
    | { phase: 'failed'; version: string };

/** semver 비교 — latest > current 이면 true */
function isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
    const [la, lb, lc] = parse(latest);
    const [ca, cb, cc] = parse(current);
    if (la !== ca) return la > ca;
    if (lb !== cb) return lb > cb;
    return lc > cc;
}

const apkPath = (version: string) => `${FileSystem.cacheDirectory}pet-update-${version}.apk`;

async function download(url: string, version: string, onProgress: (pct: number) => void): Promise<void> {
    const dest = apkPath(version);
    if ((await FileSystem.getInfoAsync(dest)).exists) return;  // 이미 받아둔 버전

    // 예전에 받아둔 다른 버전/중단된 파일 정리
    const cacheDir = FileSystem.cacheDirectory!;
    for (const name of await FileSystem.readDirectoryAsync(cacheDir)) {
        if (name.startsWith('pet-update')) {
            await FileSystem.deleteAsync(cacheDir + name, { idempotent: true });
        }
    }

    // 중간에 끊긴 파일을 완성본으로 착각하지 않도록 임시 이름으로 받은 뒤 옮긴다
    const part = `${dest}.part`;
    const dl = FileSystem.createDownloadResumable(url, part, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        if (totalBytesExpectedToWrite > 0) {
            onProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100));
        }
    });
    const result = await dl.downloadAsync();
    if (!result || result.status !== 200) throw new Error('download_failed');
    await FileSystem.moveAsync({ from: part, to: dest });
}

async function launchInstaller(version: string): Promise<void> {
    const contentUri = await FileSystem.getContentUriAsync(apkPath(version));
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,   // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
    });
}

export function useUpdateCheck() {
    const [state, setState] = useState<UpdateState>({ phase: 'idle' });
    const busy = useRef(false);
    const lastCheck = useRef(0);
    const pending = useRef<{ version: string; url: string } | null>(null);
    const skipped = useRef<string | null>(null);

    // 내려받고(이미 있으면 생략) 설치 화면 띄우기
    const run = useCallback(async () => {
        const target = pending.current;
        if (!target || busy.current) return;
        busy.current = true;
        try {
            setState({ phase: 'downloading', version: target.version, pct: 0 });
            await download(target.url, target.version, pct =>
                setState({ phase: 'downloading', version: target.version, pct })
            );
            setState({ phase: 'ready', version: target.version });
            await launchInstaller(target.version);
        } catch {
            setState({ phase: 'failed', version: target.version });
        } finally {
            busy.current = false;
        }
    }, []);

    const check = useCallback(async () => {
        if (busy.current || pending.current) return;
        if (Date.now() - lastCheck.current < RECHECK_INTERVAL_MS) return;
        lastCheck.current = Date.now();
        try {
            const res = await fetch(API_URL, { headers: { 'Accept': 'application/vnd.github+json' } });
            if (!res.ok) return;
            const releases: GHRelease[] = await res.json();
            const current = Constants.expoConfig?.version ?? '0.0.0';

            // APK가 올라온 정식 릴리즈 중 버전이 가장 높은 것
            let release: GHRelease | null = null;
            for (const r of releases) {
                if (r.draft || r.prerelease || !r.assets.some(a => a.name.endsWith('.apk'))) continue;
                if (!release || isNewer(r.tag_name, release.tag_name)) release = r;
            }
            if (!release || !isNewer(release.tag_name, current) || skipped.current === release.tag_name) return;

            const apk = release.assets.find(a => a.name.endsWith('.apk'));
            if (!apk) return;
            pending.current = { version: release.tag_name, url: apk.browser_download_url };
            await run();
        } catch {
            // 확인 자체가 안 되면(오프라인 등) 앱은 그대로 쓴다
        }
    }, [run]);

    useEffect(() => {
        // Android 전용, 개발 중 스킵
        if (Platform.OS !== 'android' || __DEV__) return;

        check();
        // 앱이 종료되지 않고 계속 떠 있어도 새 버전을 놓치지 않도록:
        // 다시 앞으로 올 때, 그리고 켜둔 채로 있는 동안에도 주기적으로 확인
        const sub = AppState.addEventListener('change', next => {
            if (next === 'active') check();
        });
        const timer = setInterval(() => {
            if (AppState.currentState === 'active') check();
        }, RECHECK_INTERVAL_MS + 5_000);
        return () => { sub.remove(); clearInterval(timer); };
    }, [check]);

    /** 설치 화면 다시 띄우기 / 실패 후 재시도 */
    const retry = useCallback(() => { run(); }, [run]);

    /** 내려받기가 안 될 때만 쓰는 탈출구 — 이번 실행 동안 이 버전은 건너뛴다 */
    const skip = useCallback(() => {
        skipped.current = pending.current?.version ?? null;
        pending.current = null;
        setState({ phase: 'idle' });
    }, []);

    return { state, retry, skip };
}
