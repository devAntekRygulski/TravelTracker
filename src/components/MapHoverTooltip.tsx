import './MapHoverTooltip.css';

export const HOVER_TOOLTIP_OFFSET_X = 10;
export const HOVER_TOOLTIP_OFFSET_Y = 8;

interface MapHoverTooltipProps {
  label: string | null;
  x: number;
  y: number;
  visible: boolean;
}

/** Lightweight name label that follows the cursor. */
export function MapHoverTooltip({
  label,
  x,
  y,
  visible,
}: MapHoverTooltipProps) {
  if (!visible || !label) return null;

  return (
    <div
      className="map-hover-tooltip"
      style={{
        transform: `translate(${x + HOVER_TOOLTIP_OFFSET_X}px, ${y + HOVER_TOOLTIP_OFFSET_Y}px)`,
      }}
      role="status"
      aria-live="polite"
    >
      <p className="map-hover-tooltip__name">{label}</p>
    </div>
  );
}
