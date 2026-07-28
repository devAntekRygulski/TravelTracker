import { useEffect, useRef } from 'react';
import { easeInOutCubic } from '../lib/photoFocus';
import './PhotoFocusFrame.css';

const CLOSE_CSS_SIZE = 18;
const CLOSE_CSS_LINE = 2;

function paintCloseX(canvas: HTMLCanvasElement, color: string): void {
  const dpr = window.devicePixelRatio || 1;
  const size = Math.round(CLOSE_CSS_SIZE * dpr);
  const line = Math.max(1, Math.round(CLOSE_CSS_LINE * dpr));

  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  canvas.style.width = `${CLOSE_CSS_SIZE}px`;
  canvas.style.height = `${CLOSE_CSS_SIZE}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.lineCap = 'square';

  const inset = line;
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  ctx.lineTo(size - inset, size - inset);
  ctx.moveTo(size - inset, inset);
  ctx.lineTo(inset, size - inset);
  ctx.stroke();
}

interface PhotoFocusFrameProps {
  progress: number;
  onClose: () => void;
}

/** Right-side photos panel while a country is focused. */
export function PhotoFocusFrame({ progress, onClose }: PhotoFocusFrameProps) {
  const opacity = easeInOutCubic(progress);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const canvas = canvasRef.current;
    if (!button || !canvas) return;

    const repaint = () => {
      paintCloseX(canvas, getComputedStyle(button).color);
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
    <div className="photo-focus-frame" style={{ opacity }}>
      <aside className="photo-focus-frame__panel" aria-label="Add photos">
        <button
          ref={buttonRef}
          type="button"
          className="photo-focus-frame__close"
          onClick={onClose}
          aria-label="Back to map"
        >
          <canvas
            ref={canvasRef}
            className="photo-focus-frame__close-icon"
            aria-hidden="true"
          />
        </button>
      </aside>
    </div>
  );
}
