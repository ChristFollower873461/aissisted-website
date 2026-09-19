import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Keep quoted semicolons and trigger bodies together while applying the actual
// checked-in migrations to D1. No schema or application transaction is modeled.
function statements(sql) {
  const result = [];
  let buffer = '', word = '', quote = '', comment = '', words = [];
  let trigger = false, depth = 0;
  const finishWord = () => {
    if (!word) return;
    const token = word.toUpperCase();
    words.push(token);
    if (token === 'TRIGGER' && words[0] === 'CREATE') trigger = true;
    if (trigger && ['BEGIN', 'CASE'].includes(token)) depth++;
    if (trigger && token === 'END') depth--;
    word = '';
  };
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index], next = sql[index + 1];
    buffer += char;
    if (comment) {
      if (comment === 'line' && char === '\n') comment = '';
      else if (comment === 'block' && char === '*' && next === '/') {
        buffer += sql[++index]; comment = '';
      }
      continue;
    }
    if (quote) {
      if (char === quote && next === quote) buffer += sql[++index];
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '-' && next === '-') {
      finishWord(); buffer += sql[++index]; comment = 'line'; continue;
    }
    if (char === '/' && next === '*') {
      finishWord(); buffer += sql[++index]; comment = 'block'; continue;
    }
    if (["'", '"', '`', '['].includes(char)) {
      finishWord(); quote = char === '[' ? ']' : char; continue;
    }
    if (/[A-Za-z0-9_]/.test(char)) word += char;
    else finishWord();
    if (char === ';' && (!trigger || (depth === 0 && words.at(-1) === 'END'))) {
      result.push(buffer); buffer = ''; words = []; trigger = false; depth = 0;
    }
  }
  finishWord();
  assert.equal(words.length, 0, 'Migration contains an incomplete SQL statement');
  assert.equal(quote, '', 'Migration contains an unterminated quoted value');
  assert.notEqual(comment, 'block', 'Migration contains an unterminated comment');
  return result;
}

export async function migrateBookingD1(db) {
  const migrations = new URL('../../../migrations/', import.meta.url);
  const names = readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    const sql = readFileSync(new URL(name, migrations), 'utf8');
    await db.batch(statements(sql).map((statement) => db.prepare(statement)));
  }
  return names;
}
