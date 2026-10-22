const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../cipher-core.js');
const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');

test('Caesar known vector, all 26 shifts, wraparound, case and Unicode preservation', () => {
  assert.equal(C.caesar('Meet me at the library at noon.', 7), 'Tlla tl ha aol spiyhyf ha uvvu.');
  assert.equal(C.caesar('XYZ xyz', 3), 'ABC abc');
  const message = 'Az, meet at 09:30! Caffè ☕ — Καλημέρα';
  for (let key = 0; key < 26; key++) assert.equal(C.caesar(C.caesar(message, key), -key), message);
  assert.equal(C.caesar('', 7), '');
  assert.throws(() => C.caesar('A', 0.5));
});

test('secp256k1 arithmetic agrees with native OpenSSL public-key calculations', () => {
  assert.equal(C.multiply(0n), null);
  assert.equal(C.multiply(C.N), null);
  assert.equal(C.add(C.G, [C.G[0], C.P - C.G[1]]), null);
  for (const d of [1n, 2n, 1337n, 4096n, C.N - 1n]) {
    const native = crypto.createECDH('secp256k1');
    native.setPrivateKey(Buffer.from(d.toString(16).padStart(64, '0'), 'hex'));
    assert.equal(C.hex(C.encodePoint(C.multiply(d))), native.getPublicKey('hex', 'uncompressed'));
  }
  assert.throws(() => C.validatePoint(null));
  assert.throws(() => C.validatePoint([0n, 0n]));
  assert.throws(() => C.validatePoint([C.G[0] + C.P, C.G[1]]));
});

test('hybrid encryption round trips Unicode, randomises packets and rejects tampering', async () => {
  const d = 1337n, Q = C.multiply(d), message = 'Meet me at noon. Caffè ☕\nSecond line: 42.';
  const first = await C.encrypt(message, Q), second = await C.encrypt(message, Q);
  assert.equal(await C.decrypt(first, d), message);
  assert.equal(first.ciphertext.length, Buffer.byteLength(message) + 16);
  assert.notDeepEqual(first.R, second.R);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
  await assert.rejects(() => C.decrypt(first, 1338n));
  const modified = {...first, ciphertext: first.ciphertext.slice()};
  modified.ciphertext[0] ^= 1;
  await assert.rejects(() => C.decrypt(modified, d));
  await assert.rejects(() => C.decrypt({...first, R: [0n, 0n]}, d));
  await assert.rejects(() => C.decrypt({...first, R: C.multiply(2n)}, d));
  const badIv = first.iv.slice(); badIv[0] ^= 1;
  await assert.rejects(() => C.decrypt({...first, iv: badIv}, d));
  const empty = await C.encrypt('', Q);
  assert.equal(await C.decrypt(empty, d), '');
});

test('bounded public-key search recovers edge keys and decrypts without private-key input', async () => {
  for (const d of [1n, 1337n, 4096n]) {
    const Q = C.multiply(d), result = await C.recoverPrivate(Q);
    assert.equal(result.key, d);
    assert.equal(result.candidates, Number(d));
  }
  const Q = C.multiply(25n), packet = await C.encrypt('An unknown message.', Q);
  const recovered = await C.recoverPrivate(Q);
  assert.equal(await C.decrypt(packet, recovered.key), 'An unknown message.');
  assert.equal(await C.recoverPrivate(C.multiply(17n), 16), null);
});

test('statistical recovery handles all shifts and rejects text without Latin letters', () => {
  const model = C.train(read('data/training-english.txt'));
  const passage = read('data/test-english.txt').slice(0, 700);
  for (let key = 0; key < 26; key++) {
    const cipher = C.caesar(passage, key);
    assert.equal(C.rank(cipher, model)[0].key, key);
    assert.equal(C.rank(cipher, model, 'bigram')[0].key, key);
  }
  assert.throws(() => C.rank('123 ☕', model), /at least one letter/);
  assert.equal(C.rank('X', model, 'bigram')[0].key, 0); // Explicit deterministic tie rule.
  const original = C.counts(passage).sort((a, b) => a - b);
  assert.deepEqual(C.counts(C.caesar(passage, 7)).sort((a, b) => a - b), original);
});

test('recorded results, browser data and static HTML reproduce the bundled corpora', () => {
  const model = C.train(read('data/training-english.txt'));
  const testing = C.letters(read('data/test-english.txt'));
  const results = C.experiment(testing, model);
  const recorded = JSON.parse(read('data/results.json'));
  assert.deepEqual(results, recorded.results);
  assert.equal(model.size, recorded.trainingLetters);
  assert.equal(testing.length, recorded.testLetters);
  const context = {window: {}};
  vm.runInNewContext(read('experiment-data.js'), context);
  assert.equal(JSON.stringify(context.window.ExperimentData), JSON.stringify({model, testLetters: testing, results}));
  const html = read('homework-2-ciphers.html');
  for (const r of results) assert.ok(html.includes(`<tr><th scope="row">${r.length}</th><td>${r.peak} / 100</td><td>${r.chi} / 100</td><td>${r.bigram} / 100</td></tr>`));
});
