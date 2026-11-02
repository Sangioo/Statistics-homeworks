// Homework 4: Welford's algorithm, experiment, and browser controls. No dependencies.
(function () {
  'use strict';
  const FIXED_SEED = 42;
  const accumulator = () => ({n: 0, mu: 0, ss: 0});
  function update(state, x) {
    const delta = x - state.mu;
    state.mu += delta / ++state.n;
    state.ss += delta * (x - state.mu);
  }
  const sampleVariance = state => state.n > 1 ? state.ss / (state.n - 1) : null;
  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function validate({n, m}) {
    for (const [value, min, max, name] of [[n, 2, 10000, 'Systems n'], [m, 2, 5000, 'Hackers m']]) {
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`);
      }
    }
  }
  // Yield every 25 hackers so large experiments do not freeze the controls.
  function* experiment(settings) {
    validate(settings);
    const {n, m} = settings;
    const checkpoints = [...new Set([2, 5, 10, 30, 100, 300, 1000, 3000, 10000].filter(k => k <= n).concat(n))].sort((a, b) => a - b);
    const rows = checkpoints.map(k => ({n: k, means: [], variances: [], averageMean: 0, averageVariance: 0}));
    const paths = [], stride = Math.max(1, Math.ceil(n / 400));
    for (let j = 0; j < m; j++) {
      // A stream per hacker preserves prefixes when n or m changes.
      const rng = random((FIXED_SEED + Math.imul(j, 0x9e3779b9)) >>> 0);
      const state = accumulator(), path = j < 8 ? {scores: [], estimates: []} : null;
      let checkpoint = 0;
      for (let k = 1; k <= n; k++) {
        const score = Math.floor(rng() * 11);
        update(state, score);
        if (path && k <= 100) path.scores.push([k, score]);
        if (path && (k <= 2 || k % stride === 0 || k === n)) {
          path.estimates.push({k, mu: state.mu, variance: sampleVariance(state)});
        }
        if (k === checkpoints[checkpoint]) {
          const row = rows[checkpoint++], variance = sampleVariance(state);
          row.means.push(state.mu);
          row.variances.push(variance);
          row.averageMean += (state.mu - row.averageMean) / (j + 1);
          row.averageVariance += (variance - row.averageVariance) / (j + 1);
        }
      }
      if (path) paths.push(path);
      if ((j + 1) % 25 === 0) yield {completed: j + 1};
    }
    return {settings: {n, m}, rows, paths};
  }
  // Fixed bins and axes allow honest comparisons across n, including edge values.
  function histogram(values, max, count = 30) {
    const bins = Array(count).fill(0);
    for (const value of values) bins[Math.max(0, Math.min(count - 1, Math.floor(value / max * count)))]++;
    return bins.map(total => total / values.length);
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = {accumulator, update, sampleVariance, experiment, histogram};
  }
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const colors = ['#235da6', '#8b3e88', '#237660', '#b54747', '#7362ae', '#337c95', '#815b35', '#bf5f8d'];
  const fmt = value => Number(value.toPrecision(5)).toLocaleString('en-US', {maximumFractionDigits: 6});
  let result;
  function draw(svg, tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    svg.append(node);
    return node;
  }
  function axes(id, xmin, xmax, ymax, xlabel, ylabel) {
    const svg = $(id);
    svg.replaceChildren();
    const x = value => 80 + 650 * (value - xmin) / (xmax - xmin);
    const y = value => 215 - 185 * value / ymax;
    for (let i = 0; i <= 4; i++) {
      const xv = xmin + (xmax - xmin) * i / 4, yv = ymax * i / 4;
      draw(svg, 'line', {x1: 80, x2: 730, y1: y(yv), y2: y(yv), stroke: '#e0e7ef'});
      draw(svg, 'text', {x: 70, y: y(yv) + 4, 'text-anchor': 'end', text: fmt(yv)});
      draw(svg, 'text', {x: x(xv), y: 234, 'text-anchor': 'middle', text: fmt(xv)});
    }
    draw(svg, 'text', {x: 80, y: 17, text: ylabel});
    draw(svg, 'text', {x: 405, y: 254, 'text-anchor': 'middle', text: xlabel});
    return {svg, x, y};
  }
  function line(chart, points, color, dashed = false) {
    draw(chart.svg, 'polyline', {
      points: points.map(([x, y]) => `${chart.x(x).toFixed(2)},${chart.y(y).toFixed(2)}`).join(' '),
      fill: 'none', stroke: color, 'stroke-width': dashed ? 2.5 : 1.4,
      'stroke-opacity': dashed ? 1 : 0.75, ...(dashed ? {'stroke-dasharray': '7 4'} : {})
    });
    if (points.length === 1) draw(chart.svg, 'circle', {cx: chart.x(points[0][0]), cy: chart.y(points[0][1]), r: 3, fill: color});
  }
  function trajectories(id, field, target) {
    const raw = field === 'score';
    const paths = result.paths.map(path => raw ? path.scores : path.estimates.filter(point => point[field] !== null).map(point => [point.k, point[field]]));
    const end = raw ? Math.min(result.settings.n, 100) : result.settings.n;
    let high = target;
    for (const path of paths) for (const [, value] of path) high = Math.max(high, value);
    const chart = axes(id, 1, end, field === 'variance' ? high * 1.1 : 10, 'Systems encountered k', raw ? 'Score' : 'Estimate');
    paths.forEach((path, j) => line(chart, path, colors[j]));
    line(chart, [[1, target], [end, target]], '#bc7215', true);
    chart.svg.setAttribute('aria-label', `${field === 'mu' ? 'Sample mean μⱼ,ₖ' : field} trajectories of ${paths.length} hackers through ${end} systems. Dashed reference at ${target}.`);
  }
  function distribution(id, values, max, target, label) {
    const bins = histogram(values, max);
    const chart = axes(id, 0, max, 1, label, 'Fraction of hackers');
    bins.forEach((fraction, i) => {
      const left = i * max / bins.length, right = (i + 1) * max / bins.length;
      const bar = draw(chart.svg, 'rect', {x: chart.x(left), y: chart.y(fraction),
        width: chart.x(right) - chart.x(left) - 0.5, height: chart.y(0) - chart.y(fraction), fill: '#235da6', 'fill-opacity': 0.8});
      draw(bar, 'title', {text: `[${fmt(left)}, ${fmt(right)}${i === bins.length - 1 ? ']' : ')'}: ${Math.round(fraction * values.length)} hackers (${fmt(100 * fraction)}%)`});
    });
    line(chart, [[target, 0], [target, 1]], '#bc7215', true);
    chart.svg.setAttribute('aria-label', `${label} at n = ${result.rows[Number($('checkpoint').value)].n} for ${values.length} hackers. Fixed horizontal range 0 to ${fmt(max)}; dashed reference at ${target}.`);
  }
  function endpoints() {
    const row = result.rows[Number($('checkpoint').value)];
    // For bounded [0,10] observations, SS/n <= 25, hence s² <= 25n/(n−1).
    // Use the smallest checkpoint to obtain one valid upper bound for every plot.
    const firstN = result.rows[0].n, varianceMax = 25 * firstN / (firstN - 1);
    distribution('meanHistogram', row.means, 10, 5, 'Sample mean μⱼ,ₙ');
    distribution('varianceHistogram', row.variances, varianceMax, 10, 'Sample variance');
    $('checkpointSummary').textContent = `At n = ${row.n}, the average sample mean μ̄ₙ is ${fmt(row.averageMean)} (theoretical μ = 5), and the average sample variance Bₙ is ${fmt(row.averageVariance)} (theoretical σ² = 10). Compare checkpoints to see how the distributions change.`;
  }
  function render() {
    const {n, m} = result.settings, last = result.rows.at(-1);
    $('simulationResults').hidden = false;
    $('simulationSummary').textContent = `${m.toLocaleString('en-US')} hackers × ${n.toLocaleString('en-US')} systems. Average sample mean μ̄ₙ = ${fmt(last.averageMean)} versus μ = 5 (difference ${fmt(last.averageMean - 5)}). Average sample variance Bₙ = ${fmt(last.averageVariance)} versus σ² = 10 (difference ${fmt(last.averageVariance - 10)}). Finite-run differences from the theoretical values are expected.`;
    $('momentRows').replaceChildren();
    const pair = (a, b) => `${fmt(a)} / ${fmt(b)}`;
    for (const row of result.rows) {
      const tr = document.createElement('tr'), heading = document.createElement('th');
      heading.scope = 'row'; heading.textContent = row.n.toLocaleString('en-US'); tr.append(heading);
      for (const value of [pair(row.averageMean, 5), pair(row.averageVariance, 10)]) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      $('momentRows').append(tr);
    }
    trajectories('scorePaths', 'score', 5);
    trajectories('meanPaths', 'mu', 5);
    trajectories('variancePaths', 'variance', 10);
    $('checkpoint').replaceChildren();
    result.rows.forEach((row, i) => {
      const option = document.createElement('option'); option.value = i; option.textContent = row.n.toLocaleString('en-US'); $('checkpoint').append(option);
    });
    $('checkpoint').value = result.rows.length - 1;
    endpoints();
  }
  async function run(event) {
    if (event) event.preventDefault();
    if ($('runSimulation').disabled || !$('simulationForm').reportValidity()) return;
    const settings = {n: Number($('systems').value), m: Number($('hackers').value)};
    const controls = ['systems', 'hackers', 'runSimulation'];
    controls.forEach(id => { $(id).disabled = true; });
    $('simulationResults').hidden = true;
    $('simulationError').textContent = '';
    $('simulationStatus').textContent = 'Computing scores and running estimates…';
    try {
      // Paint the busy state before beginning the first batch.
      await new Promise(resolve => setTimeout(resolve, 0));
      const iterator = experiment(settings);
      let step = iterator.next();
      while (!step.done) {
        $('simulationStatus').textContent = `Computed ${step.value.completed.toLocaleString('en-US')} of ${settings.m.toLocaleString('en-US')} hackers…`;
        await new Promise(resolve => setTimeout(resolve, 0));
        step = iterator.next();
      }
      result = step.value;
      render();
      $('simulationStatus').textContent = `Experiment complete. All ${settings.m.toLocaleString('en-US')} hackers contribute to every table and distribution.`;
    } catch (error) {
      $('simulationResults').hidden = true;
      $('simulationError').textContent = error.message;
      $('simulationStatus').textContent = 'The experiment could not finish. Check the settings and try again.';
    } finally {
      controls.forEach(id => { $(id).disabled = false; });
    }
  }
  $('simulationForm').addEventListener('submit', run);
  $('checkpoint').addEventListener('change', endpoints);
  run();
})();
