# Ventilator Simulation

Browser-based educational mechanical ventilation simulator built with Vite, React and TypeScript.

## v0.1 scope

- VC-A/C, PC-A/C and PSV modes
- Single-compartment respiratory mechanics model
- Adjustable compliance, inspiratory/expiratory resistance, spontaneous respiratory rate and patient effort
- Continuously scrolling pressure, flow and volume waveforms with Freeze/Resume
- Basic monitored values: RR, VTe, minute ventilation, Ppeak, Pmean and PEEP
- Patient presets: Normal, ARDS, COPD and Asthma
- O₂ enrichment, nebuliser and waveform freeze controls (initial teaching UI)

The simulator is intentionally separated into a physiology engine and user interface so additional modes, alarms, pathologies and scenarios can be added without rewriting the core display.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

> Educational simulation only. This software is not a medical device and must not be used for clinical decision-making.
