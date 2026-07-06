# PHYS Damped & Driven Oscillator — Phase-Space Viz (Three.js)

> 3D real-time visualization for the equation
>
> `ẍ + 2β ẋ + ω₀² x = (F₀/m) cos(ω t)`

Built for **PHYS Week 4 (PHYS 2124 — Mathematical Methods I)** & future M2-M3.

## What it shows

- **3D phase-space trajectory**: position `x` on Y, velocity `ẋ` on X, time `t` flowing into screen (negative Z).
- **Reactive ball** anchored at current `(x, ẋ, t)` with a glow halo.
- **Cyan-magenta gradient trail** = full trajectory, ~600 frames.
- **Energy ribbon** trailing the ball (red), height ∝ √|E|.
- **Forcing arrow** visible when `F₀/m > 0`.
- **Live HUD**: regime (under/over/critically damped), Q-factor, current `x`, `ẋ`, `E`, `t`.

## Solver

Plain JS RK4 with fixed `dt = 0.02 s`, 3 sub-steps per animation frame.

State: `[x, v]`, derivative: `[v, -2βv - ω₀²x + (F₀/m) cos(ωt)]`.

## Sliders

| Slider | Maps to | Range |
|---|---|---|
| β | damping | 0 → 2 |
| ω₀ | natural frequency | 0.2 → 3 |
| F₀/m | drive amplitude | 0 → 3 |
| ω | drive frequency | 0 → 3 |

## Presets

- **Undamped** (β=0): pure ellipse in phase-space.
- **Under-damped** (β < ω₀): spiraling inward.
- **Critically damped** (β = ω₀): monotonic decay, no oscillation.
- **Over-damped** (β > ω₀): slow monotonic decay.
- **Resonance** (ω ≈ ω₀, β small): amplitude grows until steady-state.
- **Beats** (ω ≈ ω₀, large F₀): beat pattern envelope.

## Run

```bash
cd /app/physics-oscillator-viz
pnpm install   # one-time
pnpm dev       # starts Vite on http://localhost:5174
```

## Files

```
/app/physics-oscillator-viz/
├── index.html              ← HUD + canvas mount
├── src/
│   ├── main.js             ← Three.js + RK4 solver + animation loop
│   └── style.css           ← dark theme, monospace HUD
├── package.json
└── README.md
```

## Cross-bootcamp links

- **iStructE** — same FBD/resonance dynamics, CM Exam 16 Jul (10 days out)
- **BME BMED2500** — RLC filters have identical transfer function `H(s) = 1/(s² + 2βs + ω₀²)`
- **PSY** — phase-space spiral ↔ Bayesian posterior trajectory

## License

MIT — for personal use, no warranty.
