import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path, Line } from 'react-native-svg';
import { colors } from '../theme';

interface GemProps {
  size?: number;
  kind?: 'diamond' | 'ruby' | 'topaz';
}

export function Gem({ size = 24, kind = 'diamond' }: GemProps) {
  // useId()는 ":r0:" 형식으로 콜론 포함 → url(#...) 참조 깨짐, sanitize 필수
  const rawId = React.useId();
  const gradId = React.useMemo(() => `gem${rawId.replace(/:/g, '')}`, [rawId]);

  const [lt, md, dk] = colors[kind];
  // 토파즈는 육각 컷으로 모양도 다르게
  const body = kind === 'topaz' ? 'M16 3 L27 10 L27 21 L16 29 L5 21 L5 10 Z' : 'M16 2 L28 12 L16 30 L4 12 Z';
  const shine = kind === 'topaz' ? 'M16 3 L20 10 L20 21 L16 29 L12 21 L12 10 Z' : 'M16 2 L20 12 L16 30 L12 12 Z';
  const mid = kind === 'topaz' ? 10 : 12;

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={lt} />
          <Stop offset="60%"  stopColor={md} />
          <Stop offset="100%" stopColor={dk} />
        </LinearGradient>
      </Defs>
      {/* 다이아몬드 본체 */}
      <Path
        d={body}
        fill={`url(#${gradId})`}
        stroke={dk}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* 중앙 세로 하이라이트 */}
      <Path
        d={shine}
        fill={md}
        fillOpacity={0.5}
      />
      {/* 가로 구분선 */}
      <Line
        x1={kind === 'topaz' ? 5 : 4} y1={mid} x2={kind === 'topaz' ? 27 : 28} y2={mid}
        stroke={dk}
        strokeWidth="1.2"
        strokeOpacity={0.6}
      />
      {/* 왼쪽 상단 반짝임 */}
      <Path
        d="M9 6 L10.5 9.5"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity={0.7}
      />
    </Svg>
  );
}
