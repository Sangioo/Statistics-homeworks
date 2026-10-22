# Cryptography Homeworks

A small static website in English. The new **Homework 2: Encryption and cryptanalysis** follows the shared layout of the two earlier pages, which remain at their original URLs.

- `index.html` links to all three pages.
- `homework-1.html` is the earlier private-key/public-point exploration on y² = x³ + 7 (mod 17), using `script.js`.
- `homework-2.html` is the earlier mnemonic-to-Ethereum-address report. Its original filename is preserved.
- `homework-2-ciphers.html` is the new assignment: actual secp256k1 hybrid encryption, Caesar encryption, corpus-based key recovery, length experiments, and a bounded ECC private-key attack.
- `style.css` provides the common blue-and-white styling.

## Open the homework

Open `index.html` in a modern browser. No build step, package installation, CDN, or external corpus download is required. The new ECC demo needs Web Crypto in a secure context (HTTPS or localhost; local-file support varies by browser). If necessary, serve the repository locally:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open <http://localhost:8000/homework-2-ciphers.html>. Stop the server with Ctrl+C when finished. GitHub Pages can also serve the repository root over HTTPS; all asset links are relative.

## New assignment implementation

- `cipher-core.js`: dependency-free secp256k1 arithmetic using BigInt, ECDH-style shared-point calculation, HKDF-SHA-256, AES-256-GCM, bounded private-key enumeration, Caesar transformation, smoothed frequency/bigram training, candidate ranking, and seeded experiments. Both browser and Node use the same algorithms.
- `cipher-page.js`: message controls, round-trip verification, all 26 candidate previews, frequency bars, repeatable experiment table, and private-key recovery using only the captured public key and packet.
- `data/training-english.txt`: original English training passages (11,761 A–Z letters).
- `data/test-english.txt`: separate original evaluation passages (5,323 A–Z letters). Neither file is a representative language benchmark.
- `experiment-data.js`: precomputed model, normalised held-out text, and results, bundled as a script so direct file viewing does not depend on fetch permissions.
- `data/results.json`: recorded recovery counts, corpus sizes, seed, and sampling method.

The previous interactive curve uses modulus 17 and did not implement encryption. The new page explains the transition to actual secp256k1 rather than treating the earlier demonstration as that curve. Recipient private keys are restricted to 1–4096; ephemeral scalars use the full valid range. This is an educational hybrid construction, not a standard ECIES implementation or a secure wallet.

## Reproduce and verify

Use Node.js 22 or newer (built-in Web Crypto, no dependencies):

```sh
node build-experiments.js
node --test tests/ciphers.test.js
```

The builder derives the model and results from the two bundled text files. The seed is 20261022. There are 100 samples at each of eight lengths, with overlapping windows sampled with replacement. Every method uses the same sample and key. Scores rank candidates; they do not report calibrated confidence probabilities.

The page also contains a static results table for readers without JavaScript. If you change the corpora or experiment, update that table and the discussion to match the new results; the tests detect inconsistencies.

Verification covers known Caesar vectors and all shifts, Unicode round trips, secp256k1 public points against Node's native OpenSSL implementation, message/nonce/point tampering, edge keys in the bounded search, statistical recovery, and agreement between the corpora, generated data, and displayed results.

The toy keys, handwritten curve arithmetic, and public wallet examples are for learning only.
