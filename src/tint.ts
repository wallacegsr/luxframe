// Tints the glass with the background's own color, the way frosted glass over
// a photo picks up its hue. Images from /local/ are same-origin, so a canvas
// can read them; anything it can't read just keeps the default tint.

const cache = new Map<string, Promise<string | null>>();

/** The first url(...) in a CSS background value. */
export function backgroundUrl(background: string | undefined): string | undefined {
  return background?.match(/url\(\s*(['"]?)(.*?)\1\s*\)/)?.[2];
}

export function averageColor(url: string): Promise<string | null> {
  let result = cache.get(url);
  if (!result) {
    result = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 16;
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          const sum = [0, 0, 0];
          for (let i = 0; i < data.length; i += 4) {
            sum[0] += data[i];
            sum[1] += data[i + 1];
            sum[2] += data[i + 2];
          }
          const n = data.length / 4;
          resolve(`rgb(${sum.map((v) => Math.round(v / n)).join(' ')})`);
        } catch {
          resolve(null); // a cross-origin image without CORS taints the canvas
        }
      };
      img.src = url;
    });
    cache.set(url, result);
  }
  return result;
}
