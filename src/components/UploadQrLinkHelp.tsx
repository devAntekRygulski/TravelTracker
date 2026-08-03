import { useState } from 'react';
import './UploadQrLinkHelp.css';

interface UploadQrLinkHelpProps {
  uploadUrl: string;
}

function isPublicUploadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return false;
    // Private / LAN ranges need same Wi‑Fi.
    if (
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Instructions shown beside QR codes so phones can connect reliably. */
export function UploadQrLinkHelp({ uploadUrl }: UploadQrLinkHelpProps) {
  const [copied, setCopied] = useState(false);
  const publicLink = isPublicUploadUrl(uploadUrl);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(uploadUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="upload-qr-link-help">
      {publicLink ? (
        <p className="upload-qr-link-help__note">
          Public link — your phone can use any Wi‑Fi or mobile data. Keep the
          upload panel open on this laptop so photos sync in.
        </p>
      ) : (
        <>
          <p className="upload-qr-link-help__note">
            Local link — phone and laptop must share the same Wi‑Fi. On library
            Wi‑Fi, run <strong>npm run tunnel</strong> in another terminal for a
            public link.
          </p>
          <p className="upload-qr-link-help__note">
            Keep <strong>http://</strong> and do not add <strong>www</strong>.
          </p>
        </>
      )}
      <a
        className="upload-qr-link-help__url"
        href={uploadUrl}
        target="_blank"
        rel="noreferrer"
      >
        {uploadUrl}
      </a>
      <button
        type="button"
        className="upload-qr-link-help__copy"
        onClick={() => void copyLink()}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
