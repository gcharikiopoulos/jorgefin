// Invented emails that mirror the layout of Alpha Bank alerts. No real data.

const accountAlert = (date, time, type, amount, side) => `| |
| [](http://www.alpha.gr/) |

| | |
| Σας ενημερώνουμε ότι την ${date} και ώρα ${time}, πραγματοποιήθηκε η κάτωθι κίνηση στον λογαριασμό σας ***123 |

| * Ειδος κίνησης: ${type} * Ποσό: ${amount} EUR ${side} |
| Μετά την κίνηση αυτή, το υπόλοιπο του λογαριασμού σας διαμορφώθηκε ως ακολούθως: |

| * Διαθέσιμο 1.000,00 EUR * Λογιστικό 1.050,00 EUR Πιστωτικό |
| Με εκτίμηση, |
| Alpha Bank |`;

const cardPurchase = (date, time, currency, amount, merchant) => ` Alpha Alerts

| |
| | Αγαπητέ πελάτη, Θα θέλαμε να σας ενημερώσουμε ότι πραγματοποιήθηκε συναλλαγή με τη κάρτα Gold Example Visa με αριθμό ************1111 στις ${date} ${time}, αξίας ${currency} ${amount} στην επιχείρηση ${merchant}. Με εκτίμηση, Alpha Bank | |
| | Παραλάβατε αυτό το μήνυμα επειδή έχετε ενεργοποιήσει την υπηρεσία ειδοποιήσεων Alpha alerts. | |`;

const standingOrder = (date, time, merchant, amount) => ` Alpha Alerts

| | Αγαπητέ πελάτη, Θα θέλαμε να σας ενημερώσουμε ότι πραγματοποιήθηκε πληρωμή πάγιας εντολής με την κάρτα Example Visa με αριθμό ***********2222 στις ${date} ${time}, ${merchant} αξίας EUR ${amount}. Mε εκτίμηση, Alpha Bank | |`;

const ACCOUNT_FROM = 'Alpha Bank <alerts@alpha.gr>';
const CARD_FROM = 'ebanking@alpha.gr';

module.exports = {
  purchase: { id: 'msg-a1', from: ACCOUNT_FROM, subject: 'Alpha Bank – Υπηρεσία Alpha Alerts. ΛΟΓΑΡΙΑΣΜΟΣ ***123', date: '2026-01-05T08:30:10Z', body: accountAlert('05/01/2026', '10:30', 'ΧΡΕΩΣΤ.ΚΑΡΤΑ-ΑΓΟΡΑ', '4,50', 'Χρέωση') },
  refund: { id: 'msg-a2', from: ACCOUNT_FROM, subject: 'x', date: '2026-01-06T09:00:00Z', body: accountAlert('06/01/2026', '11:00', 'ΧΡΕΩΣΤ.ΚΑΡΤΑ-ΑΚΥΡΩΣΗ', '12,00', 'Πίστωση') },
  atm: { id: 'msg-a3', from: ACCOUNT_FROM, subject: 'x', date: '2026-01-07T09:00:00Z', body: accountAlert('07/01/2026', '11:05', 'ΚΙΝΗΣΗ ΑΤΜ', '100,00', 'Χρέωση') },
  incoming: { id: 'msg-a4', from: ACCOUNT_FROM, subject: 'x', date: '2026-01-08T09:00:00Z', body: accountAlert('08/01/2026', '12:15', 'ΔΙΑΦΟΡΕΣ ΕΙΣΠΡΑΞΕΙΣ', '1.234,56', 'Πίστωση') },
  insurance: { id: 'msg-a5', from: ACCOUNT_FROM, subject: 'x', date: '2026-01-09T09:00:00Z', body: accountAlert('09/01/2026', '13:00', 'ΑΣΦΑΛΙΣΤΡΑ', '80,10', 'Χρέωση') },
  cardPurchase: { id: 'msg-c1', from: CARD_FROM, subject: 'Alpha Alerts', date: '2026-01-05T08:30:00Z', body: cardPurchase('05/01/2026', '10:30', 'EUR', '4,50', 'CORNER BAKERY Greece') },
  cardForeign: { id: 'msg-c2', from: CARD_FROM, subject: 'Alpha Alerts', date: '2026-01-10T08:30:00Z', body: cardPurchase('10/01/2026', '10:30', 'USD', '9,99', 'EXAMPLE APP STORE United States') },
  standingOrder: { id: 'msg-c3', from: CARD_FROM, subject: 'Alpha Alerts', date: '2026-01-11T07:00:00Z', body: standingOrder('11/01/2026', '09:00', 'Example Charity United States', '5,00') },
  unrelated: { id: 'msg-x', from: 'alerts@alpha.gr', subject: 'News', date: '2026-01-12T07:00:00Z', body: 'Νέα προϊόντα από την Alpha Bank.' },
};
