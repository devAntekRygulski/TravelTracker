const ICON_SIZE = 17;

export function FolderIcon() {
  return (
    <svg
      className="photo-focus-frame__action-icon photo-focus-frame__action-icon--mono"
      viewBox="0 0 24 24"
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M3.5 6.75A2.25 2.25 0 0 1 5.75 4.5h3.38c.4 0 .78.16 1.06.44l1.12 1.12c.28.28.66.44 1.06.44h6.13A2.25 2.25 0 0 1 20.75 8.75v8.5A2.25 2.25 0 0 1 18.5 19.5H5.75A2.25 2.25 0 0 1 3.5 17.25v-10.5Z"
      />
    </svg>
  );
}

export function GoogleDriveIcon() {
  return (
    <svg
      className="photo-focus-frame__action-icon"
      viewBox="0 0 87.3 78"
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#0066da"
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
      />
      <path
        fill="#00ac47"
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
      />
      <path
        fill="#ea4335"
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.1z"
      />
      <path
        fill="#00832d"
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
      />
      <path
        fill="#2684fc"
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
      />
      <path
        fill="#ffba00"
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
      />
    </svg>
  );
}

export function GooglePhotosIcon() {
  return (
    <svg
      className="photo-focus-frame__action-icon"
      viewBox="0 0 59 59"
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FBBC04"
        d="M14.75 13.41c8.146 0 14.75 6.603 14.75 14.75v1.34H1.34C.6 29.5 0 28.9 0 28.16c0-8.147 6.604-14.75 14.75-14.75z"
      />
      <path
        fill="#EA4335"
        d="M45.59 14.75c0 8.146-6.603 14.75-14.75 14.75H29.5V1.34C29.5.6 30.1 0 30.84 0c8.147 0 14.75 6.604 14.75 14.75z"
      />
      <path
        fill="#4285F4"
        d="M44.25 45.59c-8.146 0-14.75-6.603-14.75-14.75V29.5h28.16c.74 0 1.34.6 1.34 1.34 0 8.147-6.604 14.75-14.75 14.75z"
      />
      <path
        fill="#34A853"
        d="M13.41 44.25c0-8.146 6.603-14.75 14.75-14.75h1.34v28.16c0 .74-.6 1.34-1.34 1.34-8.147 0-14.75-6.604-14.75-14.75z"
      />
    </svg>
  );
}
