// Pure parsing helpers and per-alert-type parsers. No Apps Script globals here,
// so the same file runs under Node for the tests in etl/test.
//
// A parser takes { id, from, subject, body, date } (body = plain text) and returns
// an array of transactions in the shape fin_ingest_email_transactions() expects,
// or null when the email is not one it understands.

// '1.234,56' or '1,234.56' or '12,5' -> '1234.56'; null when no amount is found.
function parseAmount(text) {
  if (text == null) return null;
  const s = String(text).replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : '.';
  const [intPart, fracPart = ''] = decimalSep === ',' ? [s.slice(0, lastComma), s.slice(lastComma + 1)] : [s.slice(0, lastDot === -1 ? s.length : lastDot), lastDot === -1 ? '' : s.slice(lastDot + 1)];
  // A separator followed by exactly three digits and nothing else is a thousands separator.
  if (fracPart.length === 3 && (decimalSep === ',' ? lastDot === -1 : lastComma === -1) && !/[.,]/.test(intPart)) {
    return trimAmount_(intPart + fracPart);
  }
  return trimAmount_(intPart.replace(/[.,]/g, '') + (fracPart ? '.' + fracPart.slice(0, 2) : ''));
}

function trimAmount_(s) {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

// 'DD/MM/YYYY', 'DD-MM-YY', 'DD.MM.YYYY' -> 'YYYY-MM-DD'; null when invalid.
function parseDate(text) {
  const m = String(text || '').match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 'HH:MM' or 'HH:MM:SS' -> 'HH:MM'; null when absent.
function parseTime(text) {
  const m = String(text || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// Upper-case, strip Greek accents, collapse whitespace: makes keyword matching robust.
function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function snippet_(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

// Collapses an email body (plain text, often with table pipes and bullets) to one line.
function flatten_(body) {
  return String(body || '')
    .replace(/[|]/g, ' ')
    .replace(/(^|\s)\*(?=\s)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Alpha Bank parsers ---------------------------------------------------------
// Each returns null for emails it does not recognise, so unknown formats are
// reported for review, never guessed.

// Account alert from alerts@alpha.gr:
//   "Σας ενημερώνουμε ότι την DD/MM/YYYY και ώρα HH:MM, πραγματοποιήθηκε η κάτωθι κίνηση
//    στον λογαριασμό σας ***NNN * Ειδος κίνησης: <TYPE> * Ποσό: 1.234,56 EUR Χρέωση|Πίστωση"
const ACCOUNT_ALERT_RE = /ΤΗΝ (\d{1,2}\/\d{1,2}\/\d{4}) ΚΑΙ ΩΡΑ (\d{1,2}:\d{2}).*?ΛΟΓΑΡΙΑΣΜΟ ΣΑΣ (\*+\d+).*?ΕΙΔΟΣ ΚΙΝΗΣΗΣ:\s*(.+?)\s+ΠΟΣΟ:\s*([\d.,]+)\s*([A-Z]{3})\s+(ΧΡΕΩΣΗ|ΠΙΣΤΩΣΗ)/;

// Account alert type -> txn_type. Unknown types stay 'other'.
const ACCOUNT_TXN_TYPES = [
  [/ΚΑΡΤΑ-ΑΓΟΡΑ/, 'card_purchase'],
  [/ΚΑΡΤΑ-ΑΚΥΡΩΣΗ|ΚΑΡΤΑ-ΕΠΙΣΤΡΟΦΗ/, 'card_refund'],
  [/ΑΤΜ|ATM/, 'atm_withdrawal'],
  [/ΜΕΤΑΦΟΡΑ|ΕΜΒΑΣΜΑ/, 'transfer'],
  [/ΠΛΗΡΩΜ|ΑΣΦΑΛΙΣΤΡΑ|ΠΑΓΙΑ/, 'payment'],
];

function parseAccountAlert(email) {
  if (!/alerts@alpha\.gr/i.test(email.from || '')) return null;
  const m = normalizeText(flatten_(email.body)).match(ACCOUNT_ALERT_RE);
  if (!m) return null;
  const [, date, time, mask, type, amount, currency, side] = m;
  const typeText = type.trim();
  const found = ACCOUNT_TXN_TYPES.find(([re]) => re.test(typeText));
  const txn = {
    account_mask: mask,
    txn_date: parseDate(date),
    txn_time: parseTime(time),
    amount: parseAmount(amount),
    currency,
    direction: side === 'ΧΡΕΩΣΗ' ? 'debit' : 'credit',
    txn_type: found ? found[1] : 'other',
    description: typeText,
  };
  return txn.txn_date && txn.amount ? [txn] : null;
}

// Card alert from ebanking@alpha.gr, two layouts:
//   "...συναλλαγή με τη κάρτα <CARD> με αριθμό ****NNNN στις DD/MM/YYYY HH:MM, αξίας EUR 3,98
//    στην επιχείρηση <MERCHANT>. Με εκτίμηση"
//   "...πληρωμή πάγιας εντολής με την κάρτα <CARD> με αριθμό ****NNNN στις DD/MM/YYYY HH:MM,
//    <MERCHANT> αξίας EUR 2,00. Mε εκτίμηση"
const CARD_ALERT_RE = /ΜΕ ΑΡΙΘΜΟ (\*+\d+) ΣΤΙΣ (\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}:\d{2}),\s*(.*?)\s*ΑΞΙΑΣ ([A-Z]{3}) ([\d.,]+)(?:\s+ΣΤΗΝ ΕΠΙΧΕΙΡΗΣΗ (.+?))?\.\s*[MΜ][EΕ] ΕΚΤΙΜΗΣΗ/;

function parseCardAlert(email) {
  if (!/ebanking@alpha\.gr/i.test(email.from || '')) return null;
  const text = normalizeText(flatten_(email.body));
  const m = text.match(CARD_ALERT_RE);
  if (!m) return null;
  const [, mask, date, time, before, currency, amount, merchantAfter] = m;
  const merchant = (merchantAfter || before || '').trim();
  const refund = /ΕΠΙΣΤΡΟΦΗ|ΑΚΥΡΩΣΗ/.test(text.slice(0, m.index));
  const txn = {
    account_mask: mask,
    txn_date: parseDate(date),
    txn_time: parseTime(time),
    amount: parseAmount(amount),
    currency,
    direction: refund ? 'credit' : 'debit',
    txn_type: refund ? 'card_refund' : 'card_purchase',
    description: merchant,
  };
  return txn.txn_date && txn.amount && merchant ? [txn] : null;
}

const PARSERS = [
  { type: 'card_alert', parse: parseCardAlert },
  { type: 'account_alert', parse: parseAccountAlert },
];

// Returns { type, transactions } for a recognised email, or null.
function parseEmail(email) {
  for (const { type, parse } of PARSERS) {
    const txns = parse(email);
    if (txns && txns.length) {
      return {
        type,
        transactions: txns.map((t, i) => ({
          message_id: email.id,
          line_no: String(i),
          received_at: email.date ? new Date(email.date).toISOString() : '',
          sender: email.from || '',
          subject: email.subject || '',
          alert_type: type,
          snippet: snippet_(email.body),
          ...t,
        })),
      };
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = { parseAmount, parseDate, parseTime, normalizeText, flatten_, parseEmail, parseAccountAlert, parseCardAlert };
}
