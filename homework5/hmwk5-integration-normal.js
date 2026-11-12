// Homework 5: numerical integration and the standard normal CDF.
(function () {
	"use strict";

	const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);
	const REFERENCE_CDF = new Map([
		[-2, 0.02275013194817921],
		[-1, 0.15865525393145707],
		[0, 0.5],
		[0.5, 0.6914624612740131],
		[1, 0.8413447460685429],
		[1.645, 0.9500150944608786],
		[1.96, 0.9750021048517795],
		[2, 0.9772498680518208],
		[3, 0.9986501019683699],
	]);
	const FUNCTIONS = {
		sin: { label: "sin(x)", a: 0, b: Math.PI, exact: 2, fn: Math.sin },
		square: { label: "x²", a: 0, b: 1, exact: 1 / 3, fn: (x) => x * x },
		stepUp: {
			label: "1 if x < 0.5, 3 otherwise",
			a: 0,
			b: 1,
			exact: 2,
			fn: (x) => (x < 0.5 ? 1 : 3),
		},
		absolute: {
			label: "|x - 0.5|",
			a: 0,
			b: 1,
			exact: 0.25,
			fn: (x) => Math.abs(x - 0.5),
		},
		inverseRoot: {
			label: "1/√x",
			a: 0,
			b: 1,
			exact: 2,
			endpoint: 1e-12,
			fn: (x) => 1 / Math.sqrt(Math.max(x, 1e-300)),
		},
		stepDown: {
			label: "1 if x < 0.5, 0 otherwise",
			a: 0,
			b: 1,
			exact: 0.5,
			fn: (x) => (x < 0.5 ? 1 : 0),
		},
		sinc: {
			label: "sin(x)/x with f(0)=1",
			a: 0,
			b: Math.PI,
			exact: 1.851937051982466,
			fn: (x) => (x === 0 ? 1 : Math.sin(x) / x),
		},
		dirichlet: {
			label: "Dirichlet function",
			a: 0,
			b: 1,
			exact: 0,
			fn: () => 0,
		},
		thomae: { label: "Thomae function", a: 0, b: 1, exact: 0, fn: thomae },
	};

	function thomae(x) {
		if (x === 0) return 1;
		const denominatorLimit = 100000;
		let best = 0;
		let bestError = Infinity;
		for (let q = 1; q <= 100 && q <= denominatorLimit; q++) {
			const p = Math.round(x * q);
			const error = Math.abs(x - p / q);
			if (error < bestError) {
				bestError = error;
				best = p / q;
			}
		}
		const denominator = best === 0 ? 1 : denominator(best);
		return bestError < 1e-12 ? 1 / denominator : 0;
	}

	function denominator(value) {
		const max = 100000;
		let x = Math.abs(value),
			q = 1;
		for (
			let candidate = 1;
			candidate <= 100 && candidate <= max;
			candidate++
		) {
			if (Math.abs(x * candidate - Math.round(x * candidate)) < 1e-10) {
				q = candidate;
				break;
			}
		}
		return q;
	}

	function validateInteger(value, min, max, label) {
		if (!Number.isInteger(value) || value < min || value > max) {
			throw new Error(
				`${label} must be a whole number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}.`,
			);
		}
	}

	function riemannIntegral(definition, n) {
		validateInteger(n, 2, 200000, "Domain intervals");
		const start = performance.now();
		const width = (definition.b - definition.a) / n;
		let total = 0;
		for (let i = 0; i < n; i++) {
			const x = definition.a + (i + 0.5) * width;
			total += definition.fn(x) * width;
		}
		return { value: total, milliseconds: performance.now() - start };
	}

	function lebesgueIntegral(definition, bins, probes) {
		validateInteger(bins, 4, 500, "Range bins");
		validateInteger(probes, 100, 200000, "Preimage probes");
		const start = performance.now();
		const values = [];
		for (let i = 0; i < probes; i++) {
			const x =
				definition.a +
				((i + 0.5) * (definition.b - definition.a)) / probes;
			values.push(definition.fn(x));
		}
		let minimum = Infinity,
			maximum = -Infinity;
		for (const value of values) {
			minimum = Math.min(minimum, value);
			maximum = Math.max(maximum, value);
		}
		if (minimum === maximum)
			return {
				value: minimum * (definition.b - definition.a),
				milliseconds: performance.now() - start,
			};
		const counts = Array(bins).fill(0);
		const width = (maximum - minimum) / bins;
		for (const value of values) {
			const index = Math.min(
				bins - 1,
				Math.floor((value - minimum) / width),
			);
			counts[index]++;
		}
		let total = 0;
		for (let i = 0; i < bins; i++) {
			const midpoint = minimum + (i + 0.5) * width;
			total +=
				((midpoint * counts[i]) / probes) *
				(definition.b - definition.a);
		}
		return { value: total, milliseconds: performance.now() - start };
	}

	function normalDensity(x) {
		return Math.exp((-x * x) / 2) / SQRT_TWO_PI;
	}

	function simpsonNormalCDF(z, intervals = 1000) {
		validateInteger(intervals, 2, 200000, "Simpson subintervals");
		if (intervals % 2 !== 0) intervals++;
		const sign = z < 0 ? -1 : 1;
		const upper = Math.abs(z);
		if (upper === 0) return 0.5;
		const step = upper / intervals;
		let sum = normalDensity(0) + normalDensity(upper);
		for (let i = 1; i < intervals; i++)
			sum += (i % 2 ? 4 : 2) * normalDensity(i * step);
		const area = (step * sum) / 3;
		return 0.5 + sign * area;
	}

	function erfSeries(x, terms = 80) {
		validateInteger(terms, 1, 1000, "Erf series terms");
		let sum = 0;
		let factorial = 1;
		let power = x;
		for (let n = 0; n < terms; n++) {
			if (n > 0) factorial *= n;
			const term = ((n % 2 ? -1 : 1) * power) / (factorial * (2 * n + 1));
			sum += term;
			power *= x * x;
			if (Math.abs(term) < Number.EPSILON * Math.max(1, Math.abs(sum)))
				break;
		}
		return (2 * sum) / Math.sqrt(Math.PI);
	}

	// Abramowitz and Stegun 7.1.26: maximum error about 1.5e-7.
	function erfApproximation(x) {
		const sign = x < 0 ? -1 : 1;
		const absolute = Math.abs(x),
			t = 1 / (1 + 0.3275911 * absolute);
		const polynomial =
			((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
				0.284496736) *
				t +
				0.254829592) *
			t;
		return sign * (1 - polynomial * Math.exp(-absolute * absolute));
	}

	function erfNormalCDF(z, terms) {
		return 0.5 * (1 + erfApproximation(z / Math.sqrt(2)));
	}

	function seriesNormalCDF(z, terms) {
		return 0.5 * (1 + erfSeries(z / Math.sqrt(2), terms));
	}

	function format(value) {
		return Number(value.toPrecision(8)).toLocaleString("en-US", {
			maximumFractionDigits: 10,
		});
	}

	function integrationComparison(key, n, bins, probes) {
		const definition = FUNCTIONS[key];
		if (!definition) throw new Error("Choose a known function.");
		const riemann = riemannIntegral(definition, n);
		const lebesgue = lebesgueIntegral(definition, bins, probes);
		return {
			definition,
			exact: definition.exact,
			riemann: {
				...riemann,
				error: Math.abs(riemann.value - definition.exact),
			},
			lebesgue: {
				...lebesgue,
				error: Math.abs(lebesgue.value - definition.exact),
			},
		};
	}

	if (typeof module === "object" && module.exports) {
		module.exports = {
			FUNCTIONS,
			riemannIntegral,
			lebesgueIntegral,
			simpsonNormalCDF,
			erfSeries,
			erfApproximation,
			erfNormalCDF,
			seriesNormalCDF,
			integrationComparison,
		};
	}
	if (typeof document === "undefined") return;

	const $ = (id) => document.getElementById(id);
	const timeResult = (fn) => {
		const start = performance.now();
		const value = fn();
		return { value, milliseconds: performance.now() - start };
	};

	function renderIntegration(result) {
		$("integrationResults").hidden = false;
		$("integrationSummary").textContent =
			`${result.definition.label}: reference integral ${format(result.exact)}. The Riemann method uses domain midpoints; the Lebesgue-style method uses ${$("rangeBins").value} range bins and ${$("probeCount").value} estimated preimage probes.`;
		$("integrationRows").replaceChildren();
		for (const [name, method] of [
			["Riemann midpoint sum", result.riemann],
			["Lebesgue-style range sum", result.lebesgue],
		]) {
			const row = document.createElement("tr");
			row.innerHTML = `<th scope="row">${name}</th><td>${format(method.value)}</td><td>${format(method.error)}</td><td>${format(method.milliseconds)} ms</td>`;
			$("integrationRows").append(row);
		}
		const resolutions = [50, 100, 250, 500, 1000, 2500].filter(
			(n) => n <= Number($("domainSteps").value) * 2,
		);
		$("convergenceRows").replaceChildren();
		for (const n of [...new Set(resolutions)]) {
			const sweep = integrationComparison(
				$("functionChoice").value,
				n,
				Number($("rangeBins").value),
				Math.max(100, n * 10),
			);
			const row = document.createElement("tr");
			row.innerHTML = `<th scope="row">${n.toLocaleString("en-US")}</th><td>${format(sweep.riemann.value)}</td><td>${format(sweep.lebesgue.value)}</td><td>${format(sweep.riemann.error)}</td><td>${format(sweep.lebesgue.error)}</td>`;
			$("convergenceRows").append(row);
		}
	}

	function runIntegration(event) {
		event?.preventDefault();
		$("integrationError").textContent = "";
		try {
			const result = integrationComparison(
				$("functionChoice").value,
				Number($("domainSteps").value),
				Number($("rangeBins").value),
				Number($("probeCount").value),
			);
			renderIntegration(result);
			$("integrationStatus").textContent =
				"Integration comparison complete.";
		} catch (error) {
			$("integrationResults").hidden = true;
			$("integrationError").textContent = error.message;
			$("integrationStatus").textContent =
				"The integration comparison could not finish.";
		}
	}

	function renderNormal(z, intervals, terms) {
		const reference = REFERENCE_CDF.get(z) ?? simpsonNormalCDF(z, 100000);
		const methods = [
			["Simpson integration", () => simpsonNormalCDF(z, intervals)],
			["erf power series", () => seriesNormalCDF(z, terms)],
			["erf approximation", () => erfNormalCDF(z, terms)],
		];
		$("normalResults").hidden = false;
		$("normalSummary").textContent =
			`For z = ${format(z)}, reference Φ(z) = ${format(reference)}. The erf approximation is intended for fast repeated evaluation; Simpson integration trades more work for a direct integral.`;
		$("normalRows").replaceChildren();
		for (const [name, method] of methods) {
			const measured = timeResult(method);
			const row = document.createElement("tr");
			row.innerHTML = `<th scope="row">${name}</th><td>${format(measured.value)}</td><td>${format(Math.abs(measured.value - reference))}</td><td>${format(measured.milliseconds)} ms</td>`;
			$("normalRows").append(row);
		}
		$("normalChecks").replaceChildren();
		for (const [checkZ, checkReference] of REFERENCE_CDF) {
			const value = erfNormalCDF(checkZ, terms),
				row = document.createElement("tr");
			row.innerHTML = `<th scope="row">${checkZ}</th><td>${format(checkReference)}</td><td>${format(value)}</td><td>${format(Math.abs(value - checkReference))}</td>`;
			$("normalChecks").append(row);
		}
	}

	function runNormal(event) {
		event?.preventDefault();
		$("normalError").textContent = "";
		try {
			const z = Number($("normalZ").value),
				intervals = Number($("normalSteps").value),
				terms = Number($("seriesTerms").value);
			if (!Number.isFinite(z) || Math.abs(z) > 10)
				throw new Error("z must be finite and between -10 and 10.");
			renderNormal(z, intervals, terms);
			$("normalStatus").textContent = "Normal-CDF comparison complete.";
		} catch (error) {
			$("normalResults").hidden = true;
			$("normalError").textContent = error.message;
			$("normalStatus").textContent =
				"The normal-CDF comparison could not finish.";
		}
	}

	$("integrationForm").addEventListener("submit", runIntegration);
	$("normalForm").addEventListener("submit", runNormal);
	runIntegration();
	runNormal();
})();
