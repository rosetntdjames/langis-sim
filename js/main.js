let crudePrice = 115, horizon = 6, volatility = 'medium';
let chartObjs = {};
let fanData = {};
let activeFan = 'inf';

const BASE = { inf: 4.2, peso: 57.5, gdp: 5.8 };

// Sensitivity per $10/bbl above $80 — calibrated to 2008/2022 PHL data
// Crisis tier reflects nonlinear pass-through at extreme prices
const SENS = {
    inf: { base: 0.60, ext: 0.90, crisis: 1.40 },   // at $180: +14% inflation on top of base
    peso: { base: 0.55, ext: 0.85, crisis: 1.35 },   // at $180: peso pushed toward ₱71+
    gdp: { base: -0.20, ext: -0.35, crisis: -0.55 }, // at $180: GDP near 0 or below
};

const SIG = {
    inf: { low: 0.30, medium: 0.75, high: 1.40 },
    peso: { low: 0.60, medium: 1.60, high: 3.20 },
    gdp: { low: 0.20, medium: 0.55, high: 1.10 },
};

const THRESH = { inf: 10.0, peso: 80.0, gdp: 0.0 };
const N = 10000;

const L = (() => {
    const rho12 = 0.72, rho13 = -0.65, rho23 = -0.58;
    const l11 = 1, l21 = rho12, l22 = Math.sqrt(1 - rho12 * rho12);
    const l31 = rho13, l32 = (rho23 - l31 * l21) / l22;
    const l33 = Math.sqrt(1 - l31 * l31 - l32 * l32);
    return [[l11, 0, 0], [l21, l22, 0], [l31, l32, l33]];
})();

function randn() {
    let u, v;
    do { u = Math.random(); } while (u === 0);
    do { v = Math.random(); } while (v === 0);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function correlatedNormals() {
    const z = [randn(), randn(), randn()];
    return [
        L[0][0] * z[0],
        L[1][0] * z[0] + L[1][1] * z[1],
        L[2][0] * z[0] + L[2][1] * z[1] + L[2][2] * z[2],
    ];
}

function getSensitivity(crude) {
    if (crude <= 110) return 'base';
    if (crude <= 150) return 'ext';
    return 'crisis';
}

function simOne(crude, months, vol) {
    const delta = (crude - 80) / 10;
    const tScale = months / 6;
    const tier = getSensitivity(crude);
    const corr = correlatedNormals();
    return {
        inf: BASE.inf + SENS.inf[tier] * delta * tScale + corr[0] * SIG.inf[vol],
        peso: BASE.peso + SENS.peso[tier] * delta * tScale + corr[1] * SIG.peso[vol],
        gdp: BASE.gdp + SENS.gdp[tier] * delta * tScale + corr[2] * SIG.gdp[vol],
    };
}

function simPath(crude, months, vol) {
    const path = { inf: [], peso: [], gdp: [] };
    const tier = getSensitivity(crude);
    const delta = (crude - 80) / 10;
    for (let m = 1; m <= months; m++) {
        const tScale = m / 6;
        const corr = correlatedNormals();
        path.inf.push(BASE.inf + SENS.inf[tier] * delta * tScale + corr[0] * SIG.inf[vol] * Math.sqrt(m / months));
        path.peso.push(BASE.peso + SENS.peso[tier] * delta * tScale + corr[1] * SIG.peso[vol] * Math.sqrt(m / months));
        path.gdp.push(BASE.gdp + SENS.gdp[tier] * delta * tScale + corr[2] * SIG.gdp[vol] * Math.sqrt(m / months));
    }
    return path;
}

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const i = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function histogram(vals, bins, mn, mx) {
    const step = (mx - mn) / bins;
    const counts = new Array(bins).fill(0);
    const labels = Array.from({ length: bins }, (_, i) => (mn + i * step).toFixed(1));
    vals.forEach(v => { const i = Math.min(Math.floor((v - mn) / step), bins - 1); if (i >= 0) counts[i]++; });
    return { labels, counts };
}

const CHART_OPTS = () => ({
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => `~${i[0].label}`, label: i => `${i.raw} scenarios` } } },
    scales: {
        x: { ticks: { color: '#5a5a50', font: { family: 'IBM Plex Mono', size: 8 }, maxTicksLimit: 5 }, grid: { color: '#1e1e1c' } },
        y: { ticks: { color: '#5a5a50', font: { family: 'IBM Plex Mono', size: 8 } }, grid: { color: '#1e1e1c' } }
    },
    animation: { duration: 700 }
});

function drawHist(id, vals, bins, mn, mx, color, thresh, isLower) {
    if (chartObjs[id]) chartObjs[id].destroy();
    const { labels, counts } = histogram(vals, bins, mn, mx);
    const step = (mx - mn) / bins;
    const threshBin = Math.floor((thresh - mn) / step);
    const bg = counts.map((_, i) => (isLower ? i <= threshBin : i >= threshBin) ? 'rgba(224,60,43,0.55)' : color + '28');
    const border = counts.map((_, i) => (isLower ? i <= threshBin : i >= threshBin) ? 'rgba(224,60,43,0.9)' : color);
    const ctx = document.getElementById(id).getContext('2d');
    chartObjs[id] = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ data: counts, backgroundColor: bg, borderColor: border, borderWidth: 1 }] }, options: CHART_OPTS() });
}

function drawFanChart(key) {
    if (!fanData[key]) return;
    if (chartObjs['fan']) chartObjs['fan'].destroy();
    const { months_labels, p10, p50, p90, threshold, color } = fanData[key];
    const ctx = document.getElementById('fan-chart').getContext('2d');
    chartObjs['fan'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months_labels, datasets: [
                { label: '90th percentile', data: p90, borderColor: 'transparent', backgroundColor: color + '18', fill: '+1', tension: 0.4, pointRadius: 0 },
                { label: '10th percentile', data: p10, borderColor: 'transparent', backgroundColor: color + '18', fill: false, tension: 0.4, pointRadius: 0 },
                { label: 'Median', data: p50, borderColor: color, borderWidth: 2.5, fill: false, tension: 0.4, pointRadius: 3, pointBackgroundColor: color },
                { label: 'Threshold', data: new Array(months_labels.length).fill(threshold), borderColor: 'rgba(224,60,43,0.7)', borderWidth: 1.5, borderDash: [6, 4], fill: false, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${item.raw.toFixed(2)}` } } },
            scales: {
                x: { ticks: { color: '#5a5a50', font: { family: 'IBM Plex Mono', size: 9 } }, grid: { color: '#1e1e1c' } },
                y: { ticks: { color: '#5a5a50', font: { family: 'IBM Plex Mono', size: 9 } }, grid: { color: '#1e1e1c' } }
            },
            animation: { duration: 600 }
        }
    });
}

function estimatePumpPrice(crude) { return Math.round(87 + ((crude - 80) / 10) * 6.5); }
function pumpPriceColor(price) { return price < 100 ? 'var(--green)' : price < 130 ? 'var(--warn)' : 'var(--red)'; }

document.getElementById('ctrl-crude').addEventListener('input', e => {
    crudePrice = +e.target.value;
    document.getElementById('val-crude').innerHTML = `$${crudePrice}<span class="unit">/bbl</span>`;
    const pump = estimatePumpPrice(crudePrice);
    document.getElementById('pump-estimate').innerHTML = `≈ <strong style="color:${pumpPriceColor(pump)}">₱${pump}/L diesel</strong> estimated at the pump`;
});

document.querySelectorAll('[data-horizon]').forEach(b => b.addEventListener('click', () => {
    horizon = +b.dataset.horizon;
    document.querySelectorAll('[data-horizon]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    document.getElementById('val-horizon').innerHTML = `${horizon}<span class="unit">months</span>`;
}));

document.querySelectorAll('[data-vol]').forEach(b => b.addEventListener('click', () => {
    volatility = b.dataset.vol;
    document.querySelectorAll('[data-vol]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    document.getElementById('val-vol').textContent = volatility === 'medium' ? 'MED' : volatility.toUpperCase();
}));

document.querySelectorAll('[data-fan]').forEach(b => b.addEventListener('click', () => {
    activeFan = b.dataset.fan;
    document.querySelectorAll('[data-fan]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    drawFanChart(activeFan);
}));

function animateCount(el, target, duration, suffix) {
    const start = performance.now();
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 4);
        el.textContent = (ease * target).toFixed(1) + suffix;
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = target.toFixed(1) + suffix;
    }
    requestAnimationFrame(step);
}

function verdict(p) {
    if (p < 10) return { text: 'SYSTEM STABLE', color: 'var(--green)' };
    if (p < 30) return { text: 'ELEVATED RISK', color: '#b8a020' };
    if (p < 50) return { text: 'HIGH RISK', color: 'var(--warn)' };
    if (p < 70) return { text: 'CRITICAL STRESS', color: 'var(--warn)' };
    return { text: 'COLLAPSE IMMINENT', color: 'var(--red)' };
}

function showOverlay(prob, verd) {
    document.getElementById('overlay-prob').textContent = prob.toFixed(1) + '%';
    document.getElementById('overlay-prob').style.color = verd.color;
    document.getElementById('overlay-verdict').textContent = verd.text;
    document.getElementById('overlay-verdict').style.color = verd.color;

    // Plain explanation of what the probability means
    let explain = '';
    const inEvery = Math.round(100 / prob);
    if (prob < 5) {
        explain = `Only ${Math.round(prob / 100 * 10000).toLocaleString()} out of 10,000 simulated futures ended badly. The economy is likely to absorb this shock.`;
    } else if (prob < 15) {
        explain = `About 1 in ${inEvery} possible futures ended in serious economic stress. Manageable — but worth watching closely.`;
    } else if (prob < 35) {
        explain = `Roughly 1 in ${inEvery} possible futures collapsed. Think of it like a 1 in ${inEvery} chance your jeepney fare doubles and your grocery bill follows. Not certain — but real.`;
    } else if (prob < 55) {
        explain = `More than 1 in every 3 simulated futures ended badly. If you ran the next few months ${inEvery} times, most would be painful. The risks are no longer theoretical.`;
    } else if (prob < 75) {
        explain = `More than half of all simulated futures collapsed. Flip a coin — those are roughly your odds of the economy entering serious stress under these conditions.`;
    } else if (prob < 90) {
        explain = `${prob.toFixed(0)} out of every 100 simulated futures ended in collapse. Under these conditions, a stable outcome would be the exception, not the rule.`;
    } else {
        explain = `${Math.round(prob / 100 * 10000).toLocaleString()} out of 10,000 simulated futures ended in collapse. The simulation finds almost no path to stability at this oil price.`;
    }
    document.getElementById('overlay-explain').textContent = explain;
    document.getElementById('collapse-overlay').style.display = 'flex';
}

function dismissOverlay() {
    document.getElementById('collapse-overlay').style.display = 'none';
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleCitations() {
    document.getElementById('cit-body').classList.toggle('open');
    document.getElementById('cit-icon').classList.toggle('open');
}

function generateSummary(crude, months, vol, collapseProb, mInf, mPeso, mGdp) {
    const horizonText = months === 3 ? 'the next 3 months' : months === 6 ? 'the next 6 months' : 'the next 12 months';
    const volText = vol === 'low' ? 'relatively stable global conditions' : vol === 'medium' ? 'moderate uncertainty in global markets' : 'highly unpredictable global conditions';

    let opening = '';
    const inEvery = Math.round(100 / collapseProb);
    if (collapseProb < 10) {
        opening = `At <strong>$${crude} per barrel</strong> over <strong>${horizonText}</strong>, the simulation suggests the Philippine economy is likely to hold up. Only <strong>${collapseProb.toFixed(1)}%</strong> of simulated futures ended in serious stress — roughly ${Math.round(collapseProb / 100 * 10000).toLocaleString()} out of 10,000 possible versions of the next few months. <span class="s-green">The majority looked manageable.</span>`;
    } else if (collapseProb < 30) {
        opening = `At <strong>$${crude} per barrel</strong> over <strong>${horizonText}</strong>, there's a <strong>${collapseProb.toFixed(1)}% chance</strong> of serious economic stress — about <span class="s-warn">1 in ${inEvery} possible futures</span> ending badly. Think of it this way: if the next ${horizonText === 'the next 3 months' ? '3 months' : horizonText === 'the next 6 months' ? '6 months' : 'year'} played out ${inEvery} different times, roughly one of those versions ends with ordinary Filipinos unable to keep up with prices. Not inevitable — but not ignorable.`;
    } else if (collapseProb < 55) {
        opening = `At <strong>$${crude} per barrel</strong> over <strong>${horizonText}</strong>, the collapse probability is <strong>${collapseProb.toFixed(1)}%</strong> — <span class="s-warn">more than 1 in every 3 simulated futures</span> ended in serious economic trouble. To put it plainly: if you ran the next few months 10 times, at least 3 of those versions see prices spiraling beyond what most Filipino households can absorb. The scales are tipping.`;
    } else if (collapseProb < 75) {
        opening = `At <strong>$${crude} per barrel</strong> over <strong>${horizonText}</strong>, <strong>${collapseProb.toFixed(1)}%</strong> of simulated futures ended in collapse — <span class="s-red">that's more than half.</span> Flip a coin — those are roughly your odds of the economy entering serious stress under these conditions. A bad outcome is more likely than a stable one.`;
    } else {
        opening = `At <strong>$${crude} per barrel</strong> over <strong>${horizonText}</strong>, <strong>${collapseProb.toFixed(1)}%</strong> of all 10,000 simulated futures ended in collapse — that's <strong>${Math.round(collapseProb / 100 * 10000).toLocaleString()} out of 10,000</strong> possible versions of the next few months. <span class="s-red">An overwhelming majority.</span> To put it concretely: if the next few months played out 10 different times, ${Math.round(collapseProb / 10)} of those versions see inflation past 10%, the peso under severe pressure, and ordinary Filipinos with wages that can no longer keep pace with basic costs.`;
    }

    let infLine = mInf < 6
        ? `Prices are expected to rise by around <strong>${mInf.toFixed(1)}%</strong> a year — uncomfortable, but manageable for most households.`
        : mInf < 10
            ? `Prices are projected to rise by around <strong>${mInf.toFixed(1)}%</strong> a year. That ₱500 grocery run today becomes <strong>₱${(500 * (1 + mInf / 100)).toFixed(0)}</strong> a year from now.`
            : `Inflation is projected at <strong>${mInf.toFixed(1)}%</strong> — well past the danger threshold. That ₱500 grocery run becomes <strong>₱${(500 * (1 + mInf / 100)).toFixed(0)}</strong> within a year. Fuel, electricity, and basic goods all climb together.`;

    let pesoLine = mPeso < 65
        ? `The peso is projected around <strong>₱${mPeso.toFixed(0)} to the dollar</strong> — weak, but not in crisis territory.`
        : mPeso < 80
            ? `The peso could weaken to <strong>₱${mPeso.toFixed(0)} to the dollar</strong>, making everything the Philippines imports significantly more expensive in peso terms.`
            : `The peso is projected to breach <strong>₱${mPeso.toFixed(0)} to the dollar</strong> — well past the ₱80 danger line. Every barrel of oil costs more in pesos, feeding back into fuel prices.`;

    let gdpLine = mGdp > 4
        ? `Despite the shock, the economy is still projected to grow at around <strong>${mGdp.toFixed(1)}%</strong> — slower than normal, but still growing.`
        : mGdp > 1
            ? `Economic growth is projected to slow significantly to around <strong>${mGdp.toFixed(1)}%</strong> — businesses feel it, hiring slows, some industries contract.`
            : mGdp > 0
                ? `The economy is barely growing at <strong>${mGdp.toFixed(1)}%</strong> — essentially standing still. Any additional shock could push it into negative territory.`
                : `The economy is projected to <strong>shrink by ${Math.abs(mGdp).toFixed(1)}%</strong>. Businesses close, unemployment rises, household incomes fall in real terms.`;

    let closing = collapseProb < 20
        ? `With <strong>${volText}</strong>, this is a situation worth watching — but not yet an emergency. The key variable is whether oil prices stabilize or continue climbing.`
        : collapseProb < 60
            ? `Given <strong>${volText}</strong>, this is a genuine risk that policymakers, businesses, and households should be preparing for. BSP's response and government fuel subsidy decisions will be critical.`
            : `Under <strong>${volText}</strong>, the simulation sees very little room for the economy to absorb this shock without serious consequences. Government intervention and whether the conflict de-escalates will be decisive.`;

    return `<p>${opening}</p><p>${infLine} ${pesoLine} ${gdpLine}</p><p>${closing}</p>`;
}

function runSimulation() {
    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.textContent = 'SIMULATING...';
    const pw = document.getElementById('progress-wrap');
    const pf = document.getElementById('progress-fill');
    pw.style.display = 'block';
    pf.style.width = '0%';

    setTimeout(() => {
        const infs = [], pesos = [], gdps = [];
        const pathsInf = [], pathsPeso = [], pathsGdp = [];
        const samples = [];
        let collapseCount = 0, infB = 0, pesoB = 0, gdpB = 0;

        for (let i = 0; i < N; i++) {
            const s = simOne(crudePrice, horizon, volatility);
            infs.push(s.inf); pesos.push(s.peso); gdps.push(s.gdp);

            // ── Composite Stress Index
            // Inflation weight 0.45 — hits Filipinos fastest and hardest
            // Peso normalized to ₱75 — severe stress begins well before ₱80
            // GDP weight 0.20 — serious but lags in short horizons
            // Composite threshold 1.00
            //
            // INFLATION OVERRIDE RULE:
            // In the Philippines, inflation ≥ 10.5% sustained for months is a
            // standalone emergency — fuel costs drive food, transport, electricity
            // simultaneously. Collapse is triggered by inflation alone at this level
            // regardless of whether the composite score reaches 1.00.
            const infStress = s.inf / THRESH.inf;
            const pesoStress = s.peso / 75.0;
            const gdpStress = s.gdp >= 4.0 ? 0
                : s.gdp >= 0 ? (4.0 - s.gdp) / 4.0
                    : 1.0 + Math.min(Math.abs(s.gdp) / 5.0, 0.5);
            const stressScore = 0.45 * infStress + 0.35 * pesoStress + 0.20 * gdpStress;
            const infOverride = s.inf >= 10.5;  // standalone inflation emergency
            const collapsed = infOverride || stressScore >= 1.00;
            const warned = !collapsed && (s.inf >= 9.0 || stressScore >= 0.80);

            const bI = s.inf >= THRESH.inf;
            const bP = s.peso >= THRESH.peso;
            const bG = s.gdp <= THRESH.gdp;
            if (bI) infB++; if (bP) pesoB++; if (bG) gdpB++;
            const br = [bI, bP, bG].filter(Boolean).length;
            if (collapsed) collapseCount++;

            if (i < 500) {
                const path = simPath(crudePrice, horizon, volatility);
                path.inf.forEach((v, m) => { if (!pathsInf[m]) pathsInf[m] = []; pathsInf[m].push(v); });
                path.peso.forEach((v, m) => { if (!pathsPeso[m]) pathsPeso[m] = []; pathsPeso[m].push(v); });
                path.gdp.forEach((v, m) => { if (!pathsGdp[m]) pathsGdp[m] = []; pathsGdp[m].push(v); });
            }

            if (samples.length < 20) samples.push({
                crude: (crudePrice + randn() * 2.5).toFixed(1),
                inf: s.inf.toFixed(2), peso: s.peso.toFixed(2), gdp: s.gdp.toFixed(2),
                score: stressScore.toFixed(3), br, collapsed, warn: warned
            });
        }

        pf.style.width = '100%';

        const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
        const mInf = mean(infs), mPeso = mean(pesos), mGdp = mean(gdps);
        const collapseProb = collapseCount / N * 100;
        const verd = verdict(collapseProb);

        const mLabels = Array.from({ length: horizon }, (_, i) => `Month ${i + 1}`);
        fanData.inf = { months_labels: mLabels, p10: pathsInf.map(a => percentile(a, 10)), p50: pathsInf.map(a => percentile(a, 50)), p90: pathsInf.map(a => percentile(a, 90)), threshold: THRESH.inf, isLower: false, color: '#d4a843' };
        fanData.peso = { months_labels: mLabels, p10: pathsPeso.map(a => percentile(a, 10)), p50: pathsPeso.map(a => percentile(a, 50)), p90: pathsPeso.map(a => percentile(a, 90)), threshold: THRESH.peso, isLower: false, color: '#3d8fd4' };
        fanData.gdp = { months_labels: mLabels, p10: pathsGdp.map(a => percentile(a, 10)), p50: pathsGdp.map(a => percentile(a, 50)), p90: pathsGdp.map(a => percentile(a, 90)), threshold: THRESH.gdp, isLower: true, color: '#3dab6e' };

        showOverlay(collapseProb, verd);

        document.getElementById('results').style.display = 'block';

        const probEl = document.getElementById('prob-number');
        probEl.style.color = verd.color;
        animateCount(probEl, collapseProb, 1200, '%');
        document.getElementById('prob-verdict').textContent = verd.text;
        document.getElementById('prob-verdict').style.color = verd.color;
        document.getElementById('prob-stats').innerHTML = `
                    <strong>${collapseCount.toLocaleString()}</strong> of ${N.toLocaleString()} scenarios triggered collapse<br>
                    Collapse = stress score ≥ 1.00 OR inflation ≥ 10.5% (standalone override)<br><br>
                    Inflation danger zone breached in <strong>${(infB / N * 100).toFixed(1)}%</strong> of runs<br>
                    Peso/USD danger zone breached in <strong>${(pesoB / N * 100).toFixed(1)}%</strong> of runs<br>
                    GDP contraction in <strong>${(gdpB / N * 100).toFixed(1)}%</strong> of runs<br>
                    Crude: <strong>$${crudePrice}/bbl</strong> · Horizon: <strong>${horizon} months</strong> · Volatility: <strong>${volatility.toUpperCase()}</strong>
                `;

        document.getElementById('summary-body').innerHTML = generateSummary(crudePrice, horizon, volatility, collapseProb, mInf, mPeso, mGdp);
        const sc = document.getElementById('summary-card');
        sc.style.borderLeftColor = collapseProb >= 75 ? 'var(--red)' : collapseProb >= 35 ? 'var(--warn)' : 'var(--accent)';

        // ── Score Breakdown Panel
        const meanInfStress = mInf / THRESH.inf;
        const meanPesoStress = mPeso / 75.0;
        const meanGdpStress = mGdp >= 4.0 ? 0 : mGdp >= 0 ? (4.0 - mGdp) / 4.0 : 1.0 + Math.min(Math.abs(mGdp) / 5.0, 0.5);
        const meanScore = 0.45 * meanInfStress + 0.35 * meanPesoStress + 0.20 * meanGdpStress;
        const infContrib = 0.45 * meanInfStress;
        const pesoContrib = 0.35 * meanPesoStress;
        const gdpContrib = 0.20 * meanGdpStress;
        const meanInflationOverride = mInf >= 10.5;
        const scoreColor = (meanInflationOverride || meanScore >= 1.00) ? 'var(--red)' : meanScore >= 0.80 ? 'var(--warn)' : 'var(--green)';
        const ci95 = (1.96 * Math.sqrt(collapseProb / 100 * (1 - collapseProb / 100) / N) * 100).toFixed(1);

        document.getElementById('bd-inf-val').textContent = mInf.toFixed(2) + '%';
        document.getElementById('bd-inf-stress').textContent = meanInfStress.toFixed(3);
        document.getElementById('bd-inf-contrib').textContent = infContrib.toFixed(3);
        document.getElementById('bd-inf-contrib').style.color = infContrib >= 0.45 ? 'var(--red)' : infContrib >= 0.30 ? 'var(--warn)' : 'var(--green)';

        document.getElementById('bd-peso-val').textContent = '₱' + mPeso.toFixed(2);
        document.getElementById('bd-peso-stress').textContent = meanPesoStress.toFixed(3);
        document.getElementById('bd-peso-contrib').textContent = pesoContrib.toFixed(3);
        document.getElementById('bd-peso-contrib').style.color = pesoContrib >= 0.35 ? 'var(--red)' : pesoContrib >= 0.25 ? 'var(--warn)' : 'var(--green)';

        document.getElementById('bd-gdp-val').textContent = mGdp.toFixed(2) + '%';
        document.getElementById('bd-gdp-stress').textContent = meanGdpStress.toFixed(3);
        document.getElementById('bd-gdp-contrib').textContent = gdpContrib.toFixed(3);
        document.getElementById('bd-gdp-contrib').style.color = gdpContrib >= 0.18 ? 'var(--red)' : gdpContrib >= 0.12 ? 'var(--warn)' : 'var(--green)';

        document.getElementById('breakdown-total').textContent = `TOTAL: ${meanScore.toFixed(3)}`;
        document.getElementById('breakdown-total').style.color = scoreColor;

        const overrideNote = meanInflationOverride ? ' · <span style="color:var(--red)">⚠ INFLATION OVERRIDE ACTIVE</span>' : '';
        const verdictText = (meanInflationOverride || meanScore >= 1.00) ? 'COLLAPSE ✓' : meanScore >= 0.80 ? 'WARNING' : 'STABLE';
        document.getElementById('breakdown-formula').innerHTML = `
                    Score = (${mInf.toFixed(2)}% ÷ 10.0) × 0.45 &nbsp;+&nbsp; (₱${mPeso.toFixed(2)} ÷ ₱75.0) × 0.35 &nbsp;+&nbsp; ${meanGdpStress.toFixed(3)} × 0.20<br>
                    Score = <strong>${infContrib.toFixed(3)}</strong> + <strong>${pesoContrib.toFixed(3)}</strong> + <strong>${gdpContrib.toFixed(3)}</strong>
                    = <strong style="color:${scoreColor};font-size:0.75rem">${meanScore.toFixed(3)}</strong>
                    &nbsp;·&nbsp; Threshold: 1.00${overrideNote}<br>
                    Inflation override: ≥10.5% triggers collapse regardless of composite score<br>
                    Monte Carlo collapse probability: <strong>${collapseProb.toFixed(1)}%</strong>
                    &nbsp;·&nbsp; 95% CI: ±${ci95}% &nbsp;·&nbsp; N = ${N.toLocaleString()} scenarios
                `;

        // ── Historical Anchors — simulation row
        const simVerdColor = collapseProb >= 60 ? 'var(--red)' : collapseProb >= 25 ? 'var(--warn)' : 'var(--green)';
        const simVerdText = collapseProb >= 60 ? 'CRITICAL' : collapseProb >= 25 ? 'HIGH STRESS' : 'ELEVATED';
        document.getElementById('sim-hist-label').textContent = `YOUR SIM ($${crudePrice}/bbl, ${horizon}mo)`;
        document.getElementById('sim-hist-crude').textContent = `$${crudePrice}/bbl`;
        document.getElementById('sim-hist-inf').innerHTML = `<span style="color:${mInf >= 10 ? 'var(--red)' : mInf >= 6 ? 'var(--warn)' : 'var(--green)'}">${mInf.toFixed(1)}%</span>`;
        document.getElementById('sim-hist-peso').innerHTML = `<span style="color:${mPeso >= 75 ? 'var(--red)' : mPeso >= 65 ? 'var(--warn)' : 'var(--muted)'}">₱${mPeso.toFixed(1)}</span>`;
        document.getElementById('sim-hist-gdp').innerHTML = `<span style="color:${mGdp <= 0 ? 'var(--red)' : mGdp <= 2 ? 'var(--warn)' : 'var(--green)'}">${mGdp.toFixed(1)}%</span>`;
        document.getElementById('sim-hist-verdict').innerHTML = `<span style="color:${simVerdColor};font-size:0.6rem;letter-spacing:0.08em;font-weight:600">${simVerdText}</span>`;

        function setInd(key, meanVal, vals, thresh, isLower, unit, barMin, barMax, dotId, meanId, rangeId, barId, markerPct, breachId) {
            const breachPct = isLower ? (vals.filter(v => v <= thresh).length / N * 100) : (vals.filter(v => v >= thresh).length / N * 100);
            const p10v = percentile(vals, 10), p90v = percentile(vals, 90);
            const breached = isLower ? meanVal <= thresh : meanVal >= thresh;
            const warn = !breached && (isLower ? meanVal <= thresh + 1.5 : meanVal >= thresh * 0.91);
            const color = breached ? 'var(--red)' : warn ? 'var(--warn)' : 'var(--green)';
            document.getElementById(dotId).style.background = color;
            document.getElementById(meanId).style.color = color;
            document.getElementById(rangeId).textContent = `10th–90th pct: ${unit === '₱' ? '₱' : ''}${p10v.toFixed(1)} – ${unit === '₱' ? '₱' : ''}${p90v.toFixed(1)}${unit === '₱' ? '' : unit}`;
            const bar = document.getElementById(barId);
            bar.style.width = Math.min(100, Math.max(0, (meanVal - barMin) / (barMax - barMin) * 100)) + '%';
            bar.style.background = color;
            document.getElementById('marker-' + key).style.left = markerPct + '%';
            document.getElementById(breachId).innerHTML = `<span style="color:${breached ? 'var(--red)' : warn ? 'var(--warn)' : 'var(--green)'}">${breachPct.toFixed(1)}% of scenarios breached this threshold</span>`;
        }

        setInd('inf', mInf, infs, THRESH.inf, false, '%', 0, 15, 'dot-inf', 'mean-inf', 'range-inf', 'bar-inf', THRESH.inf / 15 * 100, 'breach-inf');
        setInd('peso', mPeso, pesos, THRESH.peso, false, '₱', 50, 100, 'dot-peso', 'mean-peso', 'range-peso', 'bar-peso', (THRESH.peso - 50) / 50 * 100, 'breach-peso');
        setInd('gdp', mGdp, gdps, THRESH.gdp, true, '%', -4, 8, 'dot-gdp', 'mean-gdp', 'range-gdp', 'bar-gdp', (THRESH.gdp + 4) / 12 * 100, 'breach-gdp');

        document.getElementById('mean-inf').textContent = mInf.toFixed(2) + '%';
        document.getElementById('mean-peso').textContent = '₱' + mPeso.toFixed(2);
        document.getElementById('mean-gdp').textContent = mGdp.toFixed(2) + '%';

        drawHist('chart-inf', infs, 30, 0, 20, '#d4a843', THRESH.inf, false);
        drawHist('chart-peso', pesos, 30, 48, 105, '#3d8fd4', THRESH.peso, false);
        drawHist('chart-gdp', gdps, 30, -6, 10, '#3dab6e', THRESH.gdp, true);
        drawFanChart(activeFan);

        const tbody = document.getElementById('log-body');
        tbody.innerHTML = '';
        samples.forEach((s, i) => {
            const badge = s.collapsed ? '<span class="badge b-collapse">COLLAPSE</span>' : s.warn ? '<span class="badge b-warn">WARNING</span>' : '<span class="badge b-stable">STABLE</span>';
            const cI = +s.inf >= THRESH.inf ? 'color:var(--red)' : +s.inf >= 8 ? 'color:var(--warn)' : '';
            const cP = +s.peso >= THRESH.peso ? 'color:var(--red)' : +s.peso >= 74 ? 'color:var(--warn)' : '';
            const cG = +s.gdp <= THRESH.gdp ? 'color:var(--red)' : +s.gdp <= 1.5 ? 'color:var(--warn)' : '';
            const sv = +s.score;
            const cS = sv >= 1.00 ? 'color:var(--red)' : sv >= 0.80 ? 'color:var(--warn)' : 'color:var(--green)';
            tbody.innerHTML += `<tr><td style="color:var(--muted)">${String(i + 1).padStart(2, '0')}</td><td>$${s.crude}</td><td style="${cI}">${s.inf}%</td><td style="${cP}">₱${s.peso}</td><td style="${cG}">${s.gdp}%</td><td style="${cS};font-weight:600">${s.score}</td><td>${badge}</td></tr>`;
        });
        document.getElementById('log-count').textContent = `${samples.filter(s => s.collapsed).length} COLLAPSES IN SAMPLE`;

        setTimeout(() => document.getElementById('prob-card').classList.add('visible'), 100);
        setTimeout(() => document.getElementById('summary-card').classList.add('visible'), 250);
        setTimeout(() => document.getElementById('breakdown-card').classList.add('visible'), 380);
        setTimeout(() => document.getElementById('history-card').classList.add('visible'), 480);
        ['ind-inf', 'ind-peso', 'ind-gdp'].forEach((id, i) => setTimeout(() => document.getElementById(id).classList.add('visible'), 580 + i * 80));
        setTimeout(() => document.getElementById('fan-card').classList.add('visible'), 800);
        ['dist-inf', 'dist-peso', 'dist-gdp'].forEach((id, i) => setTimeout(() => document.getElementById(id).classList.add('visible'), 950 + i * 80));
        setTimeout(() => document.getElementById('log-card').classList.add('visible'), 1100);

        btn.disabled = false;
        btn.textContent = '↺ RE-RUN';
        setTimeout(() => { pw.style.display = 'none'; pf.style.width = '0%'; }, 600);

    }, 60);
}