const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconNames = [
  ['start-studying', 'add-material', 'home', 'studypacks'],
  ['progress', 'calendar', 'tutor', 'pomodoro'],
  ['music', 'live', 'friends', 'messages'],
  ['settings', 'dark-theme', 'sign-out', 'cloud-sync']
];

const colRanges = [
  [20, 290],
  [295, 560],
  [565, 830],
  [835, 1110]
];

const rowRanges = [
  [100, 360],
  [380, 660],
  [680, 960],
  [980, 1260]
];

async function run() {
  const inputPath = 'public/assets/icons/fetch-nav-sprite.png';
  const outDir = 'public/assets/icons/nav';
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const { data, info } = await sharp(inputPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const name = iconNames[r][c];
      const [x0, x1] = colRanges[c];
      const [y0, y1] = rowRanges[r];

      let minX = x1, maxX = x0, minY = y1, maxY = y0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * w + x) * 4;
          const a = data[idx + 3];
          if (a > 15) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      console.log(`[${r},${c}] ${name}: x=${minX}..${maxX} (w=${maxX-minX+1}), y=${minY}..${maxY} (h=${maxY-minY+1})`);

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const span = Math.max(maxX - minX + 1, maxY - minY + 1);
      const padding = 8;
      const boxSize = span + padding * 2;

      let left = Math.round(cx - boxSize / 2);
      let top = Math.round(cy - boxSize / 2);
      let extractW = Math.round(boxSize);
      let extractH = Math.round(boxSize);

      if (left < 0) left = 0;
      if (top < 0) top = 0;
      if (left + extractW > w) extractW = w - left;
      if (top + extractH > info.height) extractH = info.height - top;

      const outPath = path.join(outDir, `${name}.png`);
      await sharp(inputPath)
        .extract({ left, top, width: extractW, height: extractH })
        .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(outPath);

      console.log(`  -> Saved ${outPath}`);
    }
  }
}

run().catch(console.error);
