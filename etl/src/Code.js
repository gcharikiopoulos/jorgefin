// Entry points. Run them from the Apps Script editor:
//   dryRun()          parse matching emails and log the result; writes nothing, labels nothing
//   run()             parse, send to Neon, label the emails (what the trigger calls)
//   testConnection()  check the Neon credential
//   installTrigger()  run() every hour;  removeTriggers() to stop
//   resetCursor()     make the next run look back BACKFILL_DAYS again

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
      : new Date(startedAt.getTime() - config.backfillDays * 86400e3);
    const query = [
      `from:(${config.senders.join(' OR ')})`,
      config.label ? `label:${quoteLabel_(config.label)}` : '',
      `after:${Math.floor(since.getTime() / 1000)}`,
    ].filter(Boolean).join(' ');

    const threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);
    const rows = [];
    const unrecognised = [];
    let messages = 0;

    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        if (message.getDate() < since) continue;
        if (!config.senders.some((s) => message.getFrom().toLowerCase().includes(s.toLowerCase()))) continue;
        messages += 1;
        const email = { id: message.getId(), from: message.getFrom(), subject: message.getSubject(), body: message.getPlainBody(), html: message.getBody(), date: message.getDate() };
        const result = parseEmail(email);
        if (result) rows.push(...result.transactions);
        else {
          unrecognised.push(`${email.date.toISOString()} ${email.subject}`);
          // A card alert that fails to parse is a parser bug: show its text in a dry run.
          if (dryRun && /ebanking@/i.test(email.from)) Logger.log('Unparsed card alert text: %s', emailText_(email).slice(0, 600));
        }
      }
    }

    Logger.log('Query: %s', query);
    Logger.log('Emails: %s, transactions parsed: %s, not recognised: %s', messages, rows.length, unrecognised.length);
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

// Gmail label search syntax: spaces and slashes become dashes.
function quoteLabel_(label) {
  return label.trim().replace(/[\s/]+/g, '-');
}

// Clears the cursor so the next run backfills BACKFILL_DAYS again (already-loaded emails are skipped by the database).
function resetCursor() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_RUN_AT');
  Logger.log('Cursor cleared');
}
