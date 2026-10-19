// Design tokens — converted from styles.css CSS variables
// gradients은 string[] (as const 미사용 — expo-linear-gradient 호환)

export const colors = {
  ocean: {
    50:  '#e6fbf6',
    100: '#b8f1e1',
    200: '#6fe3c4',
    300: '#2dd4a4',
    500: '#00b894',
    700: '#008870',
  },
  sky: {
    100: '#d6ecff',
    300: '#7ec8ff',
    500: '#3a96ff',
    700: '#1d6fd0',
  },
  coral: {
    300: '#ffb39a',
    500: '#ff6b6b',
    700: '#d94545',
  },
  sun: {
    300: '#ffe070',
    500: '#ffc83a',
    700: '#e0a800',
  },
  grape: {
    300: '#c6b5ff',
    500: '#7b61ff',
    700: '#4d36c4',
  },
  mint: {
    500: '#7ee0a8',
  },
  // 보석은 다이아 한 종류 — [light, mid, dark]
  diamond: ['#dff4ff', '#5cc4ff', '#1f86d6'],
  // 루비 — 책 한 권을 다 읽으면 받는 보석
  ruby:    ['#ffd9e1', '#ff5a7a', '#c4304f'],
  // 토파즈 — 펫 밥을 사는 보석 (다이아 1 = 토파즈 10)
  topaz:   ['#fff1c7', '#ffb21f', '#cf7f06'],
  paper:  '#fffaf2',
  paper2: '#fdf3df',
  card:   '#ffffff',
  ink: {
    100: '#ebeef5',
    200: '#d9deea',
    300: '#b6bdcc',
    500: '#6b7488',
    700: '#3a4254',
    900: '#1d2330',
  },
} as const;

export const radius = {
  sm:   10,
  md:   16,
  lg:   22,
  xl:   28,
  pill: 999,
} as const;

export const fontFamilies = {
  display:  'Jua_400Regular',
  body:     'NotoSansKR_400Regular',
  bodyMed:  'NotoSansKR_500Medium',
  bodyBold: 'NotoSansKR_700Bold',
  num:      'Fredoka_500Medium',
} as const;

// Typography scale (px → matching RN numbers)
export const fontSizes = {
  xs:   11,
  sm:   12,
  base: 13,
  md:   14,
  lg:   15,
  xl:   17,
  '2xl': 18,
  '3xl': 20,
  '4xl': 22,
  '5xl': 26,
  '6xl': 28,
  '7xl': 38,
  '8xl': 44,
  '9xl': 56,
  '10xl': 64,
} as const;

// as const → readonly tuple → expo-linear-gradient의 readonly [ColorValue, ColorValue, ...] 타입 호환
export const gradients = {
  sea:    ['#b4e6ff', '#88d1f5', '#5ab6e8'],
  night:  ['#2a2456', '#4a3a8c', '#6049b0'],

  // Status banner gradients (135deg = start:{x:0,y:0} end:{x:1,y:1})
  statusTodo:     ['#ffe2d6', '#ff8a66'],
  statusPending:  ['#fff1c2', '#ffd980'],
  statusApproved: ['#cdf3e2', '#7ee0a8'],

  // TopHud gem chip
  gemChip: ['#eaf7ff', '#c2e8ff'],
  rubyChip: ['#fff1f4', '#ffd2dc'],
} as const;

// RN shadow (iOS 기준, Android elevation도 함께)
export const shadows = {
  card: {
    shadowColor: '#1d2330',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardLg: {
    shadowColor: '#1d2330',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.10,
    shadowRadius: 40,
    elevation: 6,
  },
  hud: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
} as const;

// 게임풍 버튼 하단 솔리드 색 그림자 — 색상별 (mainColor, shadowColor)
export const buttonColors = {
  ocean:  { bg: colors.ocean[500], shadow: colors.ocean[700], text: '#fff' },
  coral:  { bg: colors.coral[500], shadow: colors.coral[700], text: '#fff' },
  sun:    { bg: colors.sun[500],   shadow: colors.sun[700],   text: colors.ink[900] },
  grape:  { bg: colors.grape[500], shadow: colors.grape[700], text: '#fff' },
  ghost:  { bg: '#fff',            shadow: colors.ink[200],   text: colors.ink[900] },
} as const;

export type ButtonVariant = keyof typeof buttonColors;
