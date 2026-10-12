// Homework 1 only: arithmetic on y² = x³ + 7 over integers modulo 17.
(() => {
  const p = 17;
  const G = [1, 5];
  const $ = id => document.getElementById(id);
  const mod = n => ((n % p) + p) % p;
  const point = P => P === null ? 'O' : `(${P[0]}, ${P[1]})`;
  const inverse = n => {
    for (let i = 1; i < p; i++) if (mod(n * i) === 1) return i;
    throw new Error('No modular inverse');
  };
  function add(P, R) {
    if (P === null) return R;
    if (R === null) return P;
    const [x1, y1] = P, [x2, y2] = R;
    if (x1 === x2 && mod(y1 + y2) === 0) return null;
    const same = x1 === x2 && y1 === y2;
    const slope = same
      ? mod(3 * x1 * x1 * inverse(2 * y1))
      : mod((y2 - y1) * inverse(x2 - x1));
    const x3 = mod(slope * slope - x1 - x2);
    return [x3, mod(slope * (x1 - x3) - y1)];
  }
  const points = [];
  let current = null;
  for (let k = 1; k <= 8; k++) {
    current = add(current, G);
    points.push(current);
  }
  let selectedKey = null;
  let shownStep = 1;
  let animationTimer = null;
  const svgNS = 'http://www.w3.org/2000/svg';
  function draw(name, attributes, parent = $('curvePlot')) {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    parent.append(node);
    return node;
  }
  function graph() {
    const plot = $('curvePlot');
    plot.replaceChildren();
    const px = x => 47 + x * 22.5;
    const py = y => 30 + (16 - y) * 22.5;
    for (let n = 0; n <= 16; n++) {
      const color = n % 4 === 0 ? '#c4ceda' : '#e8edf3';
      draw('line', {x1: px(n), y1: py(16), x2: px(n), y2: py(0), stroke: color});
      draw('line', {x1: px(0), y1: py(n), x2: px(16), y2: py(n), stroke: color});
      if (n % 4 === 0) {
        draw('text', {x: px(n), y: 410, 'text-anchor': 'middle', fill: '#53647a', 'font-size': 11, text: n});
        draw('text', {x: 34, y: py(n) + 4, 'text-anchor': 'end', fill: '#53647a', 'font-size': 11, text: n});
      }
    }
    draw('text', {x: 423, y: 410, fill: '#17243a', text: 'x'});
    draw('text', {x: 30, y: 22, fill: '#17243a', text: 'y'});
    for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) {
      if (mod(y * y - x * x * x - 7) === 0) {
        draw('circle', {cx: px(x), cy: py(y), r: 3, fill: '#adb9c8'});
      }
    }
    points.slice(0, selectedKey).forEach(([x, y], i) => {
      const circle = draw('circle', {
        cx: px(x), cy: py(y), r: shownStep === i + 1 ? 7 : 5,
        fill: shownStep === i + 1 ? '#e29a21' : '#235da6'
      });
      draw('title', {text: `${i + 1}G = (${x}, ${y})`}, circle);
      draw('text', {x: px(x) + 10, y: py(y) + (i === 5 ? 14 : -8),
        fill: '#17243a', 'font-size': 11, text: `${i + 1}G`});
    });
    const Q = points[selectedKey - 1];
    draw('circle', {cx: px(Q[0]), cy: py(Q[1]), r: 11,
      fill: 'none', stroke: '#b02f3b', 'stroke-width': 2.5});
    const P = points[shownStep - 1];
    let description = `Step ${shownStep} of ${selectedKey}: `;
    if (shownStep === 1) description += `O + G = ${point(P)}.`;
    else {
      const before = points[shownStep - 2];
      const doubling = before[0] === G[0] && before[1] === G[1];
      const slope = doubling
        ? mod(3 * before[0] * before[0] * inverse(2 * before[1]))
        : mod((G[1] - before[1]) * inverse(G[0] - before[0]));
      description += `${point(before)} + G = ${point(P)}; slope λ = ${slope} (mod 17).`;
    }
    $('graphStep').textContent = description;
    plot.setAttribute('aria-label', `${description} Public key Q = ${point(Q)}.`);
    $('previousStep').disabled = shownStep === 1;
    $('nextStep').disabled = shownStep === selectedKey;
    $('playAnimation').disabled = selectedKey === 1;
    [...$('steps').children].forEach((row, i) => row.classList.toggle('current-step', i + 1 === shownStep));
  }
  function stopAnimation() {
    clearInterval(animationTimer);
    animationTimer = null;
    $('playAnimation').textContent = 'Play animation';
    $('playAnimation').setAttribute('aria-pressed', 'false');
  }
  function toggleAnimation() {
    if (animationTimer !== null) {
      stopAnimation();
      return;
    }
    if (shownStep === selectedKey) {
      shownStep = 1;
      graph();
    }
    $('playAnimation').textContent = 'Pause animation';
    $('playAnimation').setAttribute('aria-pressed', 'true');
    animationTimer = setInterval(() => {
      shownStep++;
      graph();
      if (shownStep === selectedKey) stopAnimation();
    }, 1000);
  }
  const bits = n => n.toString(2).padStart(5, '0');
  function table(id, rows) {
    const body = $(id);
    body.replaceChildren();
    for (const cells of rows) {
      const tr = body.insertRow();
      for (const value of cells) tr.insertCell().textContent = value;
    }
  }
  function calculate() {
    const input = $('privateKey');
    const k = Number(input.value);
    if (input.value === '' || !Number.isInteger(k) || k < 1 || k > 8) {
      $('error').textContent = 'Please enter a whole number from 1 to 8.';
      return;
    }
    stopAnimation();
    $('error').textContent = '';
    $('result').textContent = `TOY PUBLIC KEY: Q = ${k}G = ${point(points[k - 1])}`;
    table('steps', points.slice(0, k).map((P, i) => [
      `${i + 1}G`, point(P)
    ]));
    selectedKey = k;
    shownStep = 1;
    graph();
    $('calculate').disabled = true;
  }
  function updateCalculateButton() {
    stopAnimation();
    $('calculate').disabled = Number($('privateKey').value) === selectedKey;
    $('error').textContent = '';
  }
  table('allPoints', points.map((P, i) => [i + 1, point(P), bits(P[0]), bits(P[1])]));
  const x = new Map(), y = new Map();
  for (const P of points) {
    x.set(P[0], (x.get(P[0]) || 0) + 1);
    y.set(P[1], (y.get(P[1]) || 0) + 1);
  }
  table('frequencies', [...new Set([...x.keys(), ...y.keys()])].sort((a, b) => a - b)
    .map(value => [value, x.get(value) || 0, y.get(value) || 0]));
  table('bitCounts', [0, 1, 2, 3, 4].map(bit => [bit,
    points.reduce((sum, P) => sum + ((P[0] >> bit) & 1), 0),
    points.reduce((sum, P) => sum + ((P[1] >> bit) & 1), 0)
  ]));
  const distances = points.slice(1).map((P, i) => {
    const before = bits(points[i][0]) + bits(points[i][1]);
    const after = bits(P[0]) + bits(P[1]);
    return [...before].filter((bit, j) => bit !== after[j]).length;
  });
  $('distances').textContent = distances.join(', ') + ' (out of 10)';
  $('calculate').addEventListener('click', calculate);
  $('privateKey').addEventListener('input', updateCalculateButton);
  $('previousStep').addEventListener('click', () => { stopAnimation(); shownStep--; graph(); });
  $('nextStep').addEventListener('click', () => { stopAnimation(); shownStep++; graph(); });
  $('playAnimation').addEventListener('click', toggleAnimation);
})();
