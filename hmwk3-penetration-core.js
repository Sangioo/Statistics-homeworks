// Homework 3 simulation shared by the browser and Node tests. No dependencies.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Penetration = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function validate({model, n, m, p, seed, epsilon}) {
    if (!['bernoulli', 'rademacher'].includes(model)) throw new Error('Choose a supported model.');
    if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error('Systems n must be a whole number from 1 to 10,000.');
    if (!Number.isInteger(m) || m < 2 || m > 5000) throw new Error('Attackers m must be a whole number from 2 to 5,000.');
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Probability p must be between 0 and 1.');
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Seed must be a whole number from 0 to 4,294,967,295.');
    if (!Number.isFinite(epsilon) || epsilon <= 0 || epsilon > 1) throw new Error('Tolerance ε must be greater than 0 and at most 1.');
  }
  function moments(values) {
    let mean = 0, sumSquares = 0, count = 0;
    for (const x of values) {
      count++;
      const delta = x - mean;
      mean += delta / count;
      sumSquares += delta * (x - mean);
    }
    return {mean, variance: count > 1 ? sumSquares / (count - 1) : 0};
  }
  // Normal CDF approximation (absolute error below 8e-8).
  function normalCDF(x) {
    const a = Math.abs(x), t = 1 / (1 + 0.2316419 * a);
    const tail = Math.exp(-a * a / 2) / Math.sqrt(2 * Math.PI) * t *
      (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x < 0 ? tail : 1 - tail;
  }
  function normalDistance(values) {
    const sorted = [...values].sort((a, b) => a - b);
    let d = 0;
    sorted.forEach((x, i) => {
      const f = normalCDF(x);
      d = Math.max(d, Math.abs(f - i / sorted.length), Math.abs((i + 1) / sorted.length - f));
    });
    return d;
  }
  function summarize(values, n, mu, sigma2, epsilon) {
    const {mean, variance} = moments(values);
    const misses = values.filter(s => Math.abs(s / n - mu) > epsilon + 1e-12).length;
    return {
      n, m: values.length, totalMean: mean, totalVariance: variance,
      averageMean: mean / n, averageVariance: variance / (n * n),
      normalizedMean: mean / Math.sqrt(n), normalizedVariance: variance / n,
      deviationCount: misses, deviationRate: misses / values.length,
      chebyshevBound: Math.min(1, sigma2 / (n * epsilon * epsilon)),
      normalDistance: sigma2 > 0 ? normalDistance(values.map(s => (s - n * mu) / Math.sqrt(n * sigma2))) : null,
      aggregate: values.reduce((sum, s) => sum + s, 0)
    };
  }
  function simulate(options = {}) {
    const settings = {model: 'bernoulli', n: 1000, m: 2000, p: 0.3, seed: 20261027, epsilon: 0.1, ...options};
    validate(settings);
    const {model, n, m, p, seed, epsilon} = settings;
    const mu = model === 'bernoulli' ? p : 0;
    const sigma2 = model === 'bernoulli' ? p * (1 - p) : 1;
    const checkpoints = [...new Set([10, 100, 1000, 10000].filter(k => k <= n).concat(n))].sort((a, b) => a - b);
    const endpoints = checkpoints.map(() => []), paths = [];
    const stride = Math.max(1, Math.ceil(n / 500));
    for (let j = 0; j < m; j++) {
      // One reproducible stream per attacker: changing n or m preserves earlier paths.
      const rng = random((seed + Math.imul(j, 0x9e3779b9)) >>> 0);
      let score = 0, checkpoint = 0;
      const path = j < 12 ? [{k: 0, score: 0}] : null;
      for (let k = 1; k <= n; k++) {
        const u = rng();
        score += model === 'bernoulli' ? (u < p ? 1 : 0) : (u < 0.5 ? 1 : -1);
        if (k === checkpoints[checkpoint]) { endpoints[checkpoint].push(score); checkpoint++; }
        if (path && (k === 1 || k % stride === 0 || k === n)) path.push({k, score});
      }
      if (path) paths.push(path);
    }
    return {settings, mu, sigma2, checkpoints, endpoints, paths,
      rows: endpoints.map((values, i) => summarize(values, checkpoints[i], mu, sigma2, epsilon))};
  }
  function histogram(values, binCount = 24) {
    let min = Infinity, max = -Infinity;
    for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
    if (min === max) { min -= 0.5; max += 0.5; }
    const width = (max - min) / binCount;
    const bins = Array(binCount).fill(0);
    for (const value of values) bins[Math.min(binCount - 1, Math.floor((value - min) / width))]++;
    return {min, max, width, bins, density: bins.map(count => count / (values.length * width))};
  }
  return {random, moments, normalCDF, normalDistance, summarize, simulate, histogram};
});
