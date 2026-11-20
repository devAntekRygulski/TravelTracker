/** Geographic coordinate → equirectangular texture UV (image north-up, lon −180…180). */
export function geoToEquirectUv(lon: number, lat: number): [number, number] {
  const wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const clampedLat = Math.max(-90, Math.min(90, lat));
  const u = (wrappedLon + 180) / 360;
  const v = (90 - clampedLat) / 180;
  return [u, v];
}

function sampleEquirectBilinear(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  v: number,
): [number, number, number, number] {
  const x = ((((u % 1) + 1) % 1) * (width - 1));
  const y = Math.max(0, Math.min(height - 1, v * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % width;
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const out: [number, number, number, number] = [0, 0, 0, 255];
  for (let c = 0; c < 4; c += 1) {
    const top = pixels[i00 + c] * (1 - tx) + pixels[i10 + c] * tx;
    const bottom = pixels[i01 + c] * (1 - tx) + pixels[i11 + c] * tx;
    out[c] = Math.round(top * (1 - ty) + bottom * ty);
  }
  return out;
}

export type ProjectedEarthPaintOptions = {
  /** Top-left of the painted rect in projection/screen space (must match SVG placement). */
  mapOriginX: number;
  mapOriginY: number;
  /** Size of the painted rect in projection/screen space. */
  mapWidth: number;
  mapHeight: number;
  pixelStep?: number;
};

/**
 * Paint an equirectangular satellite image into Mercator/projected map space so
 * coastlines line up with d3 country geometry.
 *
 * `invert` must use the same projection as the country paths. `mapOrigin*` must
 * match where this canvas sits in that projection (e.g. sphere bounds).
 */
export function paintProjectedEarth(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  invert: (coords: [number, number]) => [number, number] | null,
  options: ProjectedEarthPaintOptions,
): void {
  const {
    mapOriginX,
    mapOriginY,
    mapWidth,
    mapHeight,
    pixelStep = 1,
  } = options;

  if (!(mapWidth > 0) || !(mapHeight > 0)) return;

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = image.width;
  sampleCanvas.height = image.height;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sampleCtx) return;

  sampleCtx.drawImage(image, 0, 0);
  const { data: pixels, width: texW, height: texH } = sampleCtx.getImageData(
    0,
    0,
    image.width,
    image.height,
  );

  const outW = Math.max(1, Math.ceil(mapWidth / pixelStep));
  const outH = Math.max(1, Math.ceil(mapHeight / pixelStep));
  const out = ctx.createImageData(outW, outH);

  for (let py = 0; py < outH; py += 1) {
    for (let px = 0; px < outW; px += 1) {
      // Sample in projection space — same coords country borders use.
      const mapX = mapOriginX + (px + 0.5) * pixelStep;
      const mapY = mapOriginY + (py + 0.5) * pixelStep;
      const geo = invert([mapX, mapY]);
      const offset = (py * outW + px) * 4;
      if (!geo) {
        out.data[offset + 3] = 0;
        continue;
      }

      const [u, v] = geoToEquirectUv(geo[0], geo[1]);
      const [r, g, b, a] = sampleEquirectBilinear(pixels, texW, texH, u, v);
      out.data[offset] = r;
      out.data[offset + 1] = g;
      out.data[offset + 2] = b;
      out.data[offset + 3] = a;
    }
  }

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const drawCtx = drawCanvas.getContext('2d');
  if (!drawCtx) return;
  drawCtx.putImageData(out, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, mapWidth, mapHeight);
  ctx.drawImage(drawCanvas, 0, 0, mapWidth, mapHeight);
}
