import { useEffect, useRef } from 'react';

const CSS_WIDTH = 22;
const CSS_HEIGHT = 16;
const CSS_LINE = 2;

function paintBurger(
  canvas: HTMLCanvasElement,
  color: string,
): void {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(CSS_WIDTH * dpr);
  const height = Math.round(CSS_HEIGHT * dpr);
  const lineHeight = Math.max(1, Math.round(CSS_LINE * dpr));
  const gap = Math.floor((height - lineHeight * 3) / 2);

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = `${CSS_WIDTH}px`;
  canvas.style.height = `${CSS_HEIGHT}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;

  // Identical integer-pixel bars — avoids Windows DPI rounding per DOM line.
  ctx.fillRect(0, 0, width, lineHeight);
  ctx.fillRect(0, lineHeight + gap, width, lineHeight);
  ctx.fillRect(0, lineHeight * 2 + gap * 2, width, lineHeight);
}

interface MapBurgerButtonProps {
  open?: boolean;
  onClick?: () => void;
}

export function MapBurgerButton({ open = false, onClick }: MapBurgerButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const canvas = canvasRef.current;
    if (!button || !canvas) return;

    const repaint = () => {
      paintBurger(canvas, getComputedStyle(button).color);
    };

    repaint();

    const onHoverChange = () => {
      requestAnimationFrame(repaint);
    };

    button.addEventListener('mouseenter', onHoverChange);
    button.addEventListener('mouseleave', onHoverChange);
    button.addEventListener('focus', onHoverChange);
    button.addEventListener('blur', onHoverChange);
    window.addEventListener('resize', repaint);

    return () => {
      button.removeEventListener('mouseenter', onHoverChange);
      button.removeEventListener('mouseleave', onHoverChange);
      button.removeEventListener('focus', onHoverChange);
      button.removeEventListener('blur', onHoverChange);
      window.removeEventListener('resize', repaint);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="map-page__burger"
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="map-side-panel"
      onClick={onClick}
    >
      <canvas ref={canvasRef} className="map-page__burger-canvas" aria-hidden="true" />
    </button>
  );
}
