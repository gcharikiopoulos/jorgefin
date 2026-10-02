const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, parseDate, parseTime, normalizeText, parseEmail } = require('../src/parsers.js');

test('parseAmount handles Greek and English formats', () => {
  assert.equal(parseAmount('1.234,56 €'), '1234.56');
  assert.equal(parseAmount('EUR 1,234.56'), '1234.56');
  assert.equal(parseAmount('12,5'), '12.50');
  assert.equal(parseAmount('7'), '7.00');
  assert.equal(parseAmount('1.000'), '1000.00');
  assert.equal(parseAmount('0,99'), '0.99');
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount(null), null);
});

test('parseDate returns ISO dates and rejects impossible ones', () => {
  assert.equal(parseDate('21/01/2021'), '2021-01-21');
  assert.equal(parseDate('1-2-21'), '2021-02-01');
  assert.equal(parseDate('on 05.12.2020 at'), '2020-12-05');
  assert.equal(parseDate('31/02/2021'), null);
  assert.equal(parseDate('no date'), null);
});

test('parseTime finds HH:MM', () => {
  assert.equal(parseTime('at 9:05:33'), '09:05');
  assert.equal(parseTime('23:59'), '23:59');
  assert.equal(parseTime('no time'), null);
});

test('normalizeText strips accents and collapses spaces', () => {
  assert.equal(normalizeText('  Χρέωση   κάρτας '), 'ΧΡΕΩΣΗ ΚΑΡΤΑΣ');
});

test('unrecognised emails are not guessed', () => {
  assert.equal(parseEmail({ id: 'x', from: 'someone@example.com', subject: 'Hello', body: 'Not an alert', date: new Date() }), null);
});
