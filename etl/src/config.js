// Settings come from Script Properties (Project settings > Script properties), never from code.
//   NEON_PASSWORD           password of the etl_ingest role (any characters; encoded here)
//   NEON_CONNECTION_STRING  alternative to NEON_PASSWORD: a full postgresql:// URL with the
//                           password already URL-encoded. NEON_PASSWORD wins if both are set.
//   ALERT_SENDERS           comma-separated sender addresses of the bank alert emails
//   GMAIL_LABEL             optional Gmail label to search in, e.g. Banks
//   BACKFILL_DAYS           how far back the first run looks (default 30)
//
// Progress is kept in the script property LAST_RUN_AT (set by the script). Gmail
// groups these alerts into long threads and labels apply to whole threads, so
// the script tracks a time cursor instead of labelling emails; the database
// ignores emails it has already seen.

// Public endpoint details (not secret); only the password lives in Script Properties.
const NEON_HOST = 'ep-billowing-hall-b295ail3.c-6.eu-central-1.aws.neon.tech';
const NEON_USER = 'etl_ingest';
const NEON_DATABASE = 'neondb';

const OVERLAP_HOURS = 24; // re-read the last day on every run, in case an email arrived late
const MAX_THREADS_PER_RUN = 200;

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const password = props.getProperty('NEON_PASSWORD');
  const connectionString = password
    ? `postgresql://${NEON_USER}:${encodeURIComponent(password.trim())}@${NEON_HOST}/${NEON_DATABASE}?sslmode=require`
    : (props.getProperty('NEON_CONNECTION_STRING') || '').trim();
  const senders = (props.getProperty('ALERT_SENDERS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!connectionString) throw new Error('Set the script property NEON_PASSWORD (or NEON_CONNECTION_STRING)');
  if (!senders.length) throw new Error('Script property ALERT_SENDERS is not set');
  return {
    connectionString,
    senders,
    label: (props.getProperty('GMAIL_LABEL') || '').trim(),
    backfillDays: Number(props.getProperty('BACKFILL_DAYS')) || 30,
    lastRunAt: props.getProperty('LAST_RUN_AT'),
  };
}
