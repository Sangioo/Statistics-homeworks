// Homework 7: convergence simulations and Bayesian updating. No dependencies.
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const MAX_PLOTTED_PATHS = 24;

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "—";
    const places = digits === undefined ? 4 : digits;
    if (value !== 0 && Math.abs(value) < 1e-4) return value.toExponential(2);
    return value.toLocaleString("en-US", {
      maximumFractionDigits: places,
      minimumFractionDigits: 0,
    });
  }

  function fmtPct(value, digits) {
    if (!Number.isFinite(value)) return "—";
    const places = digits === undefined ? 1 : digits;
    const unit = Math.pow(10, -places);
    if (value > 0 && 100 * value < unit / 2) return "<" + unit.toFixed(places) + "%";
    if (value < 1 && 100 * (1 - value) < unit / 2) {
      return ">" + (100 - unit).toFixed(places) + "%";
    }
    return (100 * value).toFixed(places) + "%";
  }

  function fmtInt(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function fmtParam(value) {
    if (!Number.isFinite(value)) return "—";
    return String(Number(value.toFixed(2)));
  }

  function average(values) {
    if (!values.length) return NaN;
    let total = 0;
    for (let i = 0; i < values.length; i++) total += values[i];
    return total / values.length;
  }

  function sampleVariance(values) {
    if (values.length < 2) return NaN;
    const center = average(values);
    let total = 0;
    for (let i = 0; i < values.length; i++) {
      const d = values[i] - center;
      total += d * d;
    }
    return total / (values.length - 1);
  }

  function sortedCopy(values) {
    return Array.from(values).sort((a, b) => a - b);
  }

  function quantileSorted(sorted, p) {
    if (!sorted.length) return NaN;
    const position = clamp(p, 0, 1) * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    const weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  function escapeXml(value) {
    const text = String(value);
    let escaped = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "<") escaped += "&lt;";
      else if (c === ">") escaped += "&gt;";
      else if (c === "&") escaped += "&amp;";
      else if (c === '"') escaped += "&quot;";
      else if (c === "'") escaped += "&apos;";
      else escaped += c;
    }
    return escaped;
  }

  // ---------------------------------------------------------------------------
  // Seeded simulation
  // ---------------------------------------------------------------------------

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DISTRIBUTIONS = {
    bernoulli: {
      label: "Bernoulli(p = 0.3)", mean: 0.3, variance: 0.21, finite: true,
      range: [-0.15, 1.15],
      sample: function (rng) { return rng() < 0.3 ? 1 : 0; },
    },
    uniform: {
      label: "Uniform(0, 1)", mean: 0.5, variance: 1 / 12, finite: true,
      range: [-0.15, 1.15],
      sample: function (rng) { return rng(); },
    },
    exponential: {
      label: "Exponential(rate 1)", mean: 1, variance: 1, finite: true,
      range: [0, 5],
      sample: function (rng) { return -Math.log(1 - rng()); },
    },
    cauchy: {
      label: "Cauchy(0, 1)", mean: null, variance: null, finite: false,
      range: [-6, 6],
      sample: function (rng) {
        const u = clamp(rng(), 1e-15, 1 - 1e-15);
        return Math.tan(Math.PI * (u - 0.5));
      },
    },
  };

  function normalPdf(z) {
    return Math.exp(-0.5 * z * z) / Math.sqrt(TAU);
  }

  function cauchyPdf(x) {
    return 1 / (Math.PI * (1 + x * x));
  }

  function svgText(x, y, text, extra) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" ' +
      (extra || "") + ">" + escapeXml(text) + "</text>";
  }

  function svgLine(x1, y1, x2, y2, extra) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
      '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" ' +
      (extra || "") + "/>";
  }

  function svgPath(points, extra) {
    let d = "";
    for (let i = 0; i < points.length; i++) {
      d += (i === 0 ? "M" : "L") + points[i][0].toFixed(1) + " " +
        points[i][1].toFixed(1) + " ";
    }
    return '<path d="' + d + '" ' + (extra || "") + "/>";
  }

  function readConvergenceInputs() {
    const distribution = document.getElementById("distribution").value;
    const n = Number(document.getElementById("sampleSize").value);
    const simulations = Number(document.getElementById("simulations").value);
    const seed = Number(document.getElementById("seed").value);
    const epsilon = Number(document.getElementById("epsilon").value);

    if (!DISTRIBUTIONS[distribution]) return { error: "Choose a valid distribution." };
    if (!Number.isInteger(n) || n < 10 || n > 5000) {
      return { error: "The sample size n must be an integer between 10 and 5,000." };
    }
    if (!Number.isInteger(simulations) || simulations < 20 || simulations > 1000) {
      return { error: "The number of simulated paths must be between 20 and 1,000." };
    }
    if (!Number.isInteger(seed) || seed < 1 || seed > 999999999) {
      return { error: "The seed must be an integer between 1 and 999,999,999." };
    }
    if (!Number.isFinite(epsilon) || epsilon <= 0 || epsilon > 2) {
      return { error: "The tolerance ε must be greater than 0 and at most 2." };
    }
    return { distribution, n, simulations, seed, epsilon };
  }

  function simulateConvergence(config) {
    const dist = DISTRIBUTIONS[config.distribution];
    const n = config.n;
    const m = config.simulations;
    const paths = [];
    const finalMeans = new Float64Array(m);
    const plotEvery = Math.max(1, Math.floor(n / 420));

    for (let path = 0; path < m; path++) {
      const seed = (config.seed + Math.imul(path + 1, 0x9e3779b1)) >>> 0;
      const rng = mulberry32(seed);
      const shouldPlot = path < MAX_PLOTTED_PATHS;
      const points = shouldPlot ? [] : null;
      let total = 0;
      for (let k = 1; k <= n; k++) {
        total += dist.sample(rng);
        if (shouldPlot && (k === 1 || k === n || k % plotEvery === 0)) {
          points.push([k, total / k]);
        }
      }
      finalMeans[path] = total / n;
      if (shouldPlot) paths.push(points);
    }
    return {
      dist, n, m, epsilon: config.epsilon, paths,
      finalMeans: Array.from(finalMeans),
      seed: config.seed,
    };
  }

  function standardisedValues(result) {
    if (!result.dist.finite) return result.finalMeans.slice();
    const scale = Math.sqrt(result.n) / Math.sqrt(result.dist.variance);
    return result.finalMeans.map(function (v) {
      return (v - result.dist.mean) * scale;
    });
  }

  function renderPathPlot(result) {
    const svg = document.getElementById("pathPlot");
    if (!svg) return;
    const width = 760;
    const height = 340;
    const margin = { left: 58, right: 18, top: 26, bottom: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const dist = result.dist;
    const yMin = dist.range[0];
    const yMax = dist.range[1];
    const logN = Math.log10(Math.max(10, result.n));

    function xScale(k) {
      return margin.left + (Math.log10(Math.max(1, k)) / logN) * plotWidth;
    }
    function yScale(value) {
      return margin.top + ((yMax - clamp(value, yMin, yMax)) / (yMax - yMin)) * plotHeight;
    }

    const parts = [];
    if (dist.finite) {
      const upper = yScale(dist.mean + result.epsilon);
      const lower = yScale(dist.mean - result.epsilon);
      parts.push('<rect x="' + margin.left.toFixed(1) + '" y="' +
        Math.min(upper, lower).toFixed(1) + '" width="' + plotWidth.toFixed(1) +
        '" height="' + Math.abs(lower - upper).toFixed(1) +
        '" fill="#eaf2fc"/>');
    }
    for (let i = 0; i <= 4; i++) {
      const value = yMin + ((yMax - yMin) * i) / 4;
      const y = yScale(value);
      parts.push(svgLine(margin.left, y, margin.left + plotWidth, y, 'stroke="#d9e2ed"'));
      parts.push(svgText(margin.left - 8, y + 4, fmt(value, 2), 'text-anchor="end"'));
    }
    const ticks = [1];
    for (let p = 10; p <= result.n; p *= 10) ticks.push(p);
    if (ticks[ticks.length - 1] !== result.n) ticks.push(result.n);
    ticks.forEach(function (tick) {
      const x = xScale(tick);
      parts.push(svgLine(x, margin.top, x, margin.top + plotHeight, 'stroke="#d9e2ed"'));
      parts.push(svgText(x, height - 18, String(tick), 'text-anchor="middle"'));
    });
    result.paths.forEach(function (points, index) {
      const scaled = points.map(function (p) { return [xScale(p[0]), yScale(p[1])]; });
      parts.push(svgPath(scaled, 'fill="none" stroke="#235da6" stroke-width="1.2" stroke-opacity="' +
        (index === 0 ? "0.55" : "0.18") + '"'));
    });
    const center = dist.finite ? dist.mean : 0;
    const centerY = yScale(center);
    parts.push(svgLine(margin.left, centerY, margin.left + plotWidth, centerY,
      'stroke="#e29a21" stroke-width="2" stroke-dasharray="6 4"'));
    parts.push(svgText(margin.left + plotWidth - 4, centerY - 6,
      dist.finite ? "μ" : "median 0", 'text-anchor="end" fill="#c17c10"'));
    parts.push(svgText(margin.left + plotWidth / 2, height - 3,
      "sample size k (log scale)", 'text-anchor="middle"'));
    parts.push('<text x="16" y="' + (margin.top + plotHeight / 2).toFixed(1) +
      '" text-anchor="middle" transform="rotate(-90 16 ' +
      (margin.top + plotHeight / 2).toFixed(1) + ')" fill="#53647a">running average</text>');
    parts.push('<rect x="' + margin.left.toFixed(1) + '" y="' + margin.top.toFixed(1) +
      '" width="' + plotWidth.toFixed(1) + '" height="' + plotHeight.toFixed(1) +
      '" fill="none" stroke="#d9e2ed"/>');
    svg.innerHTML = parts.join("");
  }

  function renderHistogram(result) {
    const svg = document.getElementById("histPlot");
    if (!svg) return { clipped: 0, total: result.finalMeans.length };
    const width = 760;
    const height = 340;
    const margin = { left: 58, right: 18, top: 26, bottom: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const finite = result.dist.finite;
    const range = finite ? [-4, 4] : [-6, 6];
    const bins = 40;
    const values = standardisedValues(result);
    const counts = new Array(bins).fill(0);
    let clipped = 0;

    values.forEach(function (value) {
      if (value < range[0] || value > range[1]) { clipped++; return; }
      const index = Math.min(bins - 1,
        Math.floor(((value - range[0]) / (range[1] - range[0])) * bins));
      counts[index]++;
    });
    const binWidth = (range[1] - range[0]) / bins;
    const densities = counts.map(function (c) { return c / (values.length * binWidth); });
    const peak = finite ? normalPdf(0) : cauchyPdf(0);
    const yMax = Math.max(0.1, Math.max.apply(null, densities.concat([peak])) * 1.15);

    function xScale(v) { return margin.left + ((v - range[0]) / (range[1] - range[0])) * plotWidth; }
    function yScale(v) { return margin.top + (1 - v / yMax) * plotHeight; }

    const parts = [];
    for (let i = 0; i <= 4; i++) {
      const value = (yMax * i) / 4;
      const y = yScale(value);
      parts.push(svgLine(margin.left, y, margin.left + plotWidth, y, 'stroke="#d9e2ed"'));
      parts.push(svgText(margin.left - 8, y + 4, fmt(value, 2), 'text-anchor="end"'));
    }
    counts.forEach(function (count, i) {
      const left = margin.left + (i / bins) * plotWidth;
      const top = yScale(densities[i]);
      parts.push('<rect x="' + (left + 0.5).toFixed(1) + '" y="' + top.toFixed(1) +
        '" width="' + Math.max(0.5, plotWidth / bins - 1).toFixed(1) +
        '" height="' + Math.max(0, margin.top + plotHeight - top).toFixed(1) +
        '" fill="#235da6" fill-opacity="0.65"/>');
    });
    const curve = [];
    for (let i = 0; i <= 220; i++) {
      const value = range[0] + ((range[1] - range[0]) * i) / 220;
      curve.push([xScale(value), yScale(finite ? normalPdf(value) : cauchyPdf(value))]);
    }
    parts.push(svgPath(curve, 'fill="none" stroke="#e29a21" stroke-width="2.5"'));
    (finite ? [-4, -2, 0, 2, 4] : [-6, -3, 0, 3, 6]).forEach(function (tick) {
      const x = xScale(tick);
      parts.push(svgLine(x, margin.top, x, margin.top + plotHeight, 'stroke="#f0f4f9"'));
      parts.push(svgText(x, height - 18, String(tick), 'text-anchor="middle"'));
    });
    parts.push(svgText(margin.left + plotWidth - 6, margin.top + 16,
      finite ? "N(0, 1)" : "Cauchy(0, 1)", 'text-anchor="end" fill="#c17c10"'));
    parts.push(svgText(margin.left + plotWidth / 2, height - 3,
      finite ? "standardised mean z" : "sample mean X̄ₙ", 'text-anchor="middle"'));
    parts.push('<text x="16" y="' + (margin.top + plotHeight / 2).toFixed(1) +
      '" text-anchor="middle" transform="rotate(-90 16 ' +
      (margin.top + plotHeight / 2).toFixed(1) + ')" fill="#53647a">density</text>');
    parts.push('<rect x="' + margin.left.toFixed(1) + '" y="' + margin.top.toFixed(1) +
      '" width="' + plotWidth.toFixed(1) + '" height="' + plotHeight.toFixed(1) +
      '" fill="none" stroke="#d9e2ed"/>');
    svg.innerHTML = parts.join("");
    return { clipped: clipped, total: values.length };
  }

  function renderConvergence(result) {
    const dist = result.dist;
    const means = result.finalMeans;
    const summary = document.getElementById("convergenceSummary");
    if (summary) {
      if (dist.finite) {
        const mse = average(means.map(function (v) {
          const d = v - dist.mean;
          return d * d;
        }));
        const within = means.filter(function (v) {
          return Math.abs(v - dist.mean) < result.epsilon;
        }).length / result.m;
        const bound = Math.min(1, dist.variance / (result.n * result.epsilon * result.epsilon));
        summary.innerHTML = "<strong>" + escapeXml(dist.label) + "</strong>, n = " +
          fmtInt(result.n) + ", " + fmtInt(result.m) + " paths, seed " +
          fmtInt(result.seed) + ", ε = " + fmt(result.epsilon, 3) +
          ". Mean of X̄ₙ = " + fmt(average(means), 5) + " (μ = " + fmt(dist.mean, 4) +
          "), MSE = " + fmt(mse, 5) + " (σ²/n = " + fmt(dist.variance / result.n, 5) +
          "), outside the ε-band " + fmtPct(1 - within, 2) +
          " (Chebyshev ≤ " + fmtPct(bound, 2) + ").";
      } else {
        const sorted = sortedCopy(means);
        const median = quantileSorted(sorted, 0.5);
        const iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25);
        summary.innerHTML = "<strong>" + escapeXml(dist.label) +
          "</strong>, n = " + fmtInt(result.n) + ", " + fmtInt(result.m) +
          " paths, seed " + fmtInt(result.seed) +
          ". There is no finite mean or variance: the sample mean of n iid Cauchy variables is again standard Cauchy, so it never concentrates. Median of X̄ₙ = " +
          fmt(median, 4) + ", IQR = " + fmt(iqr, 4) + " (theoretical 0 and 2).";
      }
    }
    renderPathPlot(result);
    const info = renderHistogram(result) || { clipped: 0, total: means.length };
    const note = document.getElementById("histNote");
    if (note) {
      const extra = info.clipped
        ? info.clipped + " of " + info.total + " values lie outside the plotted range. "
        : "";
      if (dist.finite) {
        const z = standardisedValues(result);
        note.textContent = extra + "Empirical mean and variance of the standardised mean: " +
          fmt(average(z), 4) + " and " + fmt(sampleVariance(z), 4) +
          ". The orange curve is the standard normal density predicted by the CLT.";
      } else {
        note.textContent = extra + "The raw sample mean is shown because √n standardisation is undefined; the orange curve is the standard Cauchy density.";
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Beta distribution and Bayes lab
  // ---------------------------------------------------------------------------

  const LANCZOS_G = 7;
  const LANCZOS_COEFFICIENTS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  function logGamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1;
    let series = LANCZOS_COEFFICIENTS[0];
    const t = x + LANCZOS_G + 0.5;
    for (let i = 1; i < LANCZOS_G + 2; i++) {
      series += LANCZOS_COEFFICIENTS[i] / (x + i);
    }
    return 0.5 * Math.log(TAU) + (x + 0.5) * Math.log(t) - t + Math.log(series);
  }

  function betaContinuedFraction(a, b, x) {
    const tiny = 1e-300;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 3e-14) break;
    }
    return h;
  }

  function betaTails(a, b, x) {
    if (!(a > 0) || !(b > 0) || Number.isNaN(x)) return { low: NaN, high: NaN };
    if (x <= 0) return { low: 0, high: 1 };
    if (x >= 1) return { low: 1, high: 0 };
    const front = Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) +
      a * Math.log(x) + b * Math.log1p(-x),
    );
    if (x < (a + 1) / (a + b + 2)) {
      const low = (front * betaContinuedFraction(a, b, x)) / a;
      return { low: low, high: 1 - low };
    }
    const high = (front * betaContinuedFraction(b, a, 1 - x)) / b;
    return { low: 1 - high, high: high };
  }

  function betaQuantile(p, a, b) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 160; i++) {
      const mid = (low + high) / 2;
      if (p <= 0.5) {
        if (betaTails(a, b, mid).low < p) low = mid; else high = mid;
      } else {
        if (betaTails(a, b, mid).high > 1 - p) low = mid; else high = mid;
      }
    }
    return (low + high) / 2;
  }

  function betaPdf(x, a, b) {
    if (x < 0 || x > 1) return 0;
    if (x === 0) return a < 1 ? Infinity : (a === 1 ? b : 0);
    if (x === 1) return b < 1 ? Infinity : (b === 1 ? a : 0);
    const logBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - logBeta);
  }

  function betaMode(a, b) {
    if (a > 1 && b > 1) return (a - 1) / (a + b - 2);
    if (a < 1 && b < 1) return "0 and 1";
    if (a === 1 && b === 1) return "all points";
    if (a <= 1 && b > 1) return 0;
    if (a === 1 && b < 1) return 1;
    return a < 1 ? 0 : 1;
  }

  function betaSummary(a, b) {
    return {
      a: a, b: b,
      mean: a / (a + b),
      mode: betaMode(a, b),
      sd: Math.sqrt((a * b) / ((a + b) * (a + b) * (a + b + 1))),
      low: betaQuantile(0.025, a, b),
      high: betaQuantile(0.975, a, b),
    };
  }

  function formatInterval(s) {
    return "[" + fmt(s.low, 4) + ", " + fmt(s.high, 4) + "]";
  }

  function formatMode(mode) {
    return typeof mode === "string" ? mode : fmt(mode, 3);
  }

  function readBayesInputs() {
    const alpha = Number(document.getElementById("priorAlpha").value);
    const beta = Number(document.getElementById("priorBeta").value);
    const x = Number(document.getElementById("successes").value);
    const n = Number(document.getElementById("trials").value);
    const threshold = Number(document.getElementById("threshold").value);
    if (!(alpha > 0) || !(beta > 0) || alpha > 100 || beta > 100) {
      return { error: "The prior parameters must be greater than 0 and at most 100." };
    }
    if (!Number.isInteger(x) || !Number.isInteger(n) || n < 1 || n > 10000 || x < 0 || x > n) {
      return { error: "Use integers with 0 ≤ x ≤ n and 1 ≤ n ≤ 10,000." };
    }
    if (!(threshold >= 0) || !(threshold <= 1)) {
      return { error: "The threshold θ₀ must be between 0 and 1." };
    }
    return { alpha, beta, x, n, threshold };
  }

  function computeBayes(config) {
    const prior = betaSummary(config.alpha, config.beta);
    const likelihood = betaSummary(config.x + 1, config.n - config.x + 1);
    const posterior = betaSummary(config.alpha + config.x, config.beta + config.n - config.x);
    const sensitivityPriors = [
      { a: 0.5, b: 0.5, label: "Beta(0.5, 0.5) — Jeffreys" },
      { a: 1, b: 1, label: "Beta(1, 1) — uniform" },
      { a: 2, b: 2, label: "Beta(2, 2) — weak" },
      { a: 10, b: 10, label: "Beta(10, 10) — strong" },
    ];
    const sensitivity = sensitivityPriors.map(function (p) {
      const a = p.a + config.x;
      const b = p.b + config.n - config.x;
      return {
        label: p.label,
        priorMean: p.a / (p.a + p.b),
        posterior: betaSummary(a, b),
        probability: betaTails(a, b, config.threshold).high,
      };
    });
    return {
      config, prior, likelihood, posterior, sensitivity,
      probability: betaTails(posterior.a, posterior.b, config.threshold).high,
    };
  }

  function renderBetaPlot(result) {
    const svg = document.getElementById("betaPlot");
    if (!svg) return;
    const width = 760;
    const height = 360;
    const margin = { left: 58, right: 20, top: 26, bottom: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const grid = [];
    for (let i = 0; i <= 240; i++) grid.push(0.001 + (0.998 * i) / 240);

    const priorValues = grid.map(function (x) { return betaPdf(x, result.prior.a, result.prior.b); });
    const likelihoodValues = grid.map(function (x) {
      return betaPdf(x, result.likelihood.a, result.likelihood.b);
    });
    const posteriorValues = grid.map(function (x) {
      return betaPdf(x, result.posterior.a, result.posterior.b);
    });
    let maximum = 0;
    priorValues.concat(likelihoodValues, posteriorValues).forEach(function (v) {
      if (Number.isFinite(v) && v > maximum) maximum = v;
    });
    const clipped = maximum * 1.12 > 12;
    const yMax = Math.max(1.05, Math.min(maximum * 1.12, 12));

    function xScale(x) { return margin.left + x * plotWidth; }
    function yScale(y) { return margin.top + (1 - clamp(y, 0, yMax) / yMax) * plotHeight; }

    const parts = [];
    for (let i = 0; i <= 4; i++) {
      const value = (yMax * i) / 4;
      const y = yScale(value);
      parts.push(svgLine(margin.left, y, margin.left + plotWidth, y, 'stroke="#d9e2ed"'));
      parts.push(svgText(margin.left - 8, y + 4, fmt(value, 2), 'text-anchor="end"'));
    }
    const interval = result.posterior;
    const shape = [];
    for (let i = 0; i <= 80; i++) {
      const x = interval.low + ((interval.high - interval.low) * i) / 80;
      shape.push([xScale(x), yScale(betaPdf(x, interval.a, interval.b))]);
    }
    let fill = "M " + xScale(interval.low).toFixed(1) + " " + yScale(0).toFixed(1) + " L " +
      shape.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L ") +
      " L " + xScale(interval.high).toFixed(1) + " " + yScale(0).toFixed(1) + " Z";
    parts.push('<path d="' + fill + '" fill="#235da6" fill-opacity="0.10" stroke="none"/>');

    function curve(values, stroke) {
      const points = grid.map(function (x, i) { return [xScale(x), yScale(values[i])]; });
      return svgPath(points, 'fill="none" ' + stroke);
    }
    parts.push(curve(priorValues, 'stroke="#adb9c8" stroke-width="2" stroke-dasharray="5 3"'));
    parts.push(curve(likelihoodValues, 'stroke="#e29a21" stroke-width="2"'));
    parts.push(curve(posteriorValues, 'stroke="#235da6" stroke-width="3"'));
    [interval.low, interval.high].forEach(function (x) {
      const px = xScale(x);
      parts.push(svgLine(px, margin.top, px, margin.top + plotHeight,
        'stroke="#235da6" stroke-dasharray="4 4" stroke-opacity="0.55"'));
    });
    for (let i = 0; i <= 5; i++) {
      const x = xScale(i / 5);
      parts.push(svgLine(x, margin.top, x, margin.top + plotHeight, 'stroke="#f0f4f9"'));
      parts.push(svgText(x, height - 18, fmt(i / 5, 1), 'text-anchor="middle"'));
    }
    parts.push(svgText(margin.left + plotWidth / 2, height - 3, "θ", 'text-anchor="middle"'));
    parts.push('<text x="16" y="' + (margin.top + plotHeight / 2).toFixed(1) +
      '" text-anchor="middle" transform="rotate(-90 16 ' +
      (margin.top + plotHeight / 2).toFixed(1) + ')" fill="#53647a">density</text>');
    parts.push('<rect x="' + margin.left.toFixed(1) + '" y="' + margin.top.toFixed(1) +
      '" width="' + plotWidth.toFixed(1) + '" height="' + plotHeight.toFixed(1) +
      '" fill="none" stroke="#d9e2ed"/>');
    svg.innerHTML = parts.join("");

    const note = document.getElementById("betaPlotNote");
    if (note) {
      note.textContent = "The orange likelihood is rescaled to integrate to one; it is not a posterior. Shaded area: 95% equal-tailed credible interval " +
        formatInterval(interval) + "." +
        (clipped ? " The vertical axis is clipped at 12 for very peaked densities." : "");
    }
  }

  function renderBayes(result) {
    const posterior = result.posterior;
    const summary = document.getElementById("bayesSummary");
    if (summary) {
      summary.innerHTML = "<strong>Posterior: Beta(" + fmtParam(posterior.a) + ", " +
        fmtParam(posterior.b) + ").</strong> Mean " + fmt(posterior.mean, 4) +
        ", mode " + formatMode(posterior.mode) + ", SD " + fmt(posterior.sd, 4) +
        ", 95% credible interval " + formatInterval(posterior) +
        ". Prior mean " + fmt(result.prior.mean, 4) + ", data proportion " +
        fmt(result.config.x / result.config.n, 4) +
        ". P(θ &gt; θ₀ | x) = " + fmtPct(result.probability, 2) +
        ". The posterior predictive probability of success on the next trial is " +
        fmt(posterior.mean, 4) + ".";
    }
    const rows = document.getElementById("sensitivityRows");
    if (rows) {
      rows.innerHTML = result.sensitivity.map(function (p) {
        return "<tr><th scope=\"row\">" + p.label + "</th><td>" +
          fmt(p.priorMean, 4) + "</td><td>" + fmt(p.posterior.mean, 4) + "</td><td>" +
          formatInterval(p.posterior) + "</td><td>" + fmtPct(p.probability, 2) +
          "</td></tr>";
      }).join("");
    }
    renderBetaPlot(result);
  }

  function runBayes() {
    const error = document.getElementById("bayesError");
    const status = document.getElementById("bayesStatus");
    const results = document.getElementById("bayesResults");
    if (!error || !status || !results) return;
    const config = readBayesInputs();
    if (config.error) {
      error.textContent = config.error;
      status.textContent = "";
      results.hidden = true;
      return;
    }
    error.textContent = "";
    renderBayes(computeBayes(config));
    results.hidden = false;
    status.textContent = "Posterior computed for " + config.x + " successes in " + config.n + " trials.";
  }

  // ---------------------------------------------------------------------------
  // Medical test calculator
  // ---------------------------------------------------------------------------

  function runTest() {
    const error = document.getElementById("testError");
    const status = document.getElementById("testStatus");
    const results = document.getElementById("testResults");
    if (!error || !status || !results) return;
    const prevalence = Number(document.getElementById("prevalence").value) / 100;
    const sensitivity = Number(document.getElementById("sensitivity").value) / 100;
    const specificity = Number(document.getElementById("specificity").value) / 100;

    if ([prevalence, sensitivity, specificity].some(function (v) { return !(v >= 0 && v <= 1); })) {
      error.textContent = "Each percentage must be between 0% and 100%.";
      status.textContent = "";
      results.hidden = true;
      return;
    }
    const pPositive = prevalence * sensitivity + (1 - prevalence) * (1 - specificity);
    const pNegative = prevalence * (1 - sensitivity) + (1 - prevalence) * specificity;
    if (!(pPositive > 0) && !(pNegative > 0)) {
      error.textContent = "The test has no informative outcomes in this population.";
      status.textContent = "";
      results.hidden = true;
      return;
    }
    const posteriorPositive = pPositive > 0
      ? fmtPct((prevalence * sensitivity) / pPositive, 2)
      : "not defined";
    const posteriorNegative = pNegative > 0
      ? fmtPct((prevalence * (1 - sensitivity)) / pNegative, 2)
      : "not defined";

    const population = 10000;
    const diseased = population * prevalence;
    const healthy = population * (1 - prevalence);
    const tp = diseased * sensitivity;
    const fn = diseased - tp;
    const fp = healthy * (1 - specificity);
    const tn = healthy - fp;

    const summary = document.getElementById("testSummary");
    if (summary) {
      summary.innerHTML = "<strong>P(D | +) = " + posteriorPositive + "</strong> and P(D | −) = " +
        posteriorNegative + ". Per 10,000 people, about " + fmtInt(tp + fp) +
        " test positive, of whom about " + fmtInt(tp) + " are truly diseased. Prior " +
        fmtPct(prevalence, 2) + " → posterior " + posteriorPositive + " after a positive test.";
    }
    const rows = document.getElementById("testRows");
    if (rows) {
      rows.innerHTML =
        "<tr><th scope=\"row\">Diseased (D)</th><td>" + fmtInt(tp) + "</td><td>" + fmtInt(fn) +
        "</td><td>" + fmtInt(diseased) + "</td></tr>" +
        "<tr><th scope=\"row\">Healthy (H)</th><td>" + fmtInt(fp) + "</td><td>" + fmtInt(tn) +
        "</td><td>" + fmtInt(healthy) + "</td></tr>" +
        "<tr><th scope=\"row\">Total</th><td>" + fmtInt(tp + fp) + "</td><td>" + fmtInt(fn + tn) +
        "</td><td>10,000</td></tr>";
    }
    error.textContent = "";
    results.hidden = false;
    status.textContent = "Posterior computed for prevalence " + fmtPct(prevalence, 2) +
      ", sensitivity " + fmtPct(sensitivity, 2) + " and specificity " + fmtPct(specificity, 2) + ".";
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  function init() {
    const convergenceForm = document.getElementById("convergenceForm");
    if (convergenceForm) {
      let token = 0;
      function runConvergence() {
        const config = readConvergenceInputs();
        const error = document.getElementById("convergenceError");
        const status = document.getElementById("convergenceStatus");
        const results = document.getElementById("convergenceResults");
        if (config.error) {
          error.textContent = config.error;
          status.textContent = "";
          results.hidden = true;
          return;
        }
        const current = ++token;
        error.textContent = "";
        status.textContent = "Simulating…";
        results.hidden = true;
        setTimeout(function () {
          if (current !== token) return;
          try {
            renderConvergence(simulateConvergence(config));
            results.hidden = false;
            status.textContent = "Simulated " + fmtInt(config.simulations) +
              " paths of length " + fmtInt(config.n) + " from " +
              DISTRIBUTIONS[config.distribution].label + ".";
          } catch (caught) {
            error.textContent = "The simulation could not be completed: " + caught.message;
            status.textContent = "";
          }
        }, 20);
      }
      convergenceForm.addEventListener("submit", function (event) {
        event.preventDefault();
        runConvergence();
      });
      document.getElementById("newSeed").addEventListener("click", function () {
        document.getElementById("seed").value = String(
          Math.floor(Math.random() * 999999999) + 1,
        );
        runConvergence();
      });
      runConvergence();
    }

    const bayesForm = document.getElementById("bayesForm");
    if (bayesForm) {
      bayesForm.addEventListener("submit", function (event) {
        event.preventDefault();
        runBayes();
      });
      runBayes();
    }

    const testForm = document.getElementById("testForm");
    if (testForm) {
      testForm.addEventListener("submit", function (event) {
        event.preventDefault();
        runTest();
      });
      runTest();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
