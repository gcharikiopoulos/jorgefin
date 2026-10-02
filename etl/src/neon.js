// Runs one parameterised SQL statement on Neon over HTTPS, the same way the
// @neondatabase/serverless driver does: POST https://api.<host-without-first-label>/sql
// with the connection string in the Neon-Connection-String header.

function neonEndpoint_(connectionString) {
  // The host follows the last '@' (an unencoded '@' in a password would otherwise confuse it).
  const match = connectionString.match(/^postgres(?:ql)?:\/\/.*@([^/:?@]+)(?::\d+)?\//);
  if (!match) throw new Error('The Neon connection string is not a postgresql://user:password@host/db URL');
  return 'https://' + match[1].replace(/^[^.]+\./, 'api.') + '/sql';
}

function neonQuery(connectionString, query, params) {
  const response = UrlFetchApp.fetch(neonEndpoint_(connectionString), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Neon-Connection-String': connectionString },
    payload: JSON.stringify({ query, params: params || [] }),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    throw new Error('Neon returned HTTP ' + status + ' with a non-JSON body');
  }
  if (status !== 200) {
    let hint = '';
    if (/invalid port|invalid connection string/i.test(body.message || '')) hint = ' (use NEON_PASSWORD instead, or URL-encode special characters in the password)';
    if (/password authentication failed/i.test(body.message || '')) hint = ' (check the etl_ingest password)';
    throw new Error('Neon error (HTTP ' + status + '): ' + (body.message || text.slice(0, 300)) + hint);
  }
  return body.rows || [];
}

// Sends parsed transactions in chunks of 200; returns the summed counts.
function ingestRows(connectionString, rows) {
  const total = { received: 0, new: 0, inserted: 0, duplicates: 0, rejected: 0, matched_by_rules: 0 };
  for (let i = 0; i < rows.length; i += 200) {
    const result = neonQuery(connectionString, 'select public.fin_ingest_email_transactions($1::jsonb) as result', [JSON.stringify(rows.slice(i, i + 200))]);
    const counts = result[0] && result[0].result;
    Object.keys(total).forEach((k) => { total[k] += Number(counts && counts[k]) || 0; });
  }
  return total;
}
