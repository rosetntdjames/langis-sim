# LANGIS
### Likelihood Analysis of National Growth Instability Simulator

> *Langis* — Filipino for "oil."

A Monte Carlo economic simulator that estimates the probability of the Philippine economy collapsing under sustained crude oil price shocks. Built as a CS portfolio project demonstrating stochastic simulation methods applied to a real, ongoing national crisis.

**[Live Demo →](https://your-vercel-url.vercel.app)**

---

## What It Does

Instead of predicting a single economic outcome, LANGIS simulates **10,000 possible futures** — each with slightly different random outcomes — and counts how many of them end in serious economic stress. That count, expressed as a percentage, is the **collapse probability**.

Think of it like a weather forecast: it doesn't tell you the economy *will* collapse. It tells you how likely it is under the conditions you set.

The Philippines imports **95–98% of its crude oil** from the Middle East. As conflict around the Strait of Hormuz escalates, every dollar increase in the global crude price becomes a peso increase at every Petron and Shell station — and then ripples outward into jeepney fares, electricity bills, and grocery prices. LANGIS tries to quantify how far that ripple can go.

---

## Features

- **Monte Carlo simulation** — 10,000 correlated scenarios per run using Box-Muller Gaussian noise
- **Cholesky decomposition** — correlated variable generation reflecting real Philippine economic co-movement (inflation, peso, GDP move together the way they do in actual oil shocks)
- **Tiered nonlinear sensitivity** — three price tiers ($80–$110, $110–$150, $150+) with escalating pass-through coefficients calibrated to MUFG Research and BSP data
- **Composite stress index** — weighted scoring (inflation×0.45, peso×0.35, GDP×0.20) normalized to Philippine-specific danger levels
- **Inflation override rule** — inflation ≥ 10.5% triggers collapse independently, reflecting that fuel-driven inflation at that level is a standalone emergency for Filipino households
- **Score breakdown panel** — full arithmetic transparency showing exactly how the probability was derived
- **Historical anchors** — simulation output compared to 2008, 2018, and 2022 Philippine oil shock data
- **Fan chart** — month-by-month trajectory with 10th–90th percentile bands
- **Dynamic plain-language summary** — results translated into what they mean for ordinary Filipinos
- **Full citations panel** — all 8 sources documented with their role in the model
- **Mobile responsive** — two-breakpoint system (≤1024px tablet, ≤480px phone)

---

## How It Works

### 1. Model Parameters

Baseline values calibrated to pre-shock Philippine economic data:

| Indicator | Baseline | Collapse Threshold |
|---|---|---|
| Inflation Rate | 4.2% | ≥ 10.0% |
| Peso / USD | ₱57.50 | ≥ ₱80.00 |
| GDP Growth | 5.8% | ≤ 0.0% |

### 2. Sensitivity Coefficients

Per $10/bbl above $80 baseline (MUFG Research calibration):

| Tier | Price Range | Inflation | Peso | GDP |
|---|---|---|---|---|
| Base | $80–$110 | +0.60% | +₱0.55 | −0.20% |
| Extended | $110–$150 | +0.90% | +₱0.85 | −0.35% |
| Crisis | $150+ | +1.40% | +₱1.35 | −0.55% |

### 3. Correlation Structure

Variables are generated as a correlated bundle using Cholesky decomposition on the following historically-calibrated correlation matrix:

```
ρ(inflation, peso) =  0.72
ρ(inflation, GDP)  = −0.65
ρ(peso, GDP)       = −0.58
```

### 4. Composite Stress Index

```
Score = (inflation ÷ 10.0) × 0.45
      + (peso ÷ 75.0)      × 0.35
      + (GDP stress)        × 0.20
```

**Collapse** triggers when `Score ≥ 1.00` OR when `inflation ≥ 10.5%` (standalone override).

The 95% confidence interval on the Monte Carlo probability estimate is computed as:

```
CI = ±1.96 × √(p × (1 − p) / N)
```

At N = 10,000 and p ≈ 0.50, this gives approximately ±1%.

---

## Project Structure

```
langis/
├── index.html       # Markup — app shell and all HTML content
├── css/
│   └── style.css    # All styling, CSS variables, responsive breakpoints
└── js/
    └── main.js      # Simulation engine, chart rendering, UI logic
```

No build step. No dependencies beyond Chart.js (CDN) and Google Fonts.

---

## Running Locally

1. Clone the repository
2. Open the `langis/` folder in VS Code
3. Right-click `index.html` → **Open with Live Server**

Or simply open `index.html` directly in a browser — it will work as long as `css/` and `js/` are in the same directory.

---

## Deployment

Deployed on Vercel. Push to GitHub and import the repository in Vercel — it will automatically detect and serve `index.html` as the root.

---

## Data Sources & Citations

| # | Source | Role |
|---|---|---|
| 01 | Rappler (March 2026) — *Middle East crisis: From the Strait of Hormuz to your dining table* | Pump price data, import dependency figures |
| 02 | MUFG Research (March 9, 2026) — *Philippine Oil Price Sensitivity Model* | Core sensitivity coefficients |
| 03 | U.S. EIA (June 2025) — *Strait of Hormuz: World Oil Transit Chokepoint* | Global oil flow data, bypass capacity |
| 04 | DLSU Economists via Manila Bulletin (March 17, 2026) | Academic risk validation, stagflation warning |
| 05 | Philippine Daily Inquirer — Oil Price Watch (March 11–19, 2026) | Weekly DOE pump price bulletins |
| 06 | Al Jazeera (March 15, 2026) | Geopolitical risk premium, Brent price data |
| 07 | Bangko Sentral ng Pilipinas — Inflation Reports 2020–2026 | Baseline inflation, correlation calibration |
| 08 | Philippine Statistics Authority — National Accounts 2024–2025 | Baseline GDP growth calibration |

---

## Limitations

This is an educational simulation, not a forecast. Specifically:

- **No policy response modeling** — the BSP does not sit still during oil shocks; this model assumes it does
- **No OFW remittance buffer** — $36.1B in 2024 remittances partially stabilizes the peso; not modeled
- **No BSP foreign reserve buffer** — $103.8B in reserves as of end-2024; not modeled
- **Gaussian noise only** — real crises exhibit fat-tailed distributions; this model underestimates extreme tail risk
- **Not backtested** — coefficients have not been validated against 2008 or 2018 Philippine oil shock data
- **Crisis-tier escalation is extrapolated** — base tier is MUFG-calibrated; crisis tier is constructed from historical reasoning and acknowledged as a model assumption

The collapse probability should be read as an **upper-bound risk estimate**, not a precise forecast.

---

## Academic Paper

A formal write-up of the methodology, motivation, capabilities, and limitations is included in:

**`LANGIS_Academic_Paper.md`**

---

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no frameworks
- [Chart.js 4.4.0](https://www.chartjs.org/) — histogram and fan chart rendering
- [Google Fonts](https://fonts.google.com/) — Bebas Neue, IBM Plex Mono, Crimson Pro
- [Vercel](https://vercel.com/) — deployment

---

## Author

**Dean James Salvacion** — BS Computer Science, Polytechnic University of the Philippines, Sta. Mesa

Built as a demonstration of Monte Carlo simulation applied to Philippine macroeconomic risk under the 2026 Middle East oil price crisis.

---

> *This simulation is not a forecast or policy recommendation. Use it to understand risk, not to predict the future.*
