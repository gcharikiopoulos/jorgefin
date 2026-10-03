const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./fixtures.js');
const { parseEmail } = require('../src/parsers.js');

const one = (email) => {
  const result = parseEmail(email);
  assert.ok(result, 'expected the email to be recognised');
  assert.equal(result.transactions.length, 1);
  return result.transactions[0];
};

test('account alert: debit card purchase', () => {
  const t = one(f.purchase);
  assert.equal(t.alert_type, 'account_alert');
  assert.deepEqual(
    [t.account_mask, t.txn_date, t.txn_time, t.amount, t.currency, t.direction, t.txn_type, t.description],
    ['***123', '2026-01-05', '10:30', '4.50', 'EUR', 'debit', 'card_purchase', 'ΧΡΕΩΣΤ.ΚΑΡΤΑ-ΑΓΟΡΑ'],
  );
  assert.equal(t.message_id, 'msg-a1');
  assert.equal(t.line_no, '0');
});

test('account alert: refund, ATM, incoming transfer, insurance', () => {
  assert.deepEqual([one(f.refund).direction, one(f.refund).txn_type], ['credit', 'card_refund']);
  assert.deepEqual([one(f.atm).amount, one(f.atm).txn_type], ['100.00', 'atm_withdrawal']);
  assert.deepEqual([one(f.incoming).amount, one(f.incoming).direction, one(f.incoming).txn_type], ['1234.56', 'credit', 'other']);
  assert.deepEqual([one(f.insurance).txn_type, one(f.insurance).description], ['payment', 'ΑΣΦΑΛΙΣΤΡΑ']);
});

test('card alert: purchase with merchant', () => {
  const t = one(f.cardPurchase);
  assert.equal(t.alert_type, 'card_alert');
  assert.deepEqual(
    [t.account_mask, t.txn_date, t.txn_time, t.amount, t.currency, t.direction, t.txn_type, t.description],
    ['************1111', '2026-01-05', '10:30', '4.50', 'EUR', 'debit', 'card_purchase', 'CORNER BAKERY GREECE'],
  );
});

test('card alert: foreign currency keeps its currency', () => {
  const t = one(f.cardForeign);
  assert.deepEqual([t.currency, t.amount, t.description], ['USD', '9.99', 'EXAMPLE APP STORE UNITED STATES']);
});

test('card alert: standing order puts the merchant before the amount', () => {
  const t = one(f.standingOrder);
  assert.deepEqual([t.account_mask, t.amount, t.description, t.txn_time], ['***********2222', '5.00', 'EXAMPLE CHARITY UNITED STATES', '09:00']);
});

test('other emails from the bank are not recognised', () => {
  assert.equal(parseEmail(f.unrelated), null);
});

test('card alert: HTML-only email is read from its HTML', () => {
  const t = one(f.cardHtml);
  assert.deepEqual(
    [t.account_mask, t.txn_date, t.txn_time, t.amount, t.currency, t.direction, t.description],
    ['************1111', '2026-01-12', '08:46', '3.98', 'EUR', 'debit', 'EXAMPLE KIOSK GREECE'],
  );
});

test('card alert: asterisks from bold text are tolerated', () => {
  const t = one(f.cardStarred);
  assert.deepEqual(
    [t.account_mask.replace(/\*/g, ''), t.txn_date, t.txn_time, t.amount, t.currency, t.description],
    ['1111', '2026-01-12', '08:46', '3.98', 'EUR', 'EXAMPLE KIOSK GREECE'],
  );
});

test('account alert: order, fee, reversal and withdrawal types', () => {
  const type = (name) => one({ ...f.purchase, body: f.purchase.body.replace('ΧΡΕΩΣΤ.ΚΑΡΤΑ-ΑΓΟΡΑ', name) }).txn_type;
  assert.equal(type('ΠΡΟΙΟΝ ΕΝΤΟΛΗΣ'), 'transfer');
  assert.equal(type('ΕΚΔΟΣΗ ΕΝΤΟΛΗΣ'), 'transfer');
  assert.equal(type('ΕΞΟΔΑ ΕΝΤΟΛΗΣ'), 'payment');
  assert.equal(type('ΑΝΤΙΛΟΓΙΣΜΟΣ ΧΡΕΩΣΤ.ΚΑΡΤΑ-ΑΓΟΡΑ'), 'other');
  assert.equal(type('ΑΝΑΛΗΨΗ'), 'atm_withdrawal');
  assert.equal(type('ΜΕΤΑΦΟΡΑ ΣΕ ΛΟΓΑΡΙΑΣΜΟ'), 'transfer');
});

const row = (t) => [t.account_mask, t.txn_date, t.txn_time, t.direction, t.amount, t.txn_type, t.balance, t.description];

test('Piraeus: incoming rent keeps payer and note, and the balance', () => {
  const t = one(f.piraeus.rentIn);
  assert.equal(t.alert_type, 'account_alert');
  assert.deepEqual(row(t), ['1234-***-567', '2026-02-01', '09:45', 'credit', '700.00', 'transfer', '2100.50', 'ΕΙΣΕΡΧΟΜΕΝΟ ΕΜΒΑΣΜΑ B/O EXAMPLE TENANT ΕΝΟΙΚΙΟ ΦΕΒΡΟΥΑΡΙΟΥ']);
});

test('Piraeus: transfer out drops the account number from the description', () => {
  assert.deepEqual(row(one(f.piraeus.rentOut)), ['1234-***-567', '2026-02-01', '08:30', 'debit', '450.00', 'transfer', '1400.50', 'ΜΕΤΑΦΟΡΑ ΣΕ ΛΟΓ.ΤΡΙΤΟΥ EXAMPLE PERSON ΕΝΟΙΚΙΟ']);
});

test('Piraeus: card payment is the merchant alone; fee and ATM types', () => {
  assert.deepEqual([one(f.piraeus.card).txn_type, one(f.piraeus.card).description], ['card_purchase', 'EXAMPLE CINEMA ATHINA']);
  assert.deepEqual([one(f.piraeus.fee).txn_type, one(f.piraeus.fee).amount, one(f.piraeus.fee).description], ['fee', '0.50', 'ΠΡΟΜΗΘΕΙΑ ΕΜΒΑΣΜΑΤΟΣ']);
  const atm = one(f.piraeus.atm);
  assert.deepEqual([atm.txn_type, atm.amount, atm.description], ['atm_withdrawal', '1180.00', 'ΑΤΜ-ΑΝΑΛΗΨΗ ΜΕΤΡΗΤΩΝ EXAMPLE STREET 2']);
});

test('Piraeus: the transfer confirmation email is skipped, not reported', () => {
  assert.deepEqual(parseEmail(f.piraeus.confirmation), { type: 'ignored', transactions: [] });
});

test('NBG: money out, money in and a credited order', () => {
  assert.deepEqual(row(one(f.nbg.out)), ['*9999', '2026-02-05', '12:13', 'debit', '3000.00', 'transfer', undefined, 'ΜΕΤΑΦΟΡΑ ΑΠΟ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ']);
  assert.deepEqual(row(one(f.nbg.in)), ['*9999', '2026-02-06', '18:47', 'credit', '25.00', 'transfer', undefined, 'ΜΕΤΑΦΟΡΑ ΣΤΟ ΛΟΓΑΡΙΑΣΜΟ']);
  assert.deepEqual(row(one(f.nbg.order)).slice(3), ['credit', '15.00', 'transfer', undefined, 'ΠΙΣΤΩΣΗ ΕΝΤΟΛΗΣ']);
});

test('NBG: debit card purchase names the merchant', () => {
  assert.deepEqual(row(one(f.nbg.card)), ['*9999', '2026-02-08', '13:41', 'debit', '101.01', 'card_purchase', undefined, 'EXAMPLE FUEL']);
});

test('NBG: other notices are not recognised', () => {
  assert.equal(parseEmail(f.nbg.unknown), null);
});
