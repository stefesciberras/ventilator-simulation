# loppjuSIM development change log

This file is the cross-thread source of truth for incremental code changes made to the loppjuSIM repository.

## Change policy

- Add an entry here for every merged implementation change, regardless of which ChatGPT/project thread initiated it.
- Keep the newest change first.
- For each implementation change, increment both **LoppjuSIM-MV** (`src/appVersion.ts`) and **LoppjuSIM-Anaesth / EDUMON** (`src/edumon/appVersion.ts`) by **0.0.0.1** unless an explicit release/version instruction overrides this policy.
- Record the resulting versions in the entry so changes can be correlated with diagnostics and deployed builds.
- Prefer one concise entry per merged change/PR, including the behavioural change and any important architectural rule introduced.

---

## 2026-10-31 — Anaesth Scenario Studio gas/ventilation registry and physiology-aware stage application

**Versions after change**

- LoppjuSIM-MV: `0.83.0.71` (from `0.83.0.70`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.31` (from `1.2.8.30`)

**Changes**

- Added inspired sevoflurane (`FiSevo`) to the Anaesthesia section of the Anaesth Scenario Studio registry.
- Added an Anaesth-only **Ventilation** section exposing the current monitor ventilator controls: mode, FiO₂, PEEP, set RR, VT, inspiratory time, inspiratory flow, plateau, pressure control, VG pressure limit, pressure support, termination sensitivity and SIMV sync window.
- FiO₂ is presented in Studio as the clinical 21–100% value while remaining stored internally as the canonical 0.21–1.00 fraction.
- Scenario-applied depth of anaesthesia and anaesthetic haemodynamic response now pass through `applyAnaestheticDepthEffects`, so changes affect HR, arterial pressure and spontaneous respiratory drive as well as BIS/depth-dependent displays.
- If a stage explicitly supplies haemodynamic/respiratory baseline values together with DOA, those values are used as the new response baseline before the depth effect is applied, preserving reversible non-compounding anaesthetic physiology.
- Scenario-applied ventilator controls now resolve effective RR/VT before entering the respiratory physiology engine, while FiO₂/PEEP and other canonical settings continue to feed the existing gas-exchange model.

**Architectural rule**

> Scenario Studio controls are declarative clinical inputs. Applying a scenario stage must use the same product physiology pathways as equivalent live simulator controls; Studio must not bypass derived physiology by writing display-facing state only.

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
