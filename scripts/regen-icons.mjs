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
const SRC = path.resolve(
  repoRoot,
  "../전달용/4. tenten blue/심볼_tentenblue.png",
);
const OUT = path.resolve(repoRoot, "public/icons");

const BRAND = "#4CBFF2";

await mkdir(OUT, { recursive: true });

// ── source 이미지 1.25배 zoom 후 중앙 crop (2026-05-21) ──
// 사용자 보고: PWA 설치 아이콘의 tt: 글씨가 작게 보임. 옛 디자인의 "꽉 찬 느낌"
// 복원 위해 원본(1920×1920) 을 2400×2400 으로 확대 후 중앙 1920×1920 만 추출.
// → 가장자리 여백 ~10% 가 잘리면서 글씨 비율이 1.25 배로 커짐.
const ZOOMED_SRC = await sharp(SRC)
  .resize({ width: 2400, height: 2400, fit: "fill" })
  .extract({ left: 240, top: 240, width: 1920, height: 1920 })
  .png()
  .toBuffer();

// 1.5배 zoom 변형 — InstallPrompt 모달 (splash-circle-512.png) 전용. 글씨를 더 크게.
const ZOOMED_1_5X = await sharp(SRC)
  .resize({ width: 2880, height: 2880, fit: "fill" })
  .extract({ left: 480, top: 480, width: 1920, height: 1920 })
  .png()
  .toBuffer();

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

// 1a) favicon (16/32/48/192) — 원형 마스크 적용 (모서리 4개 투명).
//     브라우저 탭/북마크에서 원형 심볼로 표시.
const faviconSizes = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-48.png", size: 48 },
  { name: "favicon-192.png", size: 192 },
];
for (const { name, size } of faviconSizes) {
  const resized = await sharp(ZOOMED_SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const circular = await applyCircleMask(resized, size);
  const fs = await import("node:fs/promises");
  await fs.writeFile(path.join(OUT, name), circular);
  console.log(`✓ ${name} (${size}×${size}, 원형)`);
}

// 1b) PWA OS 홈 아이콘 (apple-touch-icon/icon-192/icon-512) — round-square 그대로.
//     사용자 결정 (2026-05-21): "원형으로 하면 OS 가 마스크해서 흰 모서리 보임 → 사각 유지".
const squareSizes = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];
for (const { name, size } of squareSizes) {
  await sharp(ZOOMED_SRC)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(path.join(OUT, name));
  console.log(`✓ ${name} (${size}×${size}, round-square)`);
}

// 1c) splash-circle-512.png — InstallPrompt 모달 ("홈 화면에 추가해보세요!") 아이콘.
//     1.5배 zoom + 원형 마스크. tt: 글씨를 더 크게 보여줌.
{
  const size = 512;
  const resized = await sharp(ZOOMED_1_5X)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const circular = await applyCircleMask(resized, size);
  const fs = await import("node:fs/promises");
  await fs.writeFile(path.join(OUT, "splash-circle-512.png"), circular);
  console.log(`✓ splash-circle-512.png (512×512, 원형 + 1.5x zoom, InstallPrompt 모달용)`);
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
