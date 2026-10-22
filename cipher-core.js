// Educational arithmetic and experiments. No dependencies; shared by browser and Node.
(function (root) {
  'use strict';
  const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const G = [
    0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
    0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
  ];
  const LIMIT = 4096;
  const mod = x => ((x % P) + P) % P;
  function inverse(x) {
    let a = mod(x), b = P, u = 1n, v = 0n;
    if (a === 0n) throw new Error('Cannot invert zero.');
    while (b) {
      const q = a / b;
      [a, b] = [b, a - q * b];
      [u, v] = [v, u - q * v];
    }
    return mod(u);
  }
  function add(A, B) {
    if (A === null) return B;
    if (B === null) return A;
    const [x, y] = A, [u, v] = B;
    if (x === u && mod(y + v) === 0n) return null;
    const slope = x === u ? mod(3n * x * x * inverse(2n * y)) : mod((v - y) * inverse(u - x));
    const nx = mod(slope * slope - x - u);
    return [nx, mod(slope * (x - nx) - y)];
  }
  function multiply(k, point = G) {
    if (typeof k !== 'bigint' || k < 0n) throw new Error('Scalar must be a nonnegative BigInt.');
    let result = null;
    while (k) {
      if (k & 1n) result = add(result, point);
      point = add(point, point);
      k >>= 1n;
    }
    return result;
  }
  function validatePoint(point) {
    if (!Array.isArray(point) || point.length !== 2 || point.some(x => typeof x !== 'bigint' || x < 0n || x >= P)
      || mod(point[1] * point[1] - point[0] ** 3n - 7n) !== 0n) {
      throw new Error('Expected a finite point on secp256k1.');
    }
    // The secp256k1 cofactor is 1: every finite curve point is in the prime-order group.
    return point;
  }
  function validateScalar(d) {
    if (typeof d !== 'bigint' || d < 1n || d >= N) throw new Error('Scalar is outside 1,…,n−1.');
  }
  const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  const fromHex = s => Uint8Array.from(s.match(/../g) || [], x => parseInt(x, 16));
  const encodePoint = point => fromHex('04' + validatePoint(point).map(x => x.toString(16).padStart(64, '0')).join(''));
  const concat = (...arrays) => {
    const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
  };
  function webCrypto() {
    if (!root.crypto?.subtle) throw new Error('Encryption needs a modern browser on HTTPS or localhost. See the README for local preview.');
    return root.crypto;
  }
  function randomScalar() {
    const c = webCrypto();
    let k;
    do { k = BigInt('0x' + hex(c.getRandomValues(new Uint8Array(32)))); } while (k === 0n || k >= N);
    return k;
  }
  async function deriveKey(S, R, Q) {
    const subtle = webCrypto().subtle;
    const context = concat(new TextEncoder().encode('statistics-homework-2/v1'), encodePoint(R), encodePoint(Q));
    const material = await subtle.importKey('raw', encodePoint(S), 'HKDF', false, ['deriveKey']);
    // A fixed, public zero salt is permitted by HKDF; fresh r provides new input key material.
    return subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: context},
      material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(message, Q) {
    validatePoint(Q);
    const r = randomScalar(), R = multiply(r), S = multiply(r, Q);
    const iv = webCrypto().getRandomValues(new Uint8Array(12));
    const key = await deriveKey(S, R, Q);
    const ciphertext = new Uint8Array(await webCrypto().subtle.encrypt(
      {name: 'AES-GCM', iv, additionalData: concat(encodePoint(R), encodePoint(Q)), tagLength: 128},
      key, new TextEncoder().encode(message)));
    return {R, iv, ciphertext}; // Includes the 16-byte GCM tag. Never transmit r, S or the AES key.
  }
  async function decrypt(packet, d) {
    validateScalar(d);
    const R = validatePoint(packet.R), Q = multiply(d), S = multiply(d, R);
    const key = await deriveKey(S, R, Q);
    const bytes = await webCrypto().subtle.decrypt(
      {name: 'AES-GCM', iv: packet.iv, additionalData: concat(encodePoint(R), encodePoint(Q)), tagLength: 128},
      key, packet.ciphertext);
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  }
  async function recoverPrivate(Q, bound = LIMIT, onProgress = () => {}) {
    validatePoint(Q);
    if (!Number.isInteger(bound) || bound < 1 || bound > LIMIT) throw new Error('Search bound must be 1–4096.');
    let candidate = null;
    for (let d = 1; d <= bound; d++) {
      candidate = add(candidate, G);
      if (candidate[0] === Q[0] && candidate[1] === Q[1]) return {key: BigInt(d), candidates: d};
      if (d % 128 === 0) {
        onProgress(d);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return null;
  }
  const letters = text => text.replace(/[^A-Za-z]/g, '').toUpperCase();
  function caesar(text, shift) {
    if (!Number.isInteger(shift)) throw new Error('Shift must be an integer.');
    shift = ((shift % 26) + 26) % 26;
    return text.replace(/[A-Za-z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(base + (ch.charCodeAt(0) - base + shift) % 26);
    });
  }
  function counts(text) {
    const out = Array(26).fill(0);
    for (const c of letters(text)) out[c.charCodeAt(0) - 65]++;
    return out;
  }
  function train(text) {
    const clean = letters(text), count = counts(clean), bigrams = Array(676).fill(0);
    if (clean.length < 1000) throw new Error('Training needs at least 1,000 letters.');
    for (let i = 1; i < clean.length; i++) bigrams[(clean.charCodeAt(i - 1) - 65) * 26 + clean.charCodeAt(i) - 65]++;
    return {size: clean.length, frequencies: count.map(c => (c + 1) / (clean.length + 26)),
      bigramLog: bigrams.map(c => Math.log((c + 1) / (clean.length - 1 + 676)))};
  }
  function rank(ciphertext, model, method = 'chi') {
    const clean = letters(ciphertext), count = counts(clean), length = clean.length;
    if (!length) throw new Error('Enter at least one letter A–Z to analyse.');
    if (!['chi', 'bigram'].includes(method)) throw new Error('Unknown scoring method.');
    return Array.from({length: 26}, (_, key) => {
      let score = 0;
      if (method === 'chi') {
        for (let j = 0; j < 26; j++) {
          const expected = length * model.frequencies[j];
          score += (count[(j + key) % 26] - expected) ** 2 / expected;
        }
      } else {
        for (let i = 1; i < length; i++) {
          const a = (clean.charCodeAt(i - 1) - 65 - key + 26) % 26;
          const b = (clean.charCodeAt(i) - 65 - key + 26) % 26;
          score -= model.bigramLog[a * 26 + b];
        }
      }
      return {key, score};
    }).sort((a, b) => a.score - b.score || a.key - b.key);
  }
  function peakGuess(ciphertext, model) {
    const observed = counts(ciphertext);
    return (observed.indexOf(Math.max(...observed)) - model.frequencies.indexOf(Math.max(...model.frequencies)) + 26) % 26;
  }
  function experiment(testText, model, trials = 100) {
    const clean = letters(testText);
    let seed = 20261022;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    return [5, 10, 20, 50, 100, 250, 500, 1000].map(length => {
      if (length > clean.length) throw new Error('Test corpus is too short.');
      let peak = 0, chi = 0, bigram = 0;
      for (let i = 0; i < trials; i++) {
        const start = Math.floor(random() * (clean.length - length + 1));
        const key = Math.floor(random() * 26), cipher = caesar(clean.slice(start, start + length), key);
        peak += Number(peakGuess(cipher, model) === key);
        chi += Number(rank(cipher, model, 'chi')[0].key === key);
        bigram += Number(rank(cipher, model, 'bigram')[0].key === key);
      }
      return {length, trials, peak, chi, bigram};
    });
  }
  const api = {P, N, G, LIMIT, add, multiply, validatePoint, hex, encodePoint, encrypt, decrypt,
    recoverPrivate, letters, caesar, counts, train, rank, peakGuess, experiment};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CipherLab = api;
})(globalThis);
