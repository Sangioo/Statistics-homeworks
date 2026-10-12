(() => {
    "use strict";
    const p = 17;
    const G = [1, 5];
    const $ = (id) => document.getElementById(id);
    let timer = null;
    let animationStep = 1;

    function mod(a, m = p) {
        return ((a % m) + m) % m;
    }
    function inverse(a, m = p) {
        a = mod(a, m);
        for (let i = 1; i < m; i++) if (mod(a * i, m) === 1) return i;
        throw new Error("No modular inverse exists.");
    }
    function samePoint(P, Q) {
        return P === null
            ? Q === null
            : Q !== null && P[0] === Q[0] && P[1] === Q[1];
    }
    function add(P, Q) {
        if (P === null) return Q;
        if (Q === null) return P;
        const [x1, y1] = P,
            [x2, y2] = Q;
        if (x1 === x2 && mod(y1 + y2) === 0) return null;
        let lambda;
        if (samePoint(P, Q)) {
            if (y1 === 0) return null;
            lambda = mod(3 * x1 * x1 * inverse(2 * y1));
        } else {
            lambda = mod((y2 - y1) * inverse(x2 - x1));
        }
        const x3 = mod(lambda * lambda - x1 - x2);
        const y3 = mod(lambda * (x1 - x3) - y1);
        return [x3, y3];
    }
    function multiply(k, P = G) {
        let result = null;
        let addend = P;
        let n = k;
        while (n > 0) {
            if (n % 2 === 1) result = add(result, addend);
            addend = add(addend, addend);
            n = Math.floor(n / 2);
        }
        return result;
    }
    function pointText(P) {
        return P === null ? "O (point at infinity)" : `(${P[0]}, ${P[1]})`;
    }
    function pointShort(P) {
        return P === null ? "O" : `(${P[0]}, ${P[1]})`;
    }
    function allMultiples() {
        const list = [];
        let current = null;
        for (let k = 1; k <= 8; k++) {
            current = add(current, G);
            list.push({ k, point: current });
        }
        return list;
    }
    const multiples = allMultiples();

    function renderSequence(k) {
        const tbody = $("sequenceTable").querySelector("tbody");
        tbody.innerHTML = "";
        for (let i = 1; i <= k; i++) {
            const P = multiply(i);
            const tr = document.createElement("tr");
            if (i === k) tr.className = "active-row";
            tr.innerHTML = `<td>${i}G</td><td class="mono">${pointShort(P)}</td><td>${i === 1 ? "Base point" : i === k ? "Toy public key" : "Add G once more"}</td>`;
            tbody.appendChild(tr);
        }
    }
    function renderAllPoints(k) {
        const tbody = $("allPointsTable").querySelector("tbody");
        tbody.innerHTML = "";
        multiples.forEach(({ k: n, point }) => {
            const tr = document.createElement("tr");
            if (n === k) tr.className = "active-row";
            const xb = point[0].toString(2).padStart(5, "0");
            const yb = point[1].toString(2).padStart(5, "0");
            tr.innerHTML = `<td>${n}</td><td class="mono">${pointShort(point)}</td><td class="mono">${xb}</td><td class="mono">${yb}</td>`;
            tbody.appendChild(tr);
        });
    }
    function renderFrequency() {
        const xCounts = new Map(),
            yCounts = new Map();
        multiples.forEach(({ point }) => {
            xCounts.set(point[0], (xCounts.get(point[0]) || 0) + 1);
            yCounts.set(point[1], (yCounts.get(point[1]) || 0) + 1);
        });
        const tbody = $("frequencyTable").querySelector("tbody");
        tbody.innerHTML = "";
        const entries = [...xCounts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([v, c]) => [`x = ${v}`, c])
            .concat(
                [...yCounts.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([v, c]) => [`y = ${v}`, c]),
            );
        entries.forEach(([label, count]) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td class="mono">${label}</td><td>${count}</td>`;
            tbody.appendChild(tr);
        });
    }
    function renderBits() {
        const tbody = $("bitsTable").querySelector("tbody");
        tbody.innerHTML = "";
        for (let bit = 0; bit < 5; bit++) {
            let xs = 0,
                ys = 0;
            multiples.forEach(({ point }) => {
                xs += (point[0] >> bit) & 1;
                ys += (point[1] >> bit) & 1;
            });
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${bit}</td><td>${xs} / 8</td><td>${ys} / 8</td>`;
            tbody.appendChild(tr);
        }
    }
    function renderPlot(k, currentStep) {
        const svg = $("pointPlot");
        const left = 58,
            top = 28,
            step = 23,
            max = 16;
        const xPx = (x) => left + x * step;
        const yPx = (y) => top + (max - y) * step;
        let s = "";
        // Grid and tick labels
        for (let i = 0; i <= 16; i += 1) {
            const opacity = i % 4 === 0 ? 0.65 : 0.22;
            s += `<line x1="${xPx(i)}" y1="${top}" x2="${xPx(i)}" y2="${yPx(0)}" stroke="#9aa9bf" stroke-opacity="${opacity}" stroke-width="1"/>`;
            s += `<line x1="${left}" y1="${yPx(i)}" x2="${xPx(16)}" y2="${yPx(i)}" stroke="#9aa9bf" stroke-opacity="${opacity}" stroke-width="1"/>`;
            if (i % 4 === 0) {
                s += `<text x="${xPx(i)}" y="${yPx(0) + 19}" font-size="11" text-anchor="middle" fill="#45556d">${i}</text>`;
                s += `<text x="${left - 14}" y="${yPx(i) + 4}" font-size="11" text-anchor="end" fill="#45556d">${i}</text>`;
            }
        }
        s += `<text x="${xPx(16) + 8}" y="${yPx(0) + 19}" font-size="12" fill="#172033">x</text>`;
        s += `<text x="${left - 14}" y="${top - 10}" font-size="12" text-anchor="middle" fill="#172033">y</text>`;
        // Mark all curve points for context, then highlight multiples of G.
        const allCurvePoints = [];
        for (let x = 0; x < p; x++)
            for (let y = 0; y < p; y++)
                if (mod(y * y - x * x * x - 7) === 0)
                    allCurvePoints.push([x, y]);
        allCurvePoints.forEach(([x, y]) => {
            s += `<circle cx="${xPx(x)}" cy="${yPx(y)}" r="3.2" fill="#c3ccd9" stroke="#75849a" stroke-width=".5"/>`;
        });
        multiples.forEach(({ k: n, point }) => {
            const active = n === currentStep;
            const target = n === k;
            s += `<circle cx="${xPx(point[0])}" cy="${yPx(point[1])}" r="${active ? 7 : 4.8}" fill="${active ? "#e29a21" : "#275dad"}" stroke="${target ? "#a4262c" : "#ffffff"}" stroke-width="${target ? 2.4 : 1.1}"/>`;
            s += `<text x="${xPx(point[0]) + 7}" y="${yPx(point[1]) - 7}" font-size="10.5" fill="#27364c">${n}G</text>`;
        });
        svg.innerHTML = s;
    }
    function stopTimer() {
        if (timer !== null) clearInterval(timer);
        timer = null;
        $("play").textContent = "Play slowly";
    }
    function getK() {
        const raw = Number($("privateKey").value);
        if (!Number.isInteger(raw) || raw < 1 || raw > 8) {
            $("privateKey").setCustomValidity("Choose an integer from 1 to 8.");
            $("privateKey").reportValidity();
            return null;
        }
        $("privateKey").setCustomValidity("");
        return raw;
    }
    function updateResults(resetAnimation = true) {
        const k = getK();
        if (k === null) return;
        stopTimer();
        if (resetAnimation) animationStep = 1;
        const Q = multiply(k);
        $("kValue").textContent = `k = ${k}`;
        $("qValue").textContent = `Q = ${k}G = ${pointShort(Q)}`;
        $("pubValue").textContent = pointShort(Q);
        $("animationStatus").textContent =
            `Animation step: ${animationStep}G = ${pointShort(multiply(animationStep))}`;
        renderSequence(k);
        renderAllPoints(k);
        renderPlot(k, animationStep);
    }
    function advanceStep() {
        const k = getK();
        if (k === null) return;
        animationStep = animationStep >= k ? 1 : animationStep + 1;
        $("animationStatus").textContent =
            `Animation step: ${animationStep}G = ${pointShort(multiply(animationStep))}`;
        renderPlot(k, animationStep);
    }
    $("calculate").addEventListener("click", () => updateResults(true));
    $("privateKey").addEventListener("change", () => updateResults(true));
    $("step").addEventListener("click", advanceStep);
    $("reset").addEventListener("click", () => {
        stopTimer();
        animationStep = 1;
        updateResults(false);
    });
    $("play").addEventListener("click", () => {
        const k = getK();
        if (k === null) return;
        if (timer !== null) {
            stopTimer();
            return;
        }
        $("play").textContent = "Pause animation";
        timer = setInterval(() => {
            if (animationStep >= k) {
                stopTimer();
                return;
            }
            animationStep += 1;
            $("animationStatus").textContent =
                `Animation step: ${animationStep}G = ${pointShort(multiply(animationStep))}`;
            renderPlot(k, animationStep);
        }, 900);
    });
    renderFrequency();
    renderBits();
    updateResults(true);
})();
