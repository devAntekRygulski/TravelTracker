export const EARTH_TEXTURE_URL = '/earth-satellite.jpg';

let loadPromise: Promise<HTMLImageElement> | null = null;

/** Lazy-load the equirectangular satellite base map (shared by flat map + globe). */
export function loadEarthTexture(): Promise<HTMLImageElement> {
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load earth satellite texture.'));
      // Bump query when swapping the public texture so browsers pick up the new file.
      image.src = `${EARTH_TEXTURE_URL}?v=5`;
    });
  }
  return loadPromise;
}
