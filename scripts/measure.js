const sharp = require('sharp');

async function findExactSquircles() {
  const { data, info } = await sharp('public/assets/icons/fetch-nav-sprite.png')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const colCenters = [154, 426, 698, 970];
  
  for (let r = 0; r < 4; r++) {
    const yStart = r * 350;
    const yEnd = Math.min((r + 1) * 350, info.height);
    for (let c = 0; c < 4; c++) {
      const x = colCenters[c];
      let top = -1, bottom = -1;
      for (let y = yStart; y < yEnd; y++) {
        const idx = (y * w + x) * 4;
        const red = data[idx], green = data[idx+1], blue = data[idx+2];
        const isBody = (red < 248 || green < 248 || blue < 248);
        if (isBody && top === -1) top = y;
        if (isBody) bottom = y;
      }
      console.log('Row ' + r + ' col ' + c + ': ' + top + '..' + bottom + ' h=' + (bottom-top+1) + ' cy=' + ((top+bottom)/2));
    }
  }
}
findExactSquircles();
