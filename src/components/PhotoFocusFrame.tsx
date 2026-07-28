import { easeInOutCubic } from '../lib/photoFocus';
import './PhotoFocusFrame.css';

interface PhotoFocusFrameProps {
  progress: number;
  onClose: () => void;
}

/** Back control fixed under the burger while a country is focused. */
export function PhotoFocusFrame({ progress, onClose }: PhotoFocusFrameProps) {
  const opacity = easeInOutCubic(progress);

  return (
    <div className="photo-focus-frame" style={{ opacity }}>
      <button
        type="button"
        className="photo-focus-frame__back"
        onClick={onClose}
        aria-label="Back to map"
      >
        <img
          className="photo-focus-frame__back-icon"
          src="/arrow_back.png"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      </button>
    </div>
  );
}
