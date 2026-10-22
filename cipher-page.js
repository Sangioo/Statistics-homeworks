(() => {
  'use strict';
  const C = window.CipherLab, data = window.ExperimentData;
  const $ = id => document.getElementById(id);
  let publicTarget = null;
  let caesarCipher = null;
  let busy = false;
  const editable = ['message', 'eccPrivate', 'caesarShift'];
  function lockDemo(locked) {
    busy = locked;
    for (const id of [...editable, 'encryptMessage']) $(id).disabled = locked;
    $('attackEcc').disabled = locked || !publicTarget;
  }
  function integerInput(id, min, max) {
    const field = $(id), value = Number(field.value);
    if (!field.value.trim() || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${id === 'eccPrivate' ? 'ECC private key' : 'Caesar shift'} must be a whole number from ${min} to ${max}.`);
    }
    return value;
  }
  function clearAttack() {
    publicTarget = null;
    $('attackEcc').disabled = true;
    $('eccAttackDetails').hidden = true;
    $('eccAttackStatus').textContent = 'First encrypt a message in section 1.';
  }
  async function runDemo() {
    if (busy) return;
    $('demoError').textContent = '';
    clearAttack();
    try {
      const d = BigInt(integerInput('eccPrivate', 1, C.LIMIT));
      const shift = integerInput('caesarShift', 0, 25);
      const message = $('message').value;
      if (!message.length) throw new Error('Enter a message to encrypt.');
      lockDemo(true);
      $('demoStatus').textContent = 'Encrypting and verifying both round trips…';
      caesarCipher = C.caesar(message, shift);
      const caesarPlain = C.caesar(caesarCipher, -shift);
      $('caesarCipher').textContent = caesarCipher;
      $('caesarPlain').textContent = caesarPlain;
      $('useCipher').disabled = false;
      const Q = C.multiply(d), packet = await C.encrypt(message, Q);
      const plaintext = await C.decrypt(packet, d);
      // The attack receives only public data, never the private input or expected message.
      publicTarget = {Q, packet};
      $('publicPoint').textContent = C.hex(C.encodePoint(Q));
      $('ephemeralPoint').textContent = C.hex(C.encodePoint(packet.R));
      $('nonce').textContent = C.hex(packet.iv);
      $('eccCipher').textContent = C.hex(packet.ciphertext);
      $('eccPlain').textContent = plaintext;
      $('roundTrip').textContent = plaintext === message && caesarPlain === message ? 'Both decrypted messages exactly match the input.' : 'Unexpected round-trip mismatch.';
      $('demoStatus').textContent = `Snapshot: d = ${d}, Caesar shift = ${shift}. Encrypt again to generate a fresh ECC packet; Caesar stays the same.`;
      $('eccAttackStatus').textContent = 'Public key and packet ready. Search d = 1,…,4096 to recover the recipient key.';
    } catch (error) {
      $('demoError').textContent = error.message;
      $('demoStatus').textContent = 'The demonstration could not complete. Check the message, keys, or browser requirements above.';
    } finally { lockDemo(false); }
  }
  function changedInputs() {
    clearAttack();
    caesarCipher = null;
    $('useCipher').disabled = true;
    for (const id of ['caesarCipher', 'caesarPlain', 'eccPlain', 'roundTrip', 'publicPoint', 'ephemeralPoint', 'nonce', 'eccCipher']) $(id).textContent = '—';
    $('demoError').textContent = '';
    $('demoStatus').textContent = 'Inputs changed. Encrypt again to update the results.';
  }
  function analyse() {
    $('analysisError').textContent = '';
    $('candidateRows').replaceChildren();
    $('frequencyBars').replaceChildren();
    try {
      const ciphertext = $('attackCipher').value;
      const ranking = C.rank(ciphertext, data.model, $('scoreMethod').value);
      const best = ranking[0];
      const plaintext = C.caesar(ciphertext, -best.key);
      $('analysisResult').textContent = `Best candidate: shift ${best.key}; ${C.letters(ciphertext).length} letters analysed. This is a guess, not a certainty. Plaintext: ${plaintext}`;
      for (const candidate of ranking) {
        const row = $('candidateRows').insertRow();
        const plain = C.caesar(ciphertext, -candidate.key);
        for (const value of [candidate.key, candidate.score.toFixed(3), plain.length > 160 ? plain.slice(0, 160) + '…' : plain]) row.insertCell().textContent = value;
      }
      const count = C.counts(plaintext), total = count.reduce((a, b) => a + b, 0);
      const observed = count.map(n => n / total);
      const max = Math.max(...data.model.frequencies, ...observed);
      for (let j = 0; j < 26; j++) {
        const row = document.createElement('div'); row.className = 'frequency-row';
        const letter = document.createElement('span'); letter.className = 'frequency-letter'; letter.textContent = String.fromCharCode(65 + j);
        const track = document.createElement('div'); track.className = 'frequency-track'; track.setAttribute('aria-hidden', 'true');
        for (const [kind, fraction] of [['training', data.model.frequencies[j]], ['candidate', observed[j]]]) {
          const bar = document.createElement('span'); bar.className = `frequency-bar ${kind}`; bar.style.width = `${fraction / max * 100}%`; track.append(bar);
        }
        const values = document.createElement('span'); values.className = 'frequency-values';
        values.textContent = `${(data.model.frequencies[j] * 100).toFixed(1)} / ${(observed[j] * 100).toFixed(1)}%`;
        values.setAttribute('aria-label', `Training ${(data.model.frequencies[j] * 100).toFixed(1)} percent; candidate ${(observed[j] * 100).toFixed(1)} percent`);
        row.append(letter, track, values); $('frequencyBars').append(row);
      }
    } catch (error) {
      $('analysisError').textContent = error.message;
      $('analysisResult').textContent = 'No ranking available.';
    }
  }
  async function runExperiments() {
    $('runExperiments').disabled = true;
    $('experimentStatus').textContent = 'Re-running the same seeded samples for all three methods…';
    // Give the browser a frame to announce the running state.
    await new Promise(resolve => setTimeout(resolve, 20));
    try {
      const results = C.experiment(data.testLetters, data.model);
      $('experimentRows').replaceChildren();
      for (const result of results) {
        const row = $('experimentRows').insertRow();
        const label = document.createElement('th'); label.scope = 'row'; label.textContent = result.length; row.append(label);
        for (const method of ['peak', 'chi', 'bigram']) row.insertCell().textContent = `${result[method]} / ${result.trials}`;
      }
      $('experimentStatus').textContent = 'Completed 800 trials, scored by all three methods. Seed 20261022; same results on every run. Each cell is successes / 100.';
    } catch (error) { $('experimentStatus').textContent = error.message; }
    finally { $('runExperiments').disabled = false; }
  }
  async function attackEcc() {
    if (!publicTarget || busy) return;
    const {Q, packet} = publicTarget;
    lockDemo(true);
    $('eccAttackDetails').hidden = true;
    $('eccAttackStatus').textContent = 'Searching public-point candidates…';
    const start = performance.now();
    try {
      const recovered = await C.recoverPrivate(Q, C.LIMIT, count => {
        $('eccAttackStatus').textContent = `Checked ${count} of ${C.LIMIT} possible private keys…`;
      });
      if (!recovered) {
        $('eccAttackStatus').textContent = 'No private key found in 1,…,4096.';
        return;
      }
      const plaintext = await C.decrypt(packet, recovered.key);
      $('recoveredKey').textContent = recovered.key.toString();
      $('attackCount').textContent = recovered.candidates.toString();
      $('attackTime').textContent = `${(performance.now() - start).toFixed(1)} ms (search + decryption; depends on device and browser scheduling)`;
      $('attackerPlain').textContent = plaintext;
      $('eccAttackDetails').hidden = false;
      $('eccAttackStatus').textContent = 'Exact public-point match found. The recovered key decrypted the packet and passed tag verification.';
    } catch (error) { $('eccAttackStatus').textContent = `Attack could not complete: ${error.message}`; }
    finally { lockDemo(false); }
  }
  $('encryptMessage').addEventListener('click', runDemo);
  for (const id of editable) $(id).addEventListener('input', changedInputs);
  $('analyseCipher').addEventListener('click', analyse);
  $('useCipher').addEventListener('click', () => { if (caesarCipher !== null) { $('attackCipher').value = caesarCipher; analyse(); } });
  $('runExperiments').addEventListener('click', runExperiments);
  $('attackEcc').addEventListener('click', attackEcc);
  for (const id of ['attackCipher', 'scoreMethod']) $(id).addEventListener('input', () => {
    $('candidateRows').replaceChildren(); $('frequencyBars').replaceChildren();
    $('analysisResult').textContent = 'Inputs changed. Recover the key again to update the ranking.';
    $('analysisError').textContent = '';
  });
  analyse();
  runDemo();
})();
