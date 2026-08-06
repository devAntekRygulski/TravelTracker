import { Link } from 'react-router-dom';
import './PrivacyPolicyPage.css';

const CONTACT_EMAIL = 'antek.rygulski@gmail.com';
const SITE_URL = 'https://antonistraveltracker.com';

export function PrivacyPolicyPage() {
  return (
    <main className="privacy-page">
      <article className="privacy-page__article">
        <p className="privacy-page__back">
          <Link to="/">← Back to Travel Tracker</Link>
        </p>

        <h1>Privacy Policy</h1>
        <p className="privacy-page__updated">Last updated: August 5, 2026</p>

        <p>
          Travel Tracker (“we”, “our”, or “the Service”) at{' '}
          <a href={SITE_URL}>{SITE_URL}</a> helps you track countries you have
          visited and attach travel photos to those countries. This Privacy
          Policy explains what information we collect and how we use it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account information.</strong> If you create an account, we
            store your email address and authentication credentials needed to
            sign you in.
          </li>
          <li>
            <strong>Travel data.</strong> Countries you mark as visited and
            related map preferences associated with your account or guest
            session.
          </li>
          <li>
            <strong>Photos you upload.</strong> Images you choose to add to a
            country gallery, including files selected from your device, Google
            Drive, or Google Photos.
          </li>
          <li>
            <strong>Guest session data.</strong> If you use the app as a guest,
            photo and visit data may be stored locally in your browser
            (IndexedDB / local storage) until you clear site data or switch
            devices.
          </li>
        </ul>

        <h2>Google Drive and Google Photos</h2>
        <p>
          If you use <strong>Google Drive</strong> or{' '}
          <strong>Google Photos</strong> import, we use Google’s official picker
          interfaces so you can select specific images. We only receive the
          files (or file content) you explicitly select. We do not scrape your
          full Google Drive or Google Photos library.
        </p>
        <p>
          Access is requested only for the limited scopes needed to let you pick
          and download those selected images into Travel Tracker. We use that
          content solely to store the photos in your Travel Tracker country
          gallery at your request.
        </p>
        <p>
          Travel Tracker’s use and transfer of information received from Google
          APIs adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>How we use information</h2>
        <ul>
          <li>To provide and maintain your map, account, and photo galleries</li>
          <li>To authenticate you and keep your data associated with your account</li>
          <li>To enable optional features such as phone QR upload and Google import</li>
          <li>To improve reliability and fix errors in the Service</li>
        </ul>
        <p>We do not sell your personal information.</p>

        <h2>How photos are stored</h2>
        <ul>
          <li>
            <strong>Signed-in users:</strong> uploaded photos are stored on our
            cloud storage (Amazon S3) and referenced in our database so they can
            be shown in your account.
          </li>
          <li>
            <strong>Guests:</strong> photos are stored in your browser’s local
            storage on that device and are not synced to our servers as account
            media.
          </li>
        </ul>

        <h2>Sharing</h2>
        <p>
          We use service providers that help us operate the Service (for
          example, hosting, database, and cloud storage providers). They process
          data only to provide those services to us. We may disclose information
          if required by law.
        </p>

        <h2>Data retention</h2>
        <p>
          We retain account data and uploaded photos while your account remains
          active. You may delete individual photos in the app. If you want your
          account and associated data deleted, contact us at the email below.
          Guest data remains on your device until you clear it.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>Use the app as a guest without creating an account</li>
          <li>Choose whether to import from Google Drive or Google Photos</li>
          <li>Revoke Google access anytime in your Google Account permissions</li>
          <li>Delete photos from a country gallery in the app</li>
        </ul>

        <h2>Children</h2>
        <p>
          Travel Tracker is not directed to children under 13, and we do not
          knowingly collect personal information from children under 13.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this Privacy Policy from time to time. The “Last updated”
          date at the top will change when we do. Continued use of the Service
          after an update means you accept the revised policy.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this Privacy Policy or your data:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </article>
    </main>
  );
}
