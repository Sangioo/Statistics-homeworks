// Homework 6: contingency tables, conditional/marginal frequencies, and the
// Pearson chi-square test of independence. No dependencies.
(function () {
  "use strict";

  const ALPHA = 0.05;
  const MAX_OBSERVATIONS = 20000;
  const MAX_LEVELS = 12;
  const CONTROL_SEED = 2026;

  const RECORDED_DATA = {
    xLevels: ["Phishing", "Credential stuffing", "Exposed service", "Supply chain"],
    fLevels: ["Under 1 hour", "1–24 hours", "Over 24 hours"],
    counts: [
      [120, 60, 20],
      [70, 60, 20],
      [50, 80, 50],
      [20, 40, 10],
    ],
  };
  const ROW_WEIGHTS = RECORDED_DATA.counts.map((row) =>
    row.reduce((sum, value) => sum + value, 0),
  );
  const COLUMN_WEIGHTS = Array.from(
    { length: RECORDED_DATA.fLevels.length },
    (_, j) => RECORDED_DATA.counts.reduce((sum, row) => sum + row[j], 0),
  );

  const SAMPLE_LEVELS = {
    x: ["Phishing", "Credential stuffing", "Exposed service"],
    f: ["Under 1 hour", "1–24 hours", "Over 24 hours"],
    counts: [
      [18, 6, 2],
      [8, 10, 4],
      [4, 8, 12],
    ],
  };

  // ---------------------------------------------------------------------------
  // Special functions and chi-square distribution
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
    for (let i = 1; i < LANCZOS_G + 2; i++) series += LANCZOS_COEFFICIENTS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(series);
  }

  // Regularized upper incomplete gamma Q(s, x), used for the chi-square tail.
  function gammaQ(s, x) {
    if (!(s > 0) || x < 0 || Number.isNaN(x)) return NaN;
    if (x === 0) return 1;
    if (x < s + 1) {
      let sum = 1 / s;
      let term = sum;
      let n = s;
      for (let i = 1; i < 1000; i++) {
        n += 1;
        term *= x / n;
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
      }
      return Math.min(1, Math.max(0, 1 - sum * Math.exp(-x + s * Math.log(x) - logGamma(s))));
    }
    const tiny = 1e-300;
    let b = x + 1 - s;
    let c = 1 / tiny;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - s);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-15) break;
    }
    return Math.min(1, Math.max(0, Math.exp(-x + s * Math.log(x) - logGamma(s)) * h));
  }

  function chiSquareSurvival(x, df) {
    if (!(df > 0) || x < 0) return NaN;
    return gammaQ(df / 2, x / 2);
  }

  function chiSquareCdf(x, df) {
    return 1 - chiSquareSurvival(x, df);
  }

  function chiSquarePdf(x, df) {
    if (!(df > 0) || x < 0) return 0;
    if (x === 0) {
      if (df === 2) return 0.5;
      return df > 2 ? 0 : Infinity;
    }
    return Math.exp(
      (df / 2 - 1) * Math.log(x) -
        x / 2 -
        (df / 2) * Math.log(2) -
        logGamma(df / 2),
    );
  }

  function chiSquareCritical(df, alpha) {
    let low = 0;
    let high = Math.max(df, 1);
    while (chiSquareSurvival(high, df) > alpha) high *= 2;
    for (let i = 0; i < 200; i++) {
      const middle = (low + high) / 2;
      if (chiSquareSurvival(middle, df) > alpha) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }

  // ---------------------------------------------------------------------------
  // Data construction and contingency analysis
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

  function pickWeighted(weights, value) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i] / total;
      if (value < cumulative) return i;
    }
    return weights.length - 1;
  }

  function createIndependentObservations(levelsX, levelsF, weightsX, weightsF, n, seed) {
    const rng = mulberry32(seed);
    const observations = [];
    for (let k = 0; k < n; k++) {
      const x = levelsX[pickWeighted(weightsX, rng())];
      const f = levelsF[pickWeighted(weightsF, rng())];
      observations.push([x, f]);
    }
    return observations;
  }

  function expandCounts(levelsX, levelsF, counts) {
    const observations = [];
    counts.forEach((row, i) => {
      row.forEach((value, j) => {
        for (let k = 0; k < value; k++) observations.push([levelsX[i], levelsF[j]]);
      });
    });
    return observations;
  }

  function orderedLevels(observedLevels, preferredLevels) {
    const result = [];
    const seen = new Set();
    const observed = new Set(observedLevels);
    for (const level of preferredLevels || []) {
      if (observed.has(level) && !seen.has(level)) {
        result.push(level);
        seen.add(level);
      }
    }
    for (const level of observedLevels) {
      if (!seen.has(level)) {
        result.push(level);
        seen.add(level);
      }
    }
    return result;
  }

  function buildContingencyTable(observations, preferred = {}) {
    if (!Array.isArray(observations) || observations.length === 0) {
      throw new Error("The dataset is empty. Supply at least one pair (X, F).");
    }
    if (observations.length > MAX_OBSERVATIONS) {
      throw new Error(`The dataset has more than ${MAX_OBSERVATIONS.toLocaleString("en-US")} observations.`);
    }

    const observedX = [];
    const observedF = [];
    const seenX = new Set();
    const seenF = new Set();
    const pairs = [];

    for (const pair of observations) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error("Every observation must contain exactly two values, X and F.");
      }
      const x = String(pair[0]).trim();
      const f = String(pair[1]).trim();
      if (!x || !f) throw new Error("Every observation must have a non-empty X value and a non-empty F value.");
      if (!seenX.has(x)) {
        if (observedX.length >= MAX_LEVELS) {
          throw new Error(`X has more than ${MAX_LEVELS} levels. Combine rare categories or relabel the data.`);
        }
        seenX.add(x);
        observedX.push(x);
      }
      if (!seenF.has(f)) {
        if (observedF.length >= MAX_LEVELS) {
          throw new Error(`F has more than ${MAX_LEVELS} levels. Combine rare categories or relabel the data.`);
        }
        seenF.add(f);
        observedF.push(f);
      }
      pairs.push([x, f]);
    }

    if (observedX.length < 2 || observedF.length < 2) {
      throw new Error("Both variables need at least two observed levels for an independence test.");
    }

    const levelsX = orderedLevels(observedX, preferred.xLevels);
    const levelsF = orderedLevels(observedF, preferred.fLevels);
    const indexX = new Map(levelsX.map((level, i) => [level, i]));
    const indexF = new Map(levelsF.map((level, i) => [level, i]));
    const counts = Array.from({ length: levelsX.length }, () => Array(levelsF.length).fill(0));
    for (const [x, f] of pairs) counts[indexX.get(x)][indexF.get(f)]++;
    return { levelsX, levelsF, counts };
  }

  function analyzeContingency(levelsX, levelsF, counts) {
    if (!Array.isArray(levelsX) || !Array.isArray(levelsF) || !Array.isArray(counts)) {
      throw new Error("The contingency table is malformed.");
    }
    const r = levelsX.length;
    const c = levelsF.length;
    if (r < 2 || c < 2) {
      throw new Error("Both variables need at least two observed levels for an independence test.");
    }
    if (counts.length !== r || counts.some((row) => !Array.isArray(row) || row.length !== c)) {
      throw new Error("The contingency table must have one row per X level and one column per F level.");
    }

    let n = 0;
    for (const row of counts) {
      for (const value of row) {
        if (!Number.isInteger(value) || value < 0) {
          throw new Error("Contingency-table counts must be non-negative whole numbers.");
        }
        n += value;
      }
    }
    if (n === 0) throw new Error("The contingency table is empty.");

    const rowTotals = counts.map((row) => row.reduce((sum, value) => sum + value, 0));
    const columnTotals = Array.from({ length: c }, (_, j) =>
      counts.reduce((sum, row) => sum + row[j], 0),
    );
    if (rowTotals.some((value) => value === 0) || columnTotals.some((value) => value === 0)) {
      throw new Error("Every X level and every F level must occur at least once.");
    }

    const expected = counts.map((row, i) =>
      row.map((_, j) => (rowTotals[i] * columnTotals[j]) / n),
    );
    const contributions = counts.map((row, i) =>
      row.map((value, j) => {
        const difference = value - expected[i][j];
        return (difference * difference) / expected[i][j];
      }),
    );
    const rowContributions = contributions.map((row) =>
      row.reduce((sum, value) => sum + value, 0),
    );
    const columnContributions = Array.from({ length: c }, (_, j) =>
      contributions.reduce((sum, row) => sum + row[j], 0),
    );
    const chiSquare = rowContributions.reduce((sum, value) => sum + value, 0);
    const df = (r - 1) * (c - 1);
    const pValue = Math.min(1, Math.max(0, chiSquareSurvival(chiSquare, df)));
    const cramersV = Math.min(
      1,
      Math.sqrt(chiSquare / (n * Math.min(r - 1, c - 1))),
    );

    const joint = counts.map((row) => row.map((value) => value / n));
    const rowConditional = counts.map((row, i) =>
      row.map((value) => value / rowTotals[i]),
    );
    const columnConditional = counts.map((row) =>
      row.map((value, j) => value / columnTotals[j]),
    );

    let minimumExpected = Infinity;
    let smallExpectedCells = 0;
    let expectedBelowOne = 0;
    for (const row of expected) {
      for (const value of row) {
        minimumExpected = Math.min(minimumExpected, value);
        if (value < 5) smallExpectedCells++;
        if (value < 1) expectedBelowOne++;
      }
    }

    return {
      levelsX,
      levelsF,
      counts,
      n,
      rowTotals,
      columnTotals,
      expected,
      contributions,
      rowContributions,
      columnContributions,
      chiSquare,
      df,
      pValue,
      cramersV,
      joint,
      rowConditional,
      columnConditional,
      minimumExpected,
      smallExpectedCells,
      expectedBelowOne,
      cellCount: r * c,
    };
  }

  function analyzeObservations(observations, preferred) {
    const table = buildContingencyTable(observations, preferred);
    return analyzeContingency(table.levelsX, table.levelsF, table.counts);
  }

  // ---------------------------------------------------------------------------
  // Custom data parsing
  // ---------------------------------------------------------------------------

  function countDelimiters(line, delimiter) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const character = line[i];
      if (character === '"') {
        if (quoted && line[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && character === delimiter) {
        count++;
      }
    }
    return count;
  }

  function splitDelimitedLine(line, delimiter) {
    const fields = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const character = line[i];
      if (quoted) {
        if (character === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (character === '"') {
          quoted = false;
        } else {
          current += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  function detectDelimiter(line) {
    const candidates = [",", ";", "\t"];
    let best = null;
    let bestCount = 0;
    for (const candidate of candidates) {
      const count = countDelimiters(line, candidate);
      if (count > bestCount) {
        best = candidate;
        bestCount = count;
      }
    }
    if (!best || bestCount === 0) {
      throw new Error("Could not find two columns. Separate X and F with a comma, semicolon or tab.");
    }
    return best;
  }

  function parseObservations(text, hasHeader) {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Paste a two-column dataset first. Each row should contain one pair (X, F).");
    }
    const entries = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line, index) => ({ text: line.trim(), number: index + 1 }))
      .filter((entry) => entry.text && !entry.text.startsWith("#"));
    if (entries.length === 0) {
      throw new Error("The dataset contains no data rows after blank lines and comments are removed.");
    }

    const delimiter = detectDelimiter(entries[0].text);
    if (hasHeader) entries.shift();
    if (entries.length === 0) {
      throw new Error("The dataset contains only a header row.");
    }
    if (entries.length > MAX_OBSERVATIONS) {
      throw new Error(`The dataset has more than ${MAX_OBSERVATIONS.toLocaleString("en-US")} data rows.`);
    }

    const observations = entries.map((entry) => {
      const fields = splitDelimitedLine(entry.text, delimiter);
      if (fields.length !== 2) {
        throw new Error(`Line ${entry.number}: expected exactly two values (X and F), found ${fields.length}.`);
      }
      if (!fields[0] || !fields[1]) {
        throw new Error(`Line ${entry.number}: both X and F must be non-empty.`);
      }
      return [fields[0], fields[1]];
    });

    const table = buildContingencyTable(observations);
    if (table.levelsX.length > MAX_LEVELS || table.levelsF.length > MAX_LEVELS) {
      throw new Error(`Each variable may have at most ${MAX_LEVELS} levels.`);
    }
    return observations;
  }

  function createSampleCsv() {
    const rows = ["X,F"];
    SAMPLE_LEVELS.counts.forEach((row, i) => {
      row.forEach((count, j) => {
        for (let k = 0; k < count; k++) rows.push(`${SAMPLE_LEVELS.x[i]},${SAMPLE_LEVELS.f[j]}`);
      });
    });
    return rows.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  const SUPERSCRIPTS = {
    "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  };

  function formatCount(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatDecimal(value, digits = 3) {
    return value.toFixed(digits);
  }

  function formatPercent(value) {
    return `${(100 * value).toFixed(2)}%`;
  }

  function formatP(value) {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return "< 10⁻³⁰⁰";
    if (value >= 0.001) return value.toFixed(4);
    const [mantissa, exponent] = value.toExponential(2).split("e");
    const superscript = String(Number(exponent))
      .split("")
      .map((character) => SUPERSCRIPTS[character] || character)
      .join("");
    return `${mantissa} × 10${superscript}`;
  }

  function formatSigned(value) {
    if (Math.abs(value) < 0.005) return "0.00";
    return `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)}`;
  }

  function formatTick(value) {
    if (value === 0) return "0";
    if (Math.abs(value) >= 10) return value.toFixed(0);
    if (Math.abs(value) >= 1) return value.toFixed(1);
    return value.toFixed(3);
  }

  function describeEffect(value) {
    if (value < 0.1) return "negligible";
    if (value < 0.2) return "weak";
    if (value < 0.3) return "modest";
    if (value < 0.5) return "moderate";
    return "strong";
  }

  // ---------------------------------------------------------------------------
  // Bundled data
  // ---------------------------------------------------------------------------

  const recordedObservations = expandCounts(
    RECORDED_DATA.xLevels,
    RECORDED_DATA.fLevels,
    RECORDED_DATA.counts,
  );
  const independentObservations = createIndependentObservations(
    RECORDED_DATA.xLevels,
    RECORDED_DATA.fLevels,
    ROW_WEIGHTS,
    COLUMN_WEIGHTS,
    600,
    CONTROL_SEED,
  );

  if (typeof module === "object" && module.exports) {
    module.exports = {
      logGamma,
      gammaQ,
      chiSquareSurvival,
      chiSquareCdf,
      chiSquarePdf,
      chiSquareCritical,
      buildContingencyTable,
      analyzeContingency,
      analyzeObservations,
      parseObservations,
      createIndependentObservations,
      createSampleCsv,
      formatP,
      RECORDED_DATA,
      CONTROL_SEED,
      recordedObservations,
      independentObservations,
    };
  }
  if (typeof document === "undefined") return;

  // ---------------------------------------------------------------------------
  // Page rendering
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  function paragraph(text) {
    const element = document.createElement("p");
    element.textContent = text;
    return element;
  }

  function appendCell(row, tag, text, options = {}) {
    const cell = document.createElement(tag);
    if (options.scope) cell.scope = options.scope;
    if (options.strong) {
      const strong = document.createElement("strong");
      strong.textContent = text;
      cell.append(strong);
    } else {
      cell.textContent = text;
    }
    row.append(cell);
    return cell;
  }

  function renderMatrixTable(table, caption, levelsX, levelsF, cellText, options = {}) {
    const {
      rowTotalText,
      columnTotalText,
      grandTotalText,
      totalHeader = "Row total",
      totalRowHeader = "Column total",
      corner = "X \\ F",
    } = options;
    table.querySelector("caption").textContent = caption;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    thead.replaceChildren();
    tbody.replaceChildren();

    const headRow = document.createElement("tr");
    appendCell(headRow, "th", corner, { scope: "col" });
    for (const label of levelsF) appendCell(headRow, "th", label, { scope: "col" });
    if (rowTotalText) appendCell(headRow, "th", totalHeader, { scope: "col" });
    thead.append(headRow);

    levelsX.forEach((label, i) => {
      const row = document.createElement("tr");
      appendCell(row, "th", label, { scope: "row" });
      levelsF.forEach((_, j) => appendCell(row, "td", cellText(i, j)));
      if (rowTotalText) appendCell(row, "td", rowTotalText(i), { strong: true });
      tbody.append(row);
    });

    if (columnTotalText) {
      const row = document.createElement("tr");
      appendCell(row, "th", totalRowHeader, { scope: "row" });
      levelsF.forEach((_, j) => appendCell(row, "td", columnTotalText(j), { strong: true }));
      if (rowTotalText) appendCell(row, "td", grandTotalText ?? "", { strong: true });
      tbody.append(row);
    }
  }

  function drawSvg(svg, tag, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
    svg.append(node);
    return node;
  }

  function drawChiSquarePlot(result) {
    const svg = $("chiPlot");
    svg.replaceChildren();
    const degrees = result.df === 1 ? "degree of freedom" : "degrees of freedom";
    const width = 760;
    const height = 320;
    const margin = { left: 64, right: 24, top: 44, bottom: 50 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const critical = chiSquareCritical(result.df, ALPHA);
    const observed = result.chiSquare;
    const xMax = Math.max(observed * 1.15, critical * 1.5, result.df * 3, 6);
    const steps = 260;
    let yMax = 0;
    const x = (value) => margin.left + (value / xMax) * plotWidth;
    const y = (value) => margin.top + plotHeight - (value / yMax) * plotHeight;

    const points = [];
    const startIndex = result.df === 1 ? 1 : 0;
    for (let i = startIndex; i <= steps; i++) {
      const value = (xMax * i) / steps;
      const density = chiSquarePdf(value, result.df);
      const finiteDensity = Number.isFinite(density) ? density : 0;
      points.push([value, finiteDensity]);
      yMax = Math.max(yMax, finiteDensity);
    }
    yMax = Math.max(yMax * 1.15, 0.001);

    const shade = [];
    if (observed < xMax) {
      for (let i = 0; i <= steps; i++) {
        const value = observed + ((xMax - observed) * i) / steps;
        const density = chiSquarePdf(value, result.df);
        shade.push([x(value), y(Number.isFinite(density) ? density : 0)]);
      }
      shade.push([x(xMax), y(0)]);
      shade.push([x(observed), y(0)]);
      drawSvg(svg, "polygon", {
        points: shade.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" "),
        fill: "#235da6",
        "fill-opacity": 0.18,
        stroke: "none",
      });
    }

    for (let i = 0; i <= 4; i++) {
      const tick = (xMax * i) / 4;
      const tickY = margin.top + plotHeight - (plotHeight * i) / 4;
      drawSvg(svg, "line", {
        x1: margin.left, x2: margin.left + plotWidth,
        y1: tickY, y2: tickY,
        stroke: "#e0e7ef",
      });
      drawSvg(svg, "line", {
        x1: x(tick), x2: x(tick),
        y1: margin.top, y2: margin.top + plotHeight,
        stroke: "#e0e7ef",
      });
      drawSvg(svg, "text", {
        x: margin.left - 8, y: tickY + 4,
        "text-anchor": "end",
        text: formatTick((yMax * i) / 4),
      });
      drawSvg(svg, "text", {
        x: x(tick), y: margin.top + plotHeight + 18,
        "text-anchor": "middle",
        text: formatTick(tick),
      });
    }

    drawSvg(svg, "line", {
      x1: margin.left, x2: margin.left,
      y1: margin.top, y2: margin.top + plotHeight,
      stroke: "#9aaac0",
    });
    drawSvg(svg, "line", {
      x1: margin.left, x2: margin.left + plotWidth,
      y1: margin.top + plotHeight, y2: margin.top + plotHeight,
      stroke: "#9aaac0",
    });

    drawSvg(svg, "polyline", {
      points: points.map(([value, density]) => `${x(value).toFixed(2)},${y(density).toFixed(2)}`).join(" "),
      fill: "none",
      stroke: "#235da6",
      "stroke-width": 2,
    });

    drawSvg(svg, "line", {
      x1: x(observed), x2: x(observed),
      y1: margin.top, y2: margin.top + plotHeight,
      stroke: "#b02f3b",
      "stroke-width": 2,
    });
    drawSvg(svg, "line", {
      x1: x(critical), x2: x(critical),
      y1: margin.top, y2: margin.top + plotHeight,
      stroke: "#bc7215",
      "stroke-width": 1.5,
      "stroke-dasharray": "6 4",
    });

    const observedAnchor = x(observed) > width - 150 ? "end" : "start";
    drawSvg(svg, "text", {
      x: x(observed) + (observedAnchor === "end" ? -6 : 6),
      y: 18,
      "text-anchor": observedAnchor,
      fill: "#9b2333",
      "font-weight": 700,
      text: `χ² observed = ${formatDecimal(observed, 3)}`,
    });
    drawSvg(svg, "text", {
      x: x(critical),
      y: 34,
      "text-anchor": "middle",
      fill: "#8a5a10",
      text: `5% critical = ${formatDecimal(critical, 3)}`,
    });
    drawSvg(svg, "text", {
      x: 14,
      y: margin.top + plotHeight / 2,
      transform: `rotate(-90 14 ${margin.top + plotHeight / 2})`,
      "text-anchor": "middle",
      text: "Density",
    });
    drawSvg(svg, "text", {
      x: margin.left + plotWidth / 2,
      y: height - 8,
      "text-anchor": "middle",
      text: `χ² with ${result.df} ${degrees}`,
    });
    svg.setAttribute(
      "aria-label",
      `Chi-square null distribution with ${result.df} ${degrees}. Observed statistic ${formatDecimal(observed, 3)}, 5% critical value ${formatDecimal(critical, 3)}, p-value ${formatP(result.pValue)}.`,
    );
  }

  function renderSummary(result, sourceLabel) {
    const container = $("analysisSummary");
    container.replaceChildren();
    const decision = result.pValue < ALPHA ? "reject" : "fail to reject";
    container.append(
      paragraph(
        `${sourceLabel}: n = ${formatCount(result.n)}, ${result.levelsX.length} × ${result.levelsF.length} table. ` +
          `Pearson χ² = ${formatDecimal(result.chiSquare, 3)}, df = ${result.df}, p = ${formatP(result.pValue)}; ` +
          `Cramér's V = ${formatDecimal(result.cramersV, 3)} (${describeEffect(result.cramersV)} association). ` +
          `At the 5% level we ${decision} H₀.`,
      ),
    );
    if (result.smallExpectedCells > 0) {
      container.append(
        paragraph(
          `Caution: ${result.smallExpectedCells} of ${result.cellCount} expected counts are below 5 (minimum ${formatDecimal(result.minimumExpected, 2)}); the chi-square approximation may be unreliable.`,
        ),
      );
    } else {
      container.append(
        paragraph(
          `The smallest expected count is ${formatDecimal(result.minimumExpected, 2)}, so the usual expected-count guideline is satisfied.`,
        ),
      );
    }
    if (result.pValue >= ALPHA) {
      container.append(
        paragraph(
          "Failure to reject is not proof of independence; a small sample or a weak association can conceal dependence.",
        ),
      );
    }
  }

  function renderInterpretation(result) {
    const container = $("analysisInterpretation");
    container.replaceChildren();
    const cells = [];
    result.counts.forEach((row, i) => {
      row.forEach((count, j) => {
        cells.push({
          i, j, count,
          expected: result.expected[i][j],
          contribution: result.contributions[i][j],
        });
      });
    });
    cells.sort((a, b) => b.contribution - a.contribution);
    const top = cells[0];
    container.append(
      paragraph(
        `The largest contribution is ${result.levelsX[top.i]} / ${result.levelsF[top.j]} ` +
          `(observed ${formatCount(top.count)}, expected ${formatDecimal(top.expected, 2)}, ` +
          `difference ${formatSigned(top.count - top.expected)}, contribution ${formatDecimal(top.contribution, 3)}). ` +
          `Positive differences are over-represented relative to independence; negative differences are under-represented.`,
      ),
    );
    container.append(
      paragraph(
        `The test describes where the sample departs from independence, not why. With n = ${formatCount(result.n)}, ` +
          `a small p-value can accompany a modest Cramér's V; significance, effect size and causation are separate questions.`,
      ),
    );
  }

  function renderAnalysis(result, sourceLabel) {
    $("analysisResults").hidden = false;
    renderSummary(result, sourceLabel);

    renderMatrixTable(
      $("observedTable"),
      `Observed counts and marginal totals: ${sourceLabel}.`,
      result.levelsX,
      result.levelsF,
      (i, j) => formatCount(result.counts[i][j]),
      {
        rowTotalText: (i) => formatCount(result.rowTotals[i]),
        columnTotalText: (j) => formatCount(result.columnTotals[j]),
        grandTotalText: formatCount(result.n),
      },
    );

    renderMatrixTable(
      $("rowConditionalTable"),
      `Row-conditional frequencies P(F = c_j | X = x_i): ${sourceLabel}.`,
      result.levelsX,
      result.levelsF,
      (i, j) => formatPercent(result.rowConditional[i][j]),
      {
        rowTotalText: (i) => formatCount(result.rowTotals[i]),
        columnTotalText: (j) => formatPercent(result.columnTotals[j] / result.n),
        grandTotalText: formatCount(result.n),
        totalHeader: "Row n",
        totalRowHeader: "Marginal P(F)",
      },
    );

    renderMatrixTable(
      $("expectedTable"),
      `Expected counts e_ij = f_i· f_·j / n under independence: ${sourceLabel}.`,
      result.levelsX,
      result.levelsF,
      (i, j) => formatDecimal(result.expected[i][j], 2),
      {
        rowTotalText: (i) => formatCount(result.rowTotals[i]),
        columnTotalText: (j) => formatCount(result.columnTotals[j]),
        grandTotalText: formatCount(result.n),
      },
    );

    drawChiSquarePlot(result);
    $("chiPlotNote").textContent =
      `For this table, df = ${result.df} and the 5% critical value is ${formatDecimal(chiSquareCritical(result.df, ALPHA), 3)}. ` +
      `The observed statistic is ${formatDecimal(result.chiSquare, 3)} and p = ${formatP(result.pValue)}. ` +
      `The shaded area is computed from the chi-square distribution; it is not a resampling estimate.`;
    renderInterpretation(result);
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  const DATASET_LABELS = {
    recorded: "Illustrative incident sample",
    independent: `Seeded independent sample (seed ${CONTROL_SEED})`,
    custom: "Custom bivariate dataset",
  };

  function updateSourceVisibility() {
    $("customData").hidden = $("dataSource").value !== "custom";
  }

  function runAnalysis(event) {
    if (event) event.preventDefault();
    $("analysisError").textContent = "";
    try {
      const source = $("dataSource").value;
      let observations;
      let label;
      if (source === "recorded") {
        observations = recordedObservations;
        label = DATASET_LABELS.recorded;
      } else if (source === "independent") {
        observations = independentObservations;
        label = DATASET_LABELS.independent;
      } else {
        observations = parseObservations($("csvInput").value, $("hasHeader").checked);
        label = DATASET_LABELS.custom;
      }
      const preferred = source === "custom"
        ? undefined
        : { xLevels: RECORDED_DATA.xLevels, fLevels: RECORDED_DATA.fLevels };
      const result = analyzeObservations(observations, preferred);
      renderAnalysis(result, label);
      $("analysisStatus").textContent = `Analysis complete: ${label}, n = ${formatCount(result.n)}.`;
    } catch (error) {
      $("analysisResults").hidden = true;
      $("analysisError").textContent = error.message;
      $("analysisStatus").textContent = "The dataset could not be analysed.";
    }
  }

  $("analysisForm").addEventListener("submit", runAnalysis);
  $("dataSource").addEventListener("change", () => {
    updateSourceVisibility();
    if ($("dataSource").value === "custom") {
      $("analysisResults").hidden = true;
      $("analysisError").textContent = "";
      $("analysisStatus").textContent =
        "Paste observations or load the example, then select “Analyse dataset”.";
    } else {
      runAnalysis();
    }
  });
  $("loadSample").addEventListener("click", () => {
    $("dataSource").value = "custom";
    updateSourceVisibility();
    $("analysisResults").hidden = true;
    $("csvInput").value = createSampleCsv();
    $("hasHeader").checked = true;
    $("analysisError").textContent = "";
    $("analysisStatus").textContent = "Example loaded. Select “Analyse dataset” to run the test.";
  });

  updateSourceVisibility();
  runAnalysis();
})();
