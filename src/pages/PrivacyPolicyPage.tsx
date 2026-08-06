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
          <a href={SITE_URL}>{SITE_URL}</a> is a travel mapping app that lets
          you mark countries you have visited and attach travel photos to those
          countries. This Privacy Policy explains what information we collect,
          how we use it, and how we handle Google user data when you choose to
          import photos from Google Drive or Google Photos.
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

        <h2>Google user data (Google Drive and Google Photos)</h2>
        <p>
          If you use <strong>Google Drive</strong> or{' '}
          <strong>Google Photos</strong> import, we use Google’s official picker
          interfaces so you can select specific images. We only receive the
          image files (or file content) you explicitly select. We do not request
          or scrape your full Google Drive library or full Google Photos
          library.
        </p>
        <p>
          Access is requested only for the limited OAuth scopes needed to let
          you pick and download those selected images into Travel Tracker
          (Google Drive file access for picked files, and Google Photos Picker
          read access for selected media items).
        </p>
        <p>
          <strong>How we use Google user data:</strong> solely to import the
          photos you select into your Travel Tracker country gallery, store them
          as described below, and display them back to you in the Service. This
          is a user-facing feature that you control.
        </p>
        <p>
          <strong>How we store Google user data:</strong> for signed-in users,
          imported photo files are stored in our cloud storage (Amazon S3) and
          referenced in our database so they appear in your account gallery. For
          guests, imported photos are stored locally in your browser on that
          device.
        </p>
        <p>
          <strong>How we share Google user data:</strong> we do not sell Google
          user data. We do not share Google user data with third parties for
          advertising, data brokerage, or unrelated products. Service providers
          that help us operate the Service (such as hosting, database, and cloud
          storage providers) may process stored photo files only to provide
          those infrastructure services to us, under our instructions.
        </p>

        <h2>Google API Services User Data Policy / Limited Use</h2>
        <p>
          Travel Tracker’s use and transfer to any other app of information
          received from Google APIs will adhere to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>In particular, Google user data obtained through Google APIs is:</p>
        <ul>
          <li>
            Used only to provide or improve user-facing features that are
            prominent in Travel Tracker (importing selected photos into your
            country galleries)
          </li>
          <li>Not sold to third parties</li>
          <li>
            Not used for serving advertisements, including personalized or
            retargeted ads
          </li>
          <li>
            Not used to determine credit-worthiness or for lending purposes
          </li>
          <li>
            Not used to train, improve, or develop generalized / non-personalized
            artificial intelligence or machine learning models
          </li>
          <li>
            Not transferred to other apps, sites, or services except as necessary
            to operate Travel Tracker for you (for example, storing your imported
            photos in our cloud storage) or as required by law
          </li>
        </ul>

        <h2>How we use other information</h2>
        <ul>
          <li>To provide and maintain your map, account, and photo galleries</li>
          <li>
            To authenticate you and keep your data associated with your account
          </li>
          <li>
            To enable optional features such as phone QR upload and Google import
          </li>
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

        <h2>Data retention and deletion</h2>
        <p>
          We retain account data and uploaded photos while your account remains
          active. You may delete individual photos in the app. If you want your
          account and associated data deleted, contact us at the email below and
          we will delete your account data and stored photos associated with
          that account. Guest data remains on your device until you clear it.
        </p>
        <p>
          You can revoke Travel Tracker’s access to your Google Account at any
          time through your Google Account permissions. Revoking access stops
          future Google imports; photos already imported into Travel Tracker
          remain in your Travel Tracker gallery until you delete them or request
          account deletion.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>Use the app as a guest without creating an account</li>
          <li>Choose whether to import from Google Drive or Google Photos</li>
          <li>
            Revoke Google access anytime in your{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              Google Account permissions
            </a>
          </li>
          <li>Delete photos from a country gallery in the app</li>
          <li>Request account and data deletion by emailing us</li>
        </ul>

        <h2>Security</h2>
        <p>
          We take reasonable measures to protect account and photo data,
          including using encrypted connections (HTTPS) in production and
          restricting access to production systems and credentials. No method of
          transmission or storage is completely secure, and we cannot guarantee
          absolute security.
        </p>

        <h2>Children</h2>
        <p>
          Travel Tracker is not directed to children under 13, and we do not
          knowingly collect personal information from children under 13.
        </p>

        <h2>Changes to this Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. The “Last updated”
          date at the top will change when we do. If we change how we use Google
          user data in a material way, we will update this Privacy Policy and,
          where required, ask you to review and consent before using Google user
          data for that new purpose.
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
