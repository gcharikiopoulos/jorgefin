// Pure parsing helpers and per-alert-type parsers. No Apps Script globals here,
// so the same file runs under Node for the tests in etl/test.
//
// A parser takes { id, from, subject, body, html, date } (body = plain text, html =
// the HTML body when there is one) and returns
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

// HTML body -> plain text with spaces where tags were. Used instead of Gmail's own
// plain-text conversion, which wraps <strong> text in asterisks and so mangles
// masked card numbers and amounts.
function htmlToText_(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

// The text a parser should read: the HTML converted here when present, else the plain body.
function emailText_(email) {
  return normalizeText(flatten_(email.html ? htmlToText_(email.html) : email.body));
}

// ---- Alpha Bank parsers ---------------------------------------------------------
// Each returns null for emails it does not recognise, so unknown formats are
// reported for review, never guessed.

// Account alert from alerts@alpha.gr:
//   "Σας ενημερώνουμε ότι την DD/MM/YYYY και ώρα HH:MM, πραγματοποιήθηκε η κάτωθι κίνηση
//    στον λογαριασμό σας ***NNN * Ειδος κίνησης: <TYPE> * Ποσό: 1.234,56 EUR Χρέωση|Πίστωση"
const ACCOUNT_ALERT_RE = /ΤΗΝ (\d{1,2}\/\d{1,2}\/\d{4}) ΚΑΙ ΩΡΑ (\d{1,2}:\d{2}).*?ΛΟΓΑΡΙΑΣΜΟ ΣΑΣ (\*+\d+).*?ΕΙΔΟΣ ΚΙΝΗΣΗΣ:\s*(.+?)\s+ΠΟΣΟ:\s*([\d.,]+)\s*([A-Z]{3})\s+(ΧΡΕΩΣΗ|ΠΙΣΤΩΣΗ)/;

// Account alert type -> txn_type. Unknown types stay 'other'.
// Order matters: the first match wins.
const ACCOUNT_TXN_TYPES = [
  [/ΑΝΤΙΛΟΓΙΣΜ/, 'other'],
  [/ΚΑΡΤΑ-ΑΓΟΡΑ/, 'card_purchase'],
  [/ΚΑΡΤΑ-ΑΚΥΡΩΣΗ|ΚΑΡΤΑ-ΕΠΙΣΤΡΟΦΗ/, 'card_refund'],
  [/ΑΤΜ|ATM|ΑΝΑΛΗΨΗ/, 'atm_withdrawal'],
  [/ΕΞΟΔΑ|ΠΛΗΡΩΜ|ΑΣΦΑΛΙΣΤΡΑ|ΠΑΓΙΑ/, 'payment'],
  [/ΜΕΤΑΦΟΡΑ|ΕΜΒΑΣΜΑ|ΕΝΤΟΛ/, 'transfer'],
];

function parseAccountAlert(email) {
  if (!/alerts@alpha\.gr/i.test(email.from || '')) return null;
  // Account alerts parse reliably from Gmail's plain text, so they keep using it.
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
// Stray '*' around values (bold text in Gmail's plain-text version) are tolerated.
const CARD_ALERT_RE = /ΜΕ ΑΡΙΘΜΟ\s*(\*+\d+)\**\s*ΣΤΙΣ\s*\**(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\**\s*,\s*\**(.*?)\**\s*ΑΞΙΑΣ\s*\**([A-Z]{3})\s*([\d.,]+)\**(?:\s*ΣΤΗΝ ΕΠΙΧΕΙΡΗΣΗ\s*\**(.+?)\**)?\s*\.\s*[MΜ][EΕ] ΕΚΤΙΜΗΣΗ/;

function parseCardAlert(email) {
  if (!/ebanking@alpha\.gr/i.test(email.from || '')) return null;
  const text = emailText_(email);
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
          snippet: snippet_(email.body || htmlToText_(email.html)),
          ...t,
        })),
      };
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = { parseAmount, parseDate, parseTime, normalizeText, flatten_, htmlToText_, emailText_, parseEmail, parseAccountAlert, parseCardAlert };
}
