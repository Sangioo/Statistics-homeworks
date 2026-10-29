// Homework 3 controls and charts.
(() => {
  'use strict';
  const P = window.Penetration, $ = id => document.getElementById(id);
  const ns = 'http://www.w3.org/2000/svg';
  const colors = ['#235da6', '#8b3e88', '#237660', '#b54747', '#7362ae', '#337c95', '#815b35', '#bf5f8d', '#558b2f', '#455a64', '#6a4296', '#007c91'];
  let result;
  const fmt = value => value === 0 ? '0' : Math.abs(value) < 0.001 ? value.toExponential(2) : Number(value.toPrecision(4)).toLocaleString('en-US', {maximumFractionDigits: 6});
  function draw(svg, tag, attributes) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    svg.append(node);
    return node;
  }
  function axes(id, xmin, xmax, ymin, ymax, xlabel, ylabel) {
    const svg = $(id);
    svg.replaceChildren();
    if (xmin === xmax) { xmin -= 0.5; xmax += 0.5; }
    if (ymin === ymax) { ymin -= 0.5; ymax += 0.5; }
    const x = v => 80 + 650 * (v - xmin) / (xmax - xmin);
    const y = v => 215 - 185 * (v - ymin) / (ymax - ymin);
    for (let i = 0; i <= 4; i++) {
      const xv = xmin + (xmax - xmin) * i / 4, yv = ymin + (ymax - ymin) * i / 4;
      draw(svg, 'line', {x1: 80, x2: 730, y1: y(yv), y2: y(yv), stroke: '#e0e7ef'});
      draw(svg, 'text', {x: 70, y: y(yv) + 4, 'text-anchor': 'end', text: fmt(yv)});
      draw(svg, 'text', {x: x(xv), y: 234, 'text-anchor': 'middle', text: fmt(xv)});
    }
    draw(svg, 'text', {x: 80, y: 17, text: ylabel});
    draw(svg, 'text', {x: 405, y: 254, 'text-anchor': 'middle', text: xlabel});
    return {svg, x, y};
  }
  function polyline(chart, points, color, dash = false) {
    draw(chart.svg, 'polyline', {points: points.map(([x, y]) => `${chart.x(x).toFixed(2)},${chart.y(y).toFixed(2)}`).join(' '),
      fill: 'none', stroke: color, 'stroke-width': dash ? 2.5 : 1.3,
      'stroke-opacity': dash ? 1 : 0.7, ...(dash ? {'stroke-dasharray': '7 4'} : {})});
  }
  function trajectories(id, power) {
    const paths = result.paths.map(path => path.filter(point => power === 0 || point.k > 0)
      .map(({k, score}) => [k, score / (power === 0 ? 1 : k ** power)]));
    const expected = paths[0].map(([k]) => [k, power === 0 ? result.mu * k : result.mu * k ** (1 - power)]);
    let low = Infinity, high = -Infinity;
    for (const path of [...paths, expected]) for (const [, v] of path) { low = Math.min(low, v); high = Math.max(high, v); }
    const pad = (high - low || 1) * 0.08;
    const chart = axes(id, 0, result.settings.n, low - pad, high + pad, 'Systems encountered k', 'Score');
    paths.forEach((path, i) => {
      polyline(chart, path, colors[i % colors.length]);
      if (path.length === 1) draw(chart.svg, 'circle', {cx: chart.x(path[0][0]), cy: chart.y(path[0][1]), r: 3, fill: colors[i % colors.length]});
    });
    polyline(chart, expected, '#bc7215', true);
    chart.svg.setAttribute('aria-label', `${id === 'totalPath' ? 'Total' : id === 'averagePath' ? 'Average' : 'Square-root-normalized'} scores for ${paths.length} attackers over ${result.settings.n} systems. Dashed line: theoretical mean.`);
  }
  function distribution(id, values, normal) {
    const h = P.histogram(values);
    let xmin = h.min, xmax = h.max;
    if (normal) { xmin = Math.min(xmin, normal.mean - 4 * normal.sd); xmax = Math.max(xmax, normal.mean + 4 * normal.sd); }
    const curve = normal ? Array.from({length: 201}, (_, i) => {
      const x = xmin + (xmax - xmin) * i / 200;
      return [x, Math.exp(-0.5 * ((x - normal.mean) / normal.sd) ** 2) / (normal.sd * Math.sqrt(2 * Math.PI))];
    }) : [];
    const peak = Math.max(...h.density, ...curve.map(point => point[1]));
    const chart = axes(id, xmin, xmax, 0, peak * 1.12, 'Endpoint score', 'Probability density');
    h.density.forEach((d, i) => {
      const bar = draw(chart.svg, 'rect', {x: chart.x(h.min + i * h.width), y: chart.y(d),
        width: Math.max(0, chart.x(h.min + (i + 1) * h.width) - chart.x(h.min + i * h.width) - 0.4),
        height: chart.y(0) - chart.y(d), fill: '#235da6', 'fill-opacity': 0.75});
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${fmt(h.min + i * h.width)} to ${fmt(h.min + (i + 1) * h.width)}: ${h.bins[i]} attackers; density ${fmt(d)}`;
      bar.append(title);
    });
    if (normal) polyline(chart, curve, '#bc7215', true);
    chart.svg.setAttribute('aria-label', `${values.length} endpoint scores, range ${fmt(h.min)} to ${fmt(h.max)}. Probability density histogram.${normal ? ' Orange dashed curve: normal density.' : ''}`);
  }
  function endpoints() {
    const index = Number($('checkpoint').value), n = result.checkpoints[index], values = result.endpoints[index];
    distribution('totalHistogram', values);
    distribution('averageHistogram', values.map(s => s / n));
    distribution('normalizedHistogram', values.map(s => s / Math.sqrt(n)), result.sigma2 > 0 ? {mean: result.mu * Math.sqrt(n), sd: Math.sqrt(result.sigma2)} : null);
    $('normalComparison').textContent = result.settings.model === 'rademacher'
      ? `At n = ${n.toLocaleString('en-US')}, the orange dashed curve is the standard normal N(0,1) density. The Rademacher Sₙ/√n has theoretical mean 0 and variance 1.`
      : result.sigma2 > 0
        ? `At n = ${n.toLocaleString('en-US')}, the orange dashed curve is a normal approximation with mean p√n = ${fmt(result.mu * Math.sqrt(n))} and variance p(1 − p) = ${fmt(result.sigma2)}. This is not N(0,1): the mean moves right as n increases.`
        : 'The Bernoulli score is deterministic at p = 0 or 1. The single occupied bin represents a point mass, not a continuous density; no nondegenerate normal approximation applies.';
  }
  function table(id, rows) {
    $(id).replaceChildren();
    for (const row of rows) {
      const tr = $(id).insertRow();
      for (const value of row) tr.insertCell().textContent = value;
    }
  }
  function render() {
    const {n, m, model} = result.settings, last = result.rows.at(-1);
    $('simulationResults').hidden = false;
    $('simulationSummary').textContent = `${model === 'bernoulli' ? 'Bernoulli' : 'Rademacher'}: ${m.toLocaleString('en-US')} attackers × ${n.toLocaleString('en-US')} systems. Observed aggregate score Aₙ,ₘ = ${last.aggregate.toLocaleString('en-US')} (expected ${fmt(n * m * result.mu)}; theoretical standard deviation ${fmt(Math.sqrt(n * m * result.sigma2))}). Overall score per attempt = ${fmt(last.aggregate / (n * m))}.`;
    trajectories('totalPath', 0); trajectories('averagePath', 1); trajectories('normalizedPath', 0.5);
    $('checkpoint').replaceChildren();
    result.checkpoints.forEach((n, i) => {
      const option = document.createElement('option'); option.value = i; option.textContent = n.toLocaleString('en-US'); $('checkpoint').append(option);
    });
    $('checkpoint').value = result.checkpoints.length - 1;
    endpoints();
    const pair = (a, b) => `${fmt(a)} / ${fmt(b)}`;
    table('momentRows', result.rows.map(r => [r.n, pair(r.totalMean, r.n * result.mu), pair(r.totalVariance, r.n * result.sigma2),
      pair(r.averageMean, result.mu), pair(r.averageVariance, result.sigma2 / r.n),
      pair(r.normalizedMean, Math.sqrt(r.n) * result.mu), pair(r.normalizedVariance, result.sigma2)]));
  }
  function run(event) {
    if (event) event.preventDefault();
    if (!$('simulationForm').reportValidity()) return;
    const settings = {model: $('model').value, n: Number($('systems').value), m: Number($('attackers').value),
      p: $('model').value === 'rademacher' ? 0.5 : Number($('probability').value),
      epsilon: 0.1, seed: window.crypto.getRandomValues(new Uint32Array(1))[0]};
    $('simulationError').textContent = '';
    $('runSimulation').disabled = true;
    $('simulationStatus').textContent = 'Simulating independent attacker trajectories…';
    setTimeout(() => {
      try {
        result = P.simulate(settings); render();
        $('simulationStatus').textContent = `Simulation complete. Every statistic uses all ${settings.m.toLocaleString('en-US')} attackers. Run again to generate a fresh sample.`;
      } catch (error) {
        $('simulationError').textContent = error.message;
        $('simulationStatus').textContent = 'Simulation could not run. Check the settings.';
      } finally { $('runSimulation').disabled = false; }
    }, 30);
  }
  $('model').addEventListener('change', () => { $('probability').disabled = $('model').value === 'rademacher'; });
  $('simulationForm').addEventListener('submit', run);
  $('checkpoint').addEventListener('change', endpoints);
  run();
})();
