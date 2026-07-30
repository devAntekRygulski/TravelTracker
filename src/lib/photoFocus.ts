import {
  geoPath,
  type GeoProjection,
} from 'd3-geo';
import type { Feature, Geometry } from 'geojson';

export const PHOTO_FOCUS_DURATION_MS = 1600;
export const PHOTO_FOCUS_PAD = 28;

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path lerp for longitude degrees. */
export function lerpLongitude(a: number, b: number, t: number): number {
  let delta = ((((b - a) % 360) + 540) % 360) - 180;
  return a + delta * t;
}

/** Keep a little air inside the safe rect so edges never kiss UI. */
const FOCUS_FIT = 0.82;

export type PhotoFocusSafeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

/**
 * Left-half region for the focused country. Cleared of the header;
 * bottom stays open for territory links (stats oval is hidden in this mode).
 */
export function getPhotoFocusSafeRect(
  viewportWidth: number,
  viewportHeight: number,
): PhotoFocusSafeRect {
  // Burger + header clearance, then extra top inset so framing sits lower.
  const topUi = 8 + 32 + 72 + 48;
  const bottomUi = 72;
  const leftUi = 28;
  const midGap = 28;

  const left = leftUi;
  const top = topUi;
  const right = viewportWidth * 0.5 - midGap;
  const bottom = viewportHeight - bottomUi;

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  return {
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

export type PhotoFocusTransform = {
  cx: number;
  cy: number;
  scale: number;
  dx: number;
  dy: number;
  /** Country bounds top-left in projection space. */
  x0: number;
  y0: number;
};

/**
 * Projection-space transform that places a country in the left half of the
 * viewport after ZoomableGroup applies center/zoom.
 */
export function computeFlatPhotoFocusTransform(
  geo: Feature<Geometry>,
  projection: GeoProjection,
  width: number,
  height: number,
  mapCenter: [number, number],
  mapZoom: number,
): PhotoFocusTransform | null {
  const path = geoPath(projection);
  const [[x0, y0], [x1, y1]] = path.bounds(geo);
  const pw = x1 - x0;
  const ph = y1 - y0;
  if (!(pw > 0) || !(ph > 0)) return null;

  // Use bbox center (not geoCentroid) so elongated chains like Hawaii
  // stay fully inside the safe rect after scale.
  const pcx = (x0 + x1) / 2;
  const pcy = (y0 + y1) / 2;
  const centerProj = projection(mapCenter);
  if (!centerProj) return null;

  const [cpx, cpy] = centerProj;
  const zoom = Math.max(mapZoom, 0.001);

  const safe = getPhotoFocusSafeRect(width, height);
  if (!(safe.width > 0) || !(safe.height > 0)) return null;

  const screenW = pw * zoom;
  const screenH = ph * zoom;
  const scale =
    Math.min(safe.width / screenW, safe.height / screenH) * FOCUS_FIT;

  const dx = (safe.centerX - width / 2) / zoom - (pcx - cpx);
  const dy = (safe.centerY - height / 2) / zoom - (pcy - cpy);

  return { cx: pcx, cy: pcy, scale, dx, dy, x0, y0 };
}

export function flatPhotoFocusTransformString(
  focus: PhotoFocusTransform,
  progress: number,
): string {
  const t = easeInOutCubic(progress);
  const scale = lerp(1, focus.scale, t);
  const dx = lerp(0, focus.dx, t);
  const dy = lerp(0, focus.dy, t);
  return `translate(${dx},${dy}) translate(${focus.cx},${focus.cy}) scale(${scale}) translate(${-focus.cx},${-focus.cy})`;
}

/** Drive focus visuals without React re-renders (call from rAF). */
export function applyPhotoFocusFrameProgress(
  root: ParentNode | null,
  progress: number,
  transform: PhotoFocusTransform | null = null,
): void {
  if (!root) return;

  const eased = easeInOutCubic(progress);
  if (root instanceof HTMLElement) {
    root.style.setProperty('--photo-fade', String(1 - eased));
  }

  if (transform) {
    const active = root.querySelector('[data-photo-focus-transform]');
    if (active) {
      active.setAttribute(
        'transform',
        flatPhotoFocusTransformString(transform, progress),
      );
    }
  }

  const frame = root.querySelector(
    '[data-photo-focus-frame]',
  ) as HTMLElement | null;
  if (frame) {
    frame.style.opacity = String(eased);
  }

  const links = root.querySelector(
    '[data-photo-focus-links]',
  ) as HTMLElement | null;
  if (links) {
    links.style.opacity = String(
      easeInOutCubic(Math.max(0, (progress - 0.55) / 0.45)),
    );
  }
}
