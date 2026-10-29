const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../hmwk3-penetration-core.js');
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('moments, normalizations, strict LLN threshold and CDF jumps match hand calculations', () => {
  const r = P.summarize([0, 2, 4], 4, 0.5, 0.25, 0.5);
  close(r.totalMean, 2); close(r.totalVariance, 4);
  close(r.averageMean, 0.5); close(r.averageVariance, 0.25);
  close(r.normalizedMean, 1); close(r.normalizedVariance, 1);
  assert.equal(r.aggregate, 6); assert.equal(r.deviationCount, 0);
  close(r.chebyshevBound, 0.25);
  assert.equal(P.summarize([2, 4, 5], 10, 0.3, 0.21, 0.1).deviationCount, 1);
  close(P.normalCDF(0), 0.5, 1e-7);
  close(P.normalCDF(1.96), 0.9750021, 1e-7);
  close(P.normalCDF(-1.96), 0.0249979, 1e-7);
  close(P.normalDistance([0, 0, 0]), 0.5, 1e-7);
});

test('deterministic Bernoulli boundaries and input validation', () => {
  for (const p of [0, 1]) {
    const run = P.simulate({n: 10, m: 5, p});
    assert.deepEqual(run.endpoints[0], Array(5).fill(p * 10));
    assert.equal(run.rows[0].totalVariance, 0);
    assert.equal(run.rows[0].normalDistance, null);
    assert.equal(run.rows[0].deviationRate, 0);
  }
  for (const options of [{n: 0}, {n: 10001}, {n: 1.5}, {m: 1}, {m: 5001}, {p: -1}, {p: NaN}, {epsilon: 0}, {seed: -1}, {seed: 1.5}, {model: 'other'}]) {
    assert.throws(() => P.simulate(options));
  }
});

test('paths use valid increments, preserve prefixes and agree with endpoint scores', () => {
  for (const model of ['bernoulli', 'rademacher']) {
    const short = P.simulate({model, n: 10, m: 12, seed: 42});
    const long = P.simulate({model, n: 100, m: 20, seed: 42});
    assert.deepEqual(short, P.simulate({model, n: 10, m: 12, seed: 42}));
    assert.deepEqual(short.endpoints[0], long.endpoints[0].slice(0, 12));
    short.paths.forEach((points, j) => {
      assert.deepEqual(points, long.paths[j].slice(0, 11));
      points.slice(1).forEach((point, i) => assert.ok((model === 'bernoulli' ? [0, 1] : [-1, 1]).includes(point.score - points[i].score)));
      assert.equal(points.at(-1).score, short.endpoints[0][j]);
    });
    assert.notDeepEqual(short.endpoints, P.simulate({model, n: 10, m: 12, seed: 43}).endpoints);
  }
});

test('small-n empirical distributions agree with exact binomial masses', () => {
  const run = P.simulate({model: 'rademacher', n: 4, m: 5000});
  const expected = [1, 4, 6, 4, 1].map(x => x / 16);
  const counts = Array(5).fill(0);
  for (const score of run.endpoints[0]) {
    assert.ok([-4, -2, 0, 2, 4].includes(score));
    counts[(score + 4) / 2]++;
  }
  expected.forEach((p, i) => close(counts[i] / 5000, p, 0.025));
  const bernoulli = P.simulate({n: 1, m: 5000, p: 0.3});
  close(bernoulli.rows[0].totalMean, 0.3, 0.025);
  close(bernoulli.rows[0].totalVariance, 0.21, 0.015);
});

test('histogram retains every observation and integrates to one, including point masses', () => {
  for (const values of [[-3, -1, 0, 1, 3], [0, 0, 0], [1, 1, 2, 3, 3]]) {
    const h = P.histogram(values);
    assert.equal(h.bins.reduce((a, b) => a + b), values.length);
    close(h.density.reduce((a, b) => a + b * h.width, 0), 1);
  }
});

test('simulated moments, LLN and CLT agree with theory', () => {
  for (const name of ['bernoulli', 'rademacher']) {
    const model = P.simulate({model: name, n: 10000, m: 5000, p: 0.3, seed: 20261027});
    const rows = model.rows;
    for (const r of rows) {
      close(r.averageMean, model.mu, 5 * Math.sqrt(model.sigma2 / (r.n * r.m)));
      close(r.normalizedVariance, model.sigma2, model.sigma2 * 0.08);
      close(r.averageVariance, r.totalVariance / r.n ** 2);
    }
    assert.ok(rows.at(-1).deviationRate < rows[0].deviationRate);
    assert.ok(rows.at(-1).normalDistance < 0.04);
    assert.ok(rows.at(-1).normalDistance < rows[0].normalDistance);
  }
});
