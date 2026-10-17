// Entry points. Run them from the Apps Script editor:
//   dryRun()          parse matching emails and log the result; writes nothing
//   run()             parse and send to Neon (what the trigger calls)
//   testConnection()  check the Neon credential
//   installTrigger()  run() every hour;  removeTriggers() to stop
//   resetCursor()     make the next run look back FIRST_RUN_DAYS again

function run() {
  return process_({ dryRun: false });
}

function dryRun() {
  return process_({ dryRun: true });
}

function testConnection() {
  const { connectionString } = getConfig();
  const rows = neonQuery(connectionString, 'select current_user as role, now() as at', []);
  Logger.log('Connected as %s at %s', rows[0].role, rows[0].at);
}

function installTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('run').timeBased().everyHours(1).create();
  Logger.log('Installed hourly trigger for run()');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'run')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

function process_({ dryRun }) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('Another run is in progress; skipping.');
    return;
  }
  try {
    const config = getConfig();
    const startedAt = new Date();
    const since = config.lastRunAt
      ? new Date(new Date(config.lastRunAt).getTime() - OVERLAP_HOURS * 3600e3)
      : new Date(startedAt.getTime() - FIRST_RUN_DAYS * 86400e3);
    // Bank mail, plus forwards of it: a forwarder's mail is only fetched when it
    // mentions a bank domain, and only forwards of bank emails are parsed (below).
    const direct = `from:(${BANK_DOMAINS.join(' OR ')})`;
    const forwarded = config.forwarders.length ? `(from:(${config.forwarders.join(' OR ')}) (${BANK_DOMAINS.join(' OR ')}))` : '';
    const query = [
      forwarded ? `(${direct} OR ${forwarded})` : direct,
      `after:${Math.floor(since.getTime() / 1000)}`,
    ].join(' ');

    const threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);
    const rows = [];
    const unrecognised = [];
    let messages = 0;
    let forwards = 0;
    let skippedForwards = 0;

    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        if (message.getDate() < since) continue;
        const email = toEmail_(message, config);
        if (email === 'skip-forward') {
          skippedForwards += 1; // a forwarder's own mail: neither parsed nor logged
          continue;
        }
        if (!email) continue;
        messages += 1;
        if (email.forwardedBy) forwards += 1;
        const result = parseEmail(email);
        if (result) rows.push(...result.transactions);
        else {
          unrecognised.push(`${email.date.toISOString()} ${email.subject}`);
          // Banks also send newsletters. One that mentions an amount may be an alert layout
          // the parsers miss (a parser bug): show its text in a dry run.
          if (dryRun && /EUR|€|ΠΟΣΟ/i.test(emailText_(email))) Logger.log('Unparsed alert text: %s', emailText_(email).slice(0, 600));
        }
      }
    }

    Logger.log('Query: %s', query);
    Logger.log('Emails: %s (forwarded: %s), transactions parsed: %s, not recognised: %s', messages, forwards, rows.length, unrecognised.length);
    if (skippedForwards) Logger.log('Skipped %s forwarded emails that are not bank alerts', skippedForwards);
    unrecognised.forEach((u) => Logger.log('Not recognised: %s', u));

    if (dryRun) {
      rows.forEach((r) => Logger.log('%s %s %s %s %s %s %s', r.alert_type, r.txn_date, r.txn_time || '', r.direction, r.amount, r.currency, r.description));
      return { messages, rows: rows.length, unrecognised: unrecognised.length };
    }

    const counts = rows.length ? ingestRows(config.connectionString, rows) : null;
    if (counts) Logger.log('Neon: %s', JSON.stringify(counts));
    if (threads.length >= MAX_THREADS_PER_RUN) {
      Logger.log('Hit the %s-thread limit; the cursor is not advanced, the next run continues.', MAX_THREADS_PER_RUN);
    } else {
      // Advance the cursor only after Neon accepted the batch, so a failed run is simply retried.
      PropertiesService.getScriptProperties().setProperty('LAST_RUN_AT', startedAt.toISOString());
    }
    return counts;
  } finally {
    lock.releaseLock();
  }
}

// The email to parse for a Gmail message: bank mail as is; a forwarder's copy of
// bank mail unwrapped to its original sender (so the parsers treat it as the bank's
// own); 'skip-forward' for anything else a forwarder sent; null for anyone else.
// Gmail's from: also matches display names, hence the address checks here.
function toEmail_(message, config) {
  const from = message.getFrom();
  const base = { id: message.getId(), subject: message.getSubject(), body: message.getPlainBody(), html: message.getBody(), date: message.getDate() };
  if (isBankSender(from)) return { ...base, from };
  const address = from.toLowerCase();
  if (!config.forwarders.some((f) => address.includes(f))) return null;
  const original = unwrapForwardedEmail(base);
  if (!original || !isBankSender(original.from)) return 'skip-forward';
  return { ...base, from: original.from, subject: original.subject || base.subject, forwardedBy: address };
}

// Clears the cursor so the next run looks back FIRST_RUN_DAYS again (already-loaded emails are skipped by the database).
function resetCursor() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_RUN_AT');
  Logger.log('Cursor cleared');
}
