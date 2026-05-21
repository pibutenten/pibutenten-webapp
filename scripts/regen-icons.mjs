// 파비콘 / PWA 아이콘 / iOS splash 일괄 재생성 — 2026-05-20.
// 원본: 전달용/4. tenten blue/심볼_tentenblue.png (1920×1920 RGBA, 흰 배경).
// 출력: public/icons/ 하위 png 들.
//
// 정책:
//   - 파비콘(16/32/48/192) + apple-touch-icon(180) + icon-192/512: 흰 배경 그대로 사용 (사용자 결정 — 심볼_tentenblue 파일 그대로 사용).
//   - icon-maskable-512: PWA maskable 은 safe zone 80% 필요 → 64% 로 축소해서 가장자리 padding.
//   - apple-splash.png: iOS PWA splash. 2048×2732 단일 이미지, #4CBFF2 배경에 로고 35% 크기로 중앙.
//
// 사용:
//   node scripts/regen-icons.mjs

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
// 2026-05-21 source 교체: 옛 PNG round-square (심볼_tentenblue.png) 가 사용자가 말한
// "진짜 우리 심볼" 이 아니라는 보고 → public/icons/symbol.svg 원형 심볼 (vivid blue
// "심볼.svg" 의 원형 디자인 + 색만 #4CBFF2) 로 교체. SVG 라 모든 사이즈에서 깨끗.
const SRC = path.resolve(repoRoot, "public/icons/symbol.svg");
const OUT = path.resolve(repoRoot, "public/icons");

const BRAND = "#4CBFF2";

await mkdir(OUT, { recursive: true });

// SVG 를 1920×1920 PNG 로 우선 렌더 (downstream 파이프라인 호환).
const ZOOMED_SRC = await sharp(SRC, { density: 600 })
  .resize(1920, 1920, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// 1.5배 zoom 변형 — 더 이상 사용 안 함 (오리지널 통일). 호환성 위해 alias 유지.
const ZOOMED_1_5X = ZOOMED_SRC;

// 원형 마스크 헬퍼 — round-square PNG 를 받아 원형(외곽 투명) 으로 처리.
//   브라우저 탭 favicon 전용 — 사용자 결정 (2026-05-21): "원형으로 하면 흰색 모서리 안 보임".
//   PWA OS 홈 아이콘 (apple-touch-icon, icon-192/512, maskable) 은 round-square 그대로 유지.
async function applyCircleMask(srcBuf, size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
  );
  return sharp(srcBuf)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

// 2026-05-21 정책 정비 (사용자 결정 보완):
//
//   (a) favicon (16/32/48/192) + splash-circle-512 (InstallPrompt 모달):
//       원형 심볼 그대로 + 투명 배경.
//       - 브라우저 탭: 탭 배경 위에 원형 심볼 노출.
//       - InstallPrompt 모달: 흰 모달 박스 위에 원형 심볼 노출 (사이트 브랜드 강조).
//
//   (b) PWA OS 홈 아이콘 (apple-touch-icon/icon-192/icon-512):
//       원형 심볼 위에 #4CBFF2 정사각 배경. OS 의 round-square 마스크가 적용되어도
//       같은 청색이라 흰 모서리 없이 자연스러움 (디바이스마다 다른 마스크 모양 대응).

// (a) favicon + InstallPrompt 모달 아이콘 — 원형 + 투명 배경
const circularIcons = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-48.png", size: 48 },
  { name: "favicon-192.png", size: 192 },
  { name: "splash-circle-512.png", size: 512 }, // InstallPrompt 모달 — 사이트 브랜드 원형 심볼
];
for (const { name, size } of circularIcons) {
  await sharp(SRC, { density: 600 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT, name));
  console.log(`✓ ${name} (${size}×${size}, 원형 + 투명)`);
}

// (b) PWA OS 홈 아이콘 — 원형 심볼 위에 #4CBFF2 정사각 배경 (OS 마스크 대응)
//     사용자 결정 (2026-05-21): 원형 심볼을 사각 캔버스 1.5배로 키워 중앙 합성 →
//     원이 캔버스 밖으로 튀어나가 모서리가 청색 사각 배경에 자연스럽게 흡수 → tt:
//     글씨가 화면 가득 차게 보임. OS round-square 마스크에도 모서리 청색 유지.
const squareSizes = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];
// SVG 원본 tt: 글씨가 원 직경 약 58% 만 차지 (path 좌표 25~110 / 원 147).
// 1.5x 로 키워도 청색 사각 캔버스 대비 87% → 사용자 "아직 작다" 보고.
// 2.0x 면 글씨 폭이 캔버스의 약 116% → 양옆이 청색 모서리에 흡수되며 tt: 가 꽉 참.
const SYMBOL_SCALE = 2.0;
for (const { name, size } of squareSizes) {
  const renderSize = Math.round(size * SYMBOL_SCALE);
  const cropOffset = Math.round((renderSize - size) / 2);
  // 1) 1.5x 크기로 심볼 렌더
  const symbolBuf = await sharp(SRC, { density: 600 })
    .resize(renderSize, renderSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  // 2) 같은 1.5x 크기의 청색 캔버스에 심볼 얹기 → buffer → extract 중앙 size×size.
  //    sharp pipeline 에서 composite→extract 체인이 일부 버전에서 거부됨.
  //    composite 결과를 buffer 로 분리 후 별도 extract 호출하는 패턴이 안전.
  const composedBuf = await sharp({
    create: {
      width: renderSize,
      height: renderSize,
      channels: 4,
      background: { r: 76, g: 191, b: 242, alpha: 1 }, // #4CBFF2
    },
  })
    .composite([{ input: symbolBuf }])
    .png()
    .toBuffer();
  await sharp(composedBuf)
    .extract({ left: cropOffset, top: cropOffset, width: size, height: size })
    .png()
    .toFile(path.join(OUT, name));
  console.log(`✓ ${name} (${size}×${size}, 청색 사각 + 원형 심볼 1.5x)`);
}

// 2) maskable 512 — PWA maskable safe zone 80% (가장자리 padding 20%).
//    실제 padding: 18%(좌우상하 9%) — 안전.
{
  const size = 512;
  const inner = Math.round(size * 0.64); // 안전영역 안쪽으로 한 번 더 줄임
  const offset = Math.round((size - inner) / 2);
  const innerBuf = await sharp(ZOOMED_SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 76, g: 191, b: 242, alpha: 1 }, // #4CBFF2
    },
  })
    .composite([{ input: innerBuf, top: offset, left: offset }])
    .png()
    .toFile(path.join(OUT, "icon-maskable-512.png"));
  console.log(`✓ icon-maskable-512.png (512×512, maskable)`);
}

// 3) iOS apple-splash.png — 2048×2732 (iPad Pro 12.9), #4CBFF2 배경 + 중앙 로고 35%.
//    iOS 가 자동 스케일/크롭 → 모든 디바이스 대응.
{
  const W = 2048;
  const H = 2732;
  const logo = Math.round(Math.min(W, H) * 0.35); // 717px
  const logoBuf = await sharp(ZOOMED_SRC)
    .resize(logo, logo, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  // 로고 자체가 흰 배경 PNG 라 합성 시 흰 박스가 그대로 보임 → 둥근 흰 원 위에 얹는 형태가 안 됨.
  //   심볼_tentenblue.png 자체가 흰 정사각 배경이므로 그대로 #4CBFF2 위에 얹으면 흰 박스가 보임.
  //   → 로고 영역만 흰 원형으로 처리: 흰 원 마스크 위에 로고를 contain.
  const ring = Math.round(logo * 1.0); // 흰 원 = 로고 크기와 동일
  const svgRing = Buffer.from(
    `<svg width="${ring}" height="${ring}" xmlns="http://www.w3.org/2000/svg"><circle cx="${ring / 2}" cy="${ring / 2}" r="${ring / 2}" fill="#FFFFFF"/></svg>`,
  );
  const ringBuf = await sharp(svgRing).png().toBuffer();
  const left = Math.round((W - logo) / 2);
  const top = Math.round((H - logo) / 2);
  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 76, g: 191, b: 242, alpha: 1 },
    },
  })
    .composite([
      { input: ringBuf, top, left },
      { input: logoBuf, top, left },
    ])
    .png()
    .toFile(path.join(OUT, "apple-splash.png"));
  console.log(`✓ apple-splash.png (${W}×${H}, iOS PWA)`);
}

console.log("\nDone.");
