// 상점 물건의 이름·그림·설명. 가격은 서버(GET /pet 의 shop)에서 받는다
export type ItemKind = 'snack' | 'toy' | 'decor' | 'wall' | 'cushion' | 'gadget';

export interface ItemInfo { emoji: string; name: string; desc: string; kind: ItemKind }

export const ITEMS: Record<string, ItemInfo> = {
    // 간식 (먹으면 없어짐)
    cookie: { emoji: '🍪', name: '쿠키', desc: '3시간 동안 기분좋음', kind: 'snack' },
    apple: { emoji: '🍎', name: '사과', desc: '6시간 동안 기분좋음', kind: 'snack' },
    icecream: { emoji: '🍦', name: '아이스크림', desc: '하루 동안 기분좋음', kind: 'snack' },
    // 장난감
    doll: { emoji: '🧸', name: '인형', desc: '안고 뒹굴어요', kind: 'toy' },
    bubbles: { emoji: '🫧', name: '비눗방울 기계', desc: '비눗방울을 쫓아 폴짝 뛰어요', kind: 'toy' },
    tunnel: { emoji: '🕳️', name: '터널', desc: '들어갔다 반대편으로 나와요', kind: 'toy' },
    slide: { emoji: '🛝', name: '미끄럼틀', desc: '올라가서 미끄러져 내려와요', kind: 'toy' },
    // 가구
    rug: { emoji: '🟩', name: '러그', desc: '방 가운데 폭신한 깔개', kind: 'decor' },
    plant: { emoji: '🪴', name: '화분', desc: '구석에 초록 화분', kind: 'decor' },
    curtain: { emoji: '🎀', name: '커튼', desc: '창문에 분홍 커튼', kind: 'decor' },
    wall_sky: { emoji: '🩵', name: '하늘 벽지', desc: '하늘색 줄무늬', kind: 'wall' },
    wall_pink: { emoji: '🩷', name: '분홍 벽지', desc: '분홍 물방울무늬', kind: 'wall' },
    wall_mint: { emoji: '💚', name: '민트 벽지', desc: '민트색 줄무늬', kind: 'wall' },
    cushion_blue: { emoji: '💙', name: '파란 쿠션', desc: '쿠션 색을 파랗게', kind: 'cushion' },
    // 능력 물건 (방에 꺼내 놓았을 때만 작동)
    robot: { emoji: '🤖', name: '자동 청소기', desc: '하루 1번 똥을 치워 줘요 (청소한 날로는 안 세요)', kind: 'gadget' },
    feeder: { emoji: '🍽️', name: '자동 급식기', desc: '밥을 깜빡하면 밤 9시에 줘요 (🔶3, 밥 준 날로는 안 세요)', kind: 'gadget' },
    firstaid: { emoji: '🩺', name: '구급상자', desc: '중병이 되기까지 하루 더 버텨요', kind: 'gadget' },
    bed: { emoji: '🛏️', name: '포근한 침대', desc: '아파도 하루 더 곁에 있어요', kind: 'gadget' },
};

/** 방에 꺼내 놓는 물건 (창고 자리 수를 차지한다) */
export const isPlaceable = (key: string) => {
    const k = ITEMS[key]?.kind;
    return k === 'toy' || k === 'decor' || k === 'gadget';
};
