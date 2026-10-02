// Settings come from Script Properties (Project settings > Script properties), never from code.
//   NEON_CONNECTION_STRING  postgresql://etl_ingest:<password>@<endpoint-host>/neondb?sslmode=require
//   ALERT_SENDERS           comma-separated sender addresses of the bank alert emails
//   SEARCH_DAYS             how far back to look (default 14)

const LABEL_INGESTED = 'fin/ingested';
const LABEL_REVIEW = 'fin/needs-review';
const MAX_THREADS_PER_RUN = 100;

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const connectionString = props.getProperty('NEON_CONNECTION_STRING');
  const senders = (props.getProperty('ALERT_SENDERS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!connectionString) throw new Error('Script property NEON_CONNECTION_STRING is not set');
  if (!senders.length) throw new Error('Script property ALERT_SENDERS is not set');
  return {
    connectionString,
    senders,
    searchDays: Number(props.getProperty('SEARCH_DAYS')) || 14,
  };
}
