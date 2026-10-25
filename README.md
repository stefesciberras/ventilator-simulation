# LoppjuSIM

LoppjuSIM is a browser-based clinical simulation platform built with Vite, React and TypeScript for education and simulation training.

## Product family

- **LoppjuSIM-MV** — mechanical ventilation simulation
- **LoppjuSIM-Anaesth** — anaesthesia patient-monitor simulation
- **LoppjuSIM-ICU** — intensive-care patient-monitor simulation *(coming soon)*
- **LoppjuSIM-Studio** — shared scenario and simulation-content authoring workspace

The platform shares teaching, instructor-session, scenario and interface foundations while keeping product-specific simulation engines independent.

## Development compatibility

Existing internal product IDs, routes and storage keys such as `eduvent`, `edumon-ana`, `edumon-icu`, `/eduvent` and `/edumon/...` are retained for compatibility. They are implementation identifiers rather than the public product names.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

> For education and simulation training only. LoppjuSIM is educational simulation software and is not intended for use as a medical device, for diagnosis, patient monitoring, treatment, clinical decision-making, or in the care of real patients.

© 2026 Stephen Sciberras. LoppjuSIM. All rights reserved.
