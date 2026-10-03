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
    .replace(/&euro;/gi, '€')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

// The text a parser should read: the HTML converted here when present, else the plain body.
function emailText_(email) {
  return normalizeText(flatten_(email.html ? htmlToText_(email.html) : email.body));
}

// ---- Senders ------------------------------------------------------------------
// Banks are recognised by the domain of the sender's address, not by the exact
// address, so a bank moving its alerts to another mailbox (or adding one) keeps
// working. Any subdomain counts: alerts.alpha.gr, mail.nbg.gr...
const BANK_DOMAINS = ['alpha.gr', 'piraeusbank.gr', 'nbg.gr'];

// The address part of a From header: "Name <a@b.gr>" -> "a@b.gr".
function senderAddress_(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function fromDomain_(from, domain) {
  const address = senderAddress_(from);
  const at = address.lastIndexOf('@');
  if (at < 0) return false;
  const host = address.slice(at + 1);
  return host === domain || host.endsWith('.' + domain);
}

function isBankSender(from) {
  return BANK_DOMAINS.some((d) => fromDomain_(from, d));
}

// ---- Alpha Bank parsers ---------------------------------------------------------
// Each returns null for emails it does not recognise, so unknown formats are
// reported for review, never guessed.

// Account alert from Alpha (alerts@alpha.gr):
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
  if (!fromDomain_(email.from, 'alpha.gr')) return null;
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

// Card alert from Alpha (ebanking@alpha.gr), two layouts:
//   "...συναλλαγή με τη κάρτα <CARD> με αριθμό ****NNNN στις DD/MM/YYYY HH:MM, αξίας EUR 3,98
//    στην επιχείρηση <MERCHANT>. Με εκτίμηση"
//   "...πληρωμή πάγιας εντολής με την κάρτα <CARD> με αριθμό ****NNNN στις DD/MM/YYYY HH:MM,
//    <MERCHANT> αξίας EUR 2,00. Mε εκτίμηση"
// Stray '*' around values (bold text in Gmail's plain-text version) are tolerated.
const CARD_ALERT_RE = /ΜΕ ΑΡΙΘΜΟ\s*(\*+\d+)\**\s*ΣΤΙΣ\s*\**(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\**\s*,\s*\**(.*?)\**\s*ΑΞΙΑΣ\s*\**([A-Z]{3})\s*([\d.,]+)\**(?:\s*ΣΤΗΝ ΕΠΙΧΕΙΡΗΣΗ\s*\**(.+?)\**)?\s*\.\s*[MΜ][EΕ] ΕΚΤΙΜΗΣΗ/;

function parseCardAlert(email) {
  if (!fromDomain_(email.from, 'alpha.gr')) return null;
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

// ---- Piraeus Bank -----------------------------------------------------------------
// Balance-change alert from IBankV2Email@piraeusbank.gr ("Υπηρεσία Piraeus Alerts"),
// a table of labelled fields:
//   Λογαριασμός: 1234-***-567 | Ποσό Συναλλαγής: -450 EUR (ΧΡ) | Τύπος Συναλλαγής: <TYPE>
//   Ημερομηνία Εκτέλεσης: DD/MM/YY HH:MM | Ημερομηνία Αξίας: DD/MM/YYYY
//   Λογιστικό Υπόλοιπο: 1234.56 EUR | Διαθέσιμο Υπόλοιπο: … | Αιτιολογία 1: … | Αιτιολογία 2: …
// (ΧΡ) is a debit, (ΠΙ) a credit. The two "Αιτιολογία" lines carry the merchant, the
// payer or the payee and a note; card numbers, account numbers and references in
// them are dropped from the description.
const PIRAEUS_LABELS = ['ΛΟΓΑΡΙΑΣΜΟΣ', 'ΠΟΣΟ ΣΥΝΑΛΛΑΓΗΣ', 'ΤΥΠΟΣ ΣΥΝΑΛΛΑΓΗΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΕΚΤΕΛΕΣΗΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΑΞΙΑΣ',
  'ΛΟΓΙΣΤΙΚΟ ΥΠΟΛΟΙΠΟ', 'ΔΙΑΘΕΣΙΜΟ ΥΠΟΛΟΙΠΟ', 'ΑΙΤΙΟΛΟΓΙΑ 1', 'ΑΙΤΙΟΛΟΓΙΑ 2'];
const PIRAEUS_END = /\S+@\S+|EMAIL ΕΠΙΚΟΙΝΩΝΙΑΣ|COPYRIGHT/;

// Text of each "LABEL:" field, up to the next known label (or the footer).
function labelledFields_(text, labels, end) {
  const found = [];
  for (const label of labels) {
    const i = text.indexOf(label + ':');
    if (i !== -1) found.push({ label, start: i, from: i + label.length + 1 });
  }
  found.sort((a, b) => a.start - b.start);
  const out = {};
  found.forEach((f, k) => {
    let value = text.slice(f.from, k + 1 < found.length ? found[k + 1].start : undefined);
    const stop = value.search(end);
    if (stop !== -1) value = value.slice(0, stop);
    out[f.label] = value.trim();
  });
  return out;
}

const PIRAEUS_TXN_TYPES = [
  [/ΕΠΙΣΤΡΟΦΗ|ΑΚΥΡΩΣΗ/, 'card_refund'],
  [/ΑΓΟΡΑ/, 'card_purchase'],
  [/ATM|ΑΤΜ|ΑΝΑΛΗΨΗ/, 'atm_withdrawal'],
  [/ΠΡΟΜΗΘΕΙΑ|ΕΞΟΔΑ|ΣΥΝΔΡΟΜΗ/, 'fee'],
  [/ΠΛΗΡΩΜΗ|ΠΑΓΙΑ/, 'payment'],
  [/ΜΕΤΑΦΟΡΑ|ΕΜΒΑΣΜΑ|ΕΝΤΟΛΗ/, 'transfer'],
];

// A reason line that is only a reference: card or account numbers, codes, amounts.
const isReference_ = (s) => !s || /X{4}/.test(s) || /\d{8,}/.test(s.replace(/\s/g, '')) || /^[\d\s.,/-]+$/.test(s) || /^\d+[.,]\d{2}\s*EUR/.test(s);

function parsePiraeusAlert(email) {
  if (!fromDomain_(email.from, 'piraeusbank.gr')) return null;
  const text = emailText_(email);
  if (!text.includes('ΜΕΤΑΒΟΛΗ ΣΤΟ ΥΠΟΛΟΙΠΟ')) return null;
  const f = labelledFields_(text, PIRAEUS_LABELS, PIRAEUS_END);
  const amount = (f['ΠΟΣΟ ΣΥΝΑΛΛΑΓΗΣ'] || '').match(/(-?)\s*([\d.,]+)\s*([A-Z]{3})?\s*\((ΧΡ|ΠΙ)\)/);
  const when = (f['ΗΜΕΡΟΜΗΝΙΑ ΕΚΤΕΛΕΣΗΣ'] || '').match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(\d{1,2}:\d{2})?/);
  const type = (f['ΤΥΠΟΣ ΣΥΝΑΛΛΑΓΗΣ'] || '').trim();
  if (!amount || !when || !type || !f['ΛΟΓΑΡΙΑΣΜΟΣ']) return null;
  const reasons = [f['ΑΙΤΙΟΛΟΓΙΑ 1'], f['ΑΙΤΙΟΛΟΓΙΑ 2']].map((s) => (s || '').trim()).filter((s) => !isReference_(s));
  const found = PIRAEUS_TXN_TYPES.find(([re]) => re.test(type));
  const txnType = found ? found[1] : 'other';
  // Card payments read best as the merchant alone; everything else keeps its type first.
  const description = (txnType === 'card_purchase' && reasons.length ? reasons[0] : [type, ...reasons].join(' ')).replace(/\s+/g, ' ').trim();
  const balance = (f['ΛΟΓΙΣΤΙΚΟ ΥΠΟΛΟΙΠΟ'] || '').match(/(-?)\s*([\d.,]+)/);
  const txn = {
    account_mask: f['ΛΟΓΑΡΙΑΣΜΟΣ'].split(' ')[0],
    txn_date: parseDate(when[1]),
    txn_time: parseTime(when[2]),
    amount: parseAmount(amount[2]),
    currency: amount[3] || 'EUR',
    direction: amount[4] === 'ΧΡ' ? 'debit' : 'credit',
    txn_type: txnType,
    description,
    balance: balance && parseAmount(balance[2]) ? (balance[1] ? '-' : '') + parseAmount(balance[2]) : undefined,
  };
  return txn.txn_date && txn.amount ? [txn] : null;
}

// ---- National Bank of Greece ---------------------------------------------------------
// "Alerts" from Nbg.donotreply@nbg.gr, one sentence each:
//   "Σας ενημερώνουμε για την μεταφορά ποσού 25.00 € στο λογαριασμό *1234 DD/MM/YYYY HH:MM:SS."      money in
//   "Σας ενημερώνουμε για μεταφορά ποσού 3000.00 € από τον λογαριασμό *1234 DD/MM/YYYY HH:MM:SS."   money out
//   "Σας ενημερώνουμε για πίστωση εντολής ποσού 15.00 € στο λογαριασμό *1234 …"                     money in
//   "Σας ενημερώνουμε για αγορά ποσού 38,90 € από ΑΓΟΡΑ <MERCHANT> με χρεωστική κάρτα μέσω του λογαριασμού *1234 …"
// No balance and no counterparty for transfers. Only accounts set up in the
// database are accepted, so alerts for any other account are rejected there.
const NBG_ALERT_RE = /ΣΑΣ ΕΝΗΜΕΡΩΝΟΥΜΕ ΓΙΑ (?:ΤΗΝ )?(.+?) ΠΟΣΟΥ ([\d.,]+) ?(?:€|EUR) (.*?)ΛΟΓΑΡΙΑΣΜΟΥ? (\*+\d+) (\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}:\d{2})/;

function parseNbgAlert(email) {
  if (!fromDomain_(email.from, 'nbg.gr')) return null;
  const m = emailText_(email).match(NBG_ALERT_RE);
  if (!m) return null;
  const [, kind, amount, middle, mask, date, time] = m;
  let direction, txnType, description;
  const merchant = middle.match(/ΑΠΟ (?:ΑΓΟΡΑ )?(.+?) ΜΕ (?:ΧΡΕΩΣΤΙΚΗ|ΠΙΣΤΩΤΙΚΗ|ΠΡΟΠΛΗΡΩΜΕΝΗ) ΚΑΡΤΑ/);
  if (/^ΑΓΟΡΑ/.test(kind) && merchant) {
    [direction, txnType, description] = ['debit', 'card_purchase', merchant[1]];
  } else if (/^ΕΠΙΣΤΡΟΦΗ/.test(kind) && merchant) {
    [direction, txnType, description] = ['credit', 'card_refund', merchant[1]];
  } else if (/ΑΝΑΛΗΨΗ/.test(kind)) {
    [direction, txnType, description] = ['debit', 'atm_withdrawal', kind];
  } else if (/^ΑΠΟ ΤΟΝ /.test(middle)) {
    [direction, txnType, description] = ['debit', 'transfer', `${kind} ΑΠΟ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ`];
  } else if (/^ΣΤΟΝ? /.test(middle) || /ΠΙΣΤΩΣΗ/.test(kind)) {
    [direction, txnType, description] = ['credit', 'transfer', /ΠΙΣΤΩΣΗ/.test(kind) ? kind : `${kind} ΣΤΟ ΛΟΓΑΡΙΑΣΜΟ`];
  } else {
    return null; // a sentence we do not know: reported, never guessed
  }
  const txn = {
    account_mask: mask,
    txn_date: parseDate(date),
    txn_time: parseTime(time),
    amount: parseAmount(amount),
    currency: 'EUR',
    direction,
    txn_type: txnType,
    description: description.trim(),
  };
  return txn.txn_date && txn.amount ? [txn] : null;
}

// Emails from the banks that are known not to be transactions (they would
// otherwise be reported as unrecognised on every run). Piraeus confirms each transfer
// you make in a second email; its balance alert already has the transaction.
const IGNORED = [
  (e) => fromDomain_(e.from, 'piraeusbank.gr') && /ΕΓΧΡΗΜΑΤΗΣ ΣΥΝΑΛΛΑΓΗΣ/.test(normalizeText(e.subject)),
];

// alert_type is the transaction source in the database: every bank's account
// alerts are 'account_alert'; the bank comes from the sender address.
const PARSERS = [
  { type: 'card_alert', parse: parseCardAlert },
  { type: 'account_alert', parse: parseAccountAlert },
  { type: 'account_alert', parse: parsePiraeusAlert },
  { type: 'account_alert', parse: parseNbgAlert },
];

// Returns { type, transactions } for a recognised email ({ type: 'ignored',
// transactions: [] } for a known non-transaction email), or null.
function parseEmail(email) {
  if (IGNORED.some((test) => test(email))) return { type: 'ignored', transactions: [] };
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
  module.exports = { BANK_DOMAINS, isBankSender, parseAmount, parseDate, parseTime, normalizeText, flatten_, htmlToText_, emailText_, parseEmail, parseAccountAlert, parseCardAlert, parsePiraeusAlert, parseNbgAlert };
}
