// 그림 한 장(assets/icon-source.jpg)으로 앱 아이콘을 만든다.
// 실행: node scripts/make-icons-from-image.cjs
const Jimp = require('jimp-compact');
const path = require('path');
const A = f => path.join(__dirname, '..', 'assets', f);

(async () => {
    const src = await Jimp.read(A('icon-source.jpg'));
    const { width, height } = src.bitmap;
    // 모서리 색을 바탕색으로 쓴다
    const bg = Jimp.intToRGBA(src.getPixelColor(2, 2));
    const bgHex = '#' + [bg.r, bg.g, bg.b].map(v => v.toString(16).padStart(2, '0')).join('');
    console.log('source', width, height, 'bg', bgHex);
    const canvas = (size, color) => new Jimp(size, size, Jimp.rgbaToInt(color.r, color.g, color.b, color.a ?? 255));

    // 일반 아이콘: 꽉 채움
    const icon = src.clone().resize(1024, 1024, Jimp.RESIZE_BICUBIC);
    await icon.writeAsync(A('icon.png'));

    // 안드로이드 적응형 아이콘: 가운데 안전 영역(약 66%)에 들어가도록 줄여서 투명 바탕 위에
    const fg = canvas(1024, { r: 0, g: 0, b: 0, a: 0 });
    const inner = src.clone().resize(720, 720, Jimp.RESIZE_BICUBIC);
    fg.composite(inner, 152, 152);
    await fg.writeAsync(A('adaptive-icon.png'));

    // 시작 화면
    const splash = src.clone().resize(512, 512, Jimp.RESIZE_BICUBIC);
    await splash.writeAsync(A('splash-icon.png'));

    // 웹 favicon
    await src.clone().resize(48, 48, Jimp.RESIZE_BICUBIC).writeAsync(A('favicon.png'));
    console.log('done');
})();
