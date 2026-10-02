// Settings come from Script Properties (Project settings > Script properties), never from code.
//   NEON_CONNECTION_STRING  postgresql://etl_ingest:<password>@<endpoint-host>/neondb?sslmode=require
//   ALERT_SENDERS           comma-separated sender addresses of the bank alert emails
//   GMAIL_LABEL             optional Gmail label to search in, e.g. Banks
//   BACKFILL_DAYS           how far back the first run looks (default 30)
//
// Progress is kept in the script property LAST_RUN_AT (set by the script). Gmail
// groups these alerts into long threads and labels apply to whole threads, so
// the script tracks a time cursor instead of labelling emails; the database
// ignores emails it has already seen.

const OVERLAP_HOURS = 24; // re-read the last day on every run, in case an email arrived late
const MAX_THREADS_PER_RUN = 200;

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const connectionString = props.getProperty('NEON_CONNECTION_STRING');
  const senders = (props.getProperty('ALERT_SENDERS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!connectionString) throw new Error('Script property NEON_CONNECTION_STRING is not set');
  if (!senders.length) throw new Error('Script property ALERT_SENDERS is not set');
  return {
    connectionString,
    senders,
    label: (props.getProperty('GMAIL_LABEL') || '').trim(),
    backfillDays: Number(props.getProperty('BACKFILL_DAYS')) || 30,
    lastRunAt: props.getProperty('LAST_RUN_AT'),
  };
}
