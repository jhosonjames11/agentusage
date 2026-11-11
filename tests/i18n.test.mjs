import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, translate, readLanguage } from '../src/i18n/messages.mjs';
import { exportCsv } from '../src/domain/usage.mjs';

test('Chinese and English have matching, non-empty translation keys', () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.zh).sort());
  for (const language of ['zh', 'en']) for (const value of Object.values(messages[language])) assert.equal(typeof value, 'string');
});

test('language preference restores valid choices and rejects corrupt values', () => {
  assert.equal(readLanguage({ getItem: () => 'en' }), 'en');
  assert.equal(readLanguage({ getItem: () => 'zh' }), 'zh');
  assert.equal(readLanguage({ getItem: () => 'unexpected' }), 'zh');
  assert.equal(readLanguage({ getItem: () => { throw new Error('blocked'); } }), 'zh');
  assert.equal(translate('en', 'refreshIn', { time: '19:59' }), 'Refresh in 19:59');
});

test('CSV headers and completeness labels follow the selected language', () => {
  const row = { date: '2026-11-11', freshInput: 1, cacheRead: 2, cacheWrite: 3, input: 6, output: 4, total: 10, hitRate: 1 / 3, cost: 0.1, partialCost: true };
  const english = exportCsv([row], 'en');
  assert.match(english, /"Period","Fresh input tokens"/);
  assert.match(english, /Known portion/);
  assert.doesNotMatch(english, /期间|费用|价格/);
  assert.match(exportCsv([row], 'zh'), /"期间"/);
});
