// Entry points. Run them from the Apps Script editor:
//   dryRun()          parse matching emails and log the result; writes nothing, labels nothing
//   run()             parse, send to Neon, label the emails (what the trigger calls)
//   testConnection()  check the Neon credential
//   installTrigger()  run() every hour;  removeTriggers() to stop

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
    const query = `from:(${config.senders.join(' OR ')}) newer_than:${config.searchDays}d -label:${LABEL_INGESTED} -label:${LABEL_REVIEW}`;
    const threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);
    const parsed = [];
    const unparsed = [];
    let messages = 0;

    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        if (!config.senders.some((s) => message.getFrom().toLowerCase().includes(s.toLowerCase()))) continue;
        messages += 1;
        const email = { id: message.getId(), from: message.getFrom(), subject: message.getSubject(), body: message.getPlainBody(), date: message.getDate() };
        const result = parseEmail(email);
        if (result) parsed.push({ thread, result });
        else unparsed.push({ thread, subject: email.subject });
      }
    }

    const rows = parsed.flatMap((p) => p.result.transactions);
    Logger.log('Query: %s', query);
    Logger.log('Emails: %s, parsed: %s, not recognised: %s, transactions: %s', messages, parsed.length, unparsed.length, rows.length);

    if (dryRun) {
      rows.forEach((r) => Logger.log('%s %s %s %s %s %s', r.alert_type, r.txn_date, r.txn_time || '', r.direction, r.amount, r.description));
      unparsed.forEach((u) => Logger.log('Not recognised: %s', u.subject));
      return { messages, rows: rows.length, unparsed: unparsed.length };
    }

    const counts = rows.length ? ingestRows(config.connectionString, rows) : null;
    if (counts) Logger.log('Neon: %s', JSON.stringify(counts));

    // Label only after Neon accepted the batch, so a failed run is simply retried.
    const ingested = getOrCreateLabel_(LABEL_INGESTED);
    const review = getOrCreateLabel_(LABEL_REVIEW);
    new Set(parsed.map((p) => p.thread)).forEach((t) => t.addLabel(ingested));
    new Set(unparsed.map((u) => u.thread)).forEach((t) => t.addLabel(review));
    return counts;
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
