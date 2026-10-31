# loppjuSIM development change log

This file is the cross-thread source of truth for incremental code changes made to the loppjuSIM repository.

## Change policy

- Add an entry here for every merged implementation change, regardless of which ChatGPT/project thread initiated it.
- Keep the newest change first.
- For each implementation change, increment both **LoppjuSIM-MV** (`src/appVersion.ts`) and **LoppjuSIM-Anaesth / EDUMON** (`src/edumon/appVersion.ts`) by **0.0.0.1** unless an explicit release/version instruction overrides this policy.
- Record the resulting versions in the entry so changes can be correlated with diagnostics and deployed builds.
- Prefer one concise entry per merged change/PR, including the behavioural change and any important architectural rule introduced.

---

## 2026-10-31 — Alarm source eligibility and event-based NIBP alarms

**Versions after change**

- LoppjuSIM-MV: `0.83.0.70` (from `0.83.0.69`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.30` (from `1.2.8.29`)

**Changes**

- Added a shared alarm `eligible` predicate so a product can suppress an alarm when its monitor/sensor/source is not currently displayed or active, while leaving the underlying physiology intact.
- Alarm eligibility is resolved dynamically by the shared alarm controller and therefore applies consistently to lifecycle state, logging, audible priority and banner display.
- EDUMON invasive arterial-pressure alarms are now eligible only while invasive BP monitoring is displayed. Hiding/disabling the source suppresses and clears its alarm presentation.
- Added the same reusable display-capability mechanism for future BIS, capnography/EtCO2 and temperature alarm definitions.
- NIBP alarms are event-driven: a cuff alarm state changes only when a measurement completes. Starting a cuff cycle does not clear an existing NIBP alarm, and changing alarm limits does not retrospectively alarm on a retained cuff value; the next completed measurement determines the new state.
- NIBP uses the existing MAP low/high limits and reports distinct `LOW NIBP` / `HIGH NIBP` alarm sources.

**Architectural rule**

> Physiology may continue to exist internally when a monitor parameter is hidden, but alarm generation must be gated by the availability/display state of that monitoring source. Intermittent measurements such as NIBP are evaluated on measurement-completion events rather than as continuously sampled values.
