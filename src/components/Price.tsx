import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gem } from './Gem';
import { colors, fontFamilies, fontSizes, radius } from '../theme';

interface PriceProps {
  diamonds: number;
  rubies?: number;
  topaz?: number;
  size?: number;
  /** 잔고 표시용 — 0개인 보석도 보여준다 */
  showZero?: boolean;
}

/** 보상 가격 / 보유 보석 표시 — 다이아와 루비 중 0이 아닌 것만 칩으로 보여준다 */
export function Price({ diamonds, rubies = 0, topaz, size = 14, showZero = false }: PriceProps) {
  return (
    <View style={styles.row}>
      {(showZero || diamonds > 0) && (
        <View style={styles.chip}>
          <Gem size={size} />
          <Text style={styles.num}>{diamonds}</Text>
        </View>
      )}
      {(showZero || rubies > 0) && (
        <View style={[styles.chip, styles.rubyChip]}>
          <Gem size={size} kind="ruby" />
          <Text style={styles.num}>{rubies}</Text>
        </View>
      )}
      {topaz !== undefined && (showZero || topaz > 0) && (
        <View style={[styles.chip, styles.topazChip]}>
          <Gem size={size} kind="topaz" />
          <Text style={styles.num}>{topaz}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.paper2,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rubyChip: { backgroundColor: '#ffe9ee' },
  topazChip: { backgroundColor: '#fff4d6' },
  num: {
    fontFamily: fontFamilies.num,
    fontSize: fontSizes.xs,
    color: colors.ink[700],
    fontWeight: '700',
  },
});
