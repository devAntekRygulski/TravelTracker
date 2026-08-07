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

/** Matches PhotoFocusFrame / map UI phone breakpoint. */
export const PHOTO_FOCUS_PHONE_MAX_PX = 640;

/** Keep a little air inside the safe rect so edges never kiss UI. */
const FOCUS_FIT = 0.82;
/** Phone: fill most of the band above the sheet (both axes). */
const FOCUS_FIT_PHONE_X = 0.92;
const FOCUS_FIT_PHONE_Y = 0.9;

export function getPhotoFocusFitAxes(viewportWidth: number): {
  x: number;
  y: number;
} {
  if (viewportWidth <= PHOTO_FOCUS_PHONE_MAX_PX) {
    return { x: FOCUS_FIT_PHONE_X, y: FOCUS_FIT_PHONE_Y };
  }
  return { x: FOCUS_FIT, y: FOCUS_FIT };
}

/** Uniform fit factor (min axis) — useful where a single scale is needed. */
export function getPhotoFocusFit(viewportWidth: number): number {
  const axes = getPhotoFocusFitAxes(viewportWidth);
  return Math.min(axes.x, axes.y);
}

export type PhotoFocusSafeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

/** Height of the phone strip reserved for “Go to …” territory links. */
export const PHOTO_FOCUS_PHONE_TERRITORY_GAP = 2.75 * 16;

export type PhotoFocusSafeRectOptions = {
  /** Reserve a bottom strip so the outline never covers territory links. */
  reserveTerritoryLinks?: boolean;
};

/**
 * Phone bottom-sheet panel metrics — keep in sync with
 * `.photo-focus-frame__panel` rules in PhotoFocusFrame.css.
 */
export function getPhotoFocusPhonePanelLayout(
  viewportHeight: number,
  options: PhotoFocusSafeRectOptions = {},
): {
  sideInset: number;
  bottom: number;
  height: number;
  gapAbove: number;
} {
  const rem = 16;
  return {
    sideInset: 1.25 * rem,
    bottom: 1.5 * rem,
    // ~55% of the screen — keep in sync with PhotoFocusFrame.css
    height: viewportHeight * 0.55,
    gapAbove: options.reserveTerritoryLinks
      ? PHOTO_FOCUS_PHONE_TERRITORY_GAP
      : 0,
  };
}

/**
 * Region for the focused country outline.
 * Desktop: left half of the viewport.
 * Phone: band above the bottom-sheet upload panel.
 */
export function getPhotoFocusSafeRect(
  viewportWidth: number,
  viewportHeight: number,
  options: PhotoFocusSafeRectOptions = {},
): PhotoFocusSafeRect {
  if (viewportWidth <= PHOTO_FOCUS_PHONE_MAX_PX) {
    const panel = getPhotoFocusPhonePanelLayout(viewportHeight, options);
    // Gear/logo header clearance (same band as before the tall-country tweak).
    const topUi = 8 + 40 + 12;
    const left = panel.sideInset;
    const top = topUi;
    const right = viewportWidth - panel.sideInset;
    const bottom =
      viewportHeight - panel.bottom - panel.height - panel.gapAbove;

    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);

    return {
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      // Center in the country band (above territory strip when reserved).
      centerY: top + height / 2,
    };
  }

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
  options: PhotoFocusSafeRectOptions = {},
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

  const safe = getPhotoFocusSafeRect(width, height, options);
  if (!(safe.width > 0) || !(safe.height > 0)) return null;

  const screenW = pw * zoom;
  const screenH = ph * zoom;
  const fit = getPhotoFocusFitAxes(width);
  const scale = Math.min(
    (safe.width * fit.x) / screenW,
    (safe.height * fit.y) / screenH,
  );

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

/** Resolve `var(--token)` or pass through hex for canvas / lerp. */
export function resolveThemeColor(value: string, fallback = '#2a2a2a'): string {
  if (typeof document === 'undefined') return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('var(')) return trimmed || fallback;
  const match = trimmed.match(/var\(\s*(--[\w-]+)\s*\)/);
  if (!match) return fallback;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(match[1])
      .trim() || fallback
  );
}

/** Unvisited / unfocused country fill on the map (follows active theme). */
export function getPhotoFocusBaseFill(): string {
  return resolveThemeColor('var(--bg-primary)', '#2a2a2a');
}

/** @deprecated Prefer getPhotoFocusBaseFill() for theme-aware fills. */
export const PHOTO_FOCUS_BASE_FILL = '#2a2a2a';

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Interpolate two #RRGGBB colors by t in [0, 1]. */
export function lerpHexColor(from: string, to: string, t: number): string {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  const x = Math.min(1, Math.max(0, t));
  const r = Math.round(lerp(a.r, b.r, x));
  const g = Math.round(lerp(a.g, b.g, x));
  const bl = Math.round(lerp(a.b, b.b, x));
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Focused-country fill: start color → theme base over focus progress. */
export function photoFocusFillColor(startFill: string, progress: number): string {
  return lerpHexColor(
    resolveThemeColor(startFill, '#3d3d3d'),
    getPhotoFocusBaseFill(),
    easeInOutCubic(progress),
  );
}

/** Drive focus visuals without React re-renders (call from rAF). */
export function applyPhotoFocusFrameProgress(
  root: ParentNode | null,
  progress: number,
  transform: PhotoFocusTransform | null = null,
  startFill: string | null = null,
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

  if (startFill) {
    const fill = photoFocusFillColor(startFill, progress);
    root.querySelectorAll('[data-photo-focus-fill]').forEach((node) => {
      (node as HTMLElement | SVGElement).style.fill = fill;
    });
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
