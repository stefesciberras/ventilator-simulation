# Session Engine v2 — Retention and synchronization inventory
Version: **1.3.0.0** (development; specification, NOT fully implemented)
Source of truth: current model interfaces in `src/edumon/types.ts`, `src/edumon/teachingState.ts`, `src/simulation/types.ts`, `src/alarmTypes.ts`, and current scenario/session code.

**Retention means:** instructor refresh, candidate reconnect, and transport failover reconstruct the same session/runtime without silently resetting the patient. **Synchronization means:** authorised edits in Simulation appear in both views; Teaching candidates have independent patient runtimes. Do not treat all screen-local controls as patient state.

## Shared session / authority (durable)
- session ID, product ID, runtime mode, session status, instructor identity, participants/roles, candidate-to-runtime mapping and membership;
- current authority epoch/lease and command sequence/revision; accepted-command deduplication identities (durable across engine recreation);
- canonical simulation clock, elapsed time, speed, pause state and per-runtime clock when Teaching;
- last durable snapshot revision/creation time, recovery deadline, termination state;
- scenario ID/definition version, running stage/index, stage start time, transitions/branch history, time-trigger pause, assigned learner/question/media progress and explicit scenario controls;
- reset generation, accepted action/event order and relevant replay/checkpoint cursor.

## Anaesth and ITU monitor patient model — canonical `MonitorPatientState`
- **Cardiac:** `heartRate`, `rhythm`, `ecgMorphology`, `morphologySeverity`, `systolicPressure`, `diastolicPressure`, `spo2`, `peripheralPerfusion`, `temperatureC`.
- **Respiratory and gas-exchange:** `respiratory.respiratoryRate`, `tidalVolumeMl`, `spontaneousRespiratoryRate`, `spontaneousTidalVolumeMl`, `ventilatorMode`, `ventilatorSetRate`, `ventilatorSetTidalVolumeMl`, `ventilatorInspiratoryTimeSeconds`, `ventilatorInspiratoryFlowLMin`, `ventilatorPlateauPercent`, `ventilatorPressureControlCmH2O`, `ventilatorVolumeGuaranteePressureLimitCmH2O`, `ventilatorPressureSupportCmH2O`, `ventilatorTerminationSensitivityPercent`, `ventilatorSimvSyncWindowPercent`, `vdVt`, `deadSpaceMl`, `fio2`, `peepCmH2O`, `complianceMlPerCmH2O`, `expiratoryResistanceCmH2OLs`, `frcMl`, `shuntFraction`, `maxSpO2`, `oxygenConsumptionMlMin`, `co2ProductionMlMin`, `sex`, `heightCm`.
- **Anaesth:** `anaestheticGases.fiSevoPercent`; `anaestheticPhysiology.anaestheticSensitivity`, `anaestheticResponse`, `depthOfAnaesthesia`, `responseBaseline` (HR, SBP, DBP and spontaneous RR). EtSevo kinetics must be included in canonical derived-model state, not inferred solely from inspired Sevo.
- **Drugs & Events:** action definitions/versions as required for deterministic recovery; `actionRuntimeSnapshot.simulationTime`, `activeEffects` (instance IDs, action IDs, effect targets/operations, intensity, onset/duration/recovery, start/stop time, priority), `activeToggleActions`, and action command/event sequence. Shared action definitions remain authoritative; no direct BIS/HR overwrite on drug administration.
- **Monitoring presentation & measurement lifecycle:** invasive BP enabled, BIS enabled, capnography enabled, temperature enabled; NIBP reading, last measurement time and NIBP measurement/alarm lifecycle; TOF reading and measurement lifecycle; derived BIS/DSA, EtCO₂/FiCO₂, EtSevo/EtO₂, SpO₂ and display histories sufficient to resume without spurious discontinuity. Use canonical model inputs and bounded history checkpoints for recovery; don't send waveform samples at every frame.
- **Monitor alarms & controls:** `alarmLimits.heartRateLow`, `heartRateHigh`, `mapLow`, `mapHigh`, `spo2Low`, `spo2High`, alarm active/silence state and eligibility based on displayed monitor channels (including invasive BP and measurement-triggered NIBP). Local display visibility and alarm eligibility must not be confused.
- **Current `EdumonTeachingState` additional fields:** `patientTransitionSeconds`, `simulationPaused`, `simulationSpeed`, `resetRevision`, `runtimeMode`, `lastActionId`, `actionSequence`, `actionSimulationTime`, `actionCommand`, `actionRuntimeSnapshot`.

## Vent — canonical `PatientSettings`
- `sex`, `heightCm`, `oxygenConsumption`, `frc`, `shuntFraction`, `maxSpO2`, `compliance`, `chestWallCompliance`, `resistance`, `expiratoryResistance`, `expiratoryFlowLimitation`, `spontaneousRate`, `effort`, `neuralInspiratoryTime`, `effortRisePercent`, `effortRelaxationPercent`, `endExpiratoryOesophagealPressure`, `co2Production`, `vdVt`. `deadSpaceVolume` is legacy scenario compatibility only.

## Vent — canonical `VentilatorSettings`
- `mode`, `fio2`, `peep`, `rate`, `tidalVolume`, `inspiratoryTime`, `inspiratoryFlow`, `plateauPercent`, `pressureControl`, `volumeGuaranteePressureLimit`, `pressureSupport`, `triggerType`, `triggerSensitivity`, `flowTriggerSensitivity`, `terminationSensitivity`, `simvSyncWindowPercent`, `showSimvSyncWindow`, `pHigh`, `pLow`, `tHigh`, `tLow`.
- **Vent patient/device adjuncts:** selected patient/profile, ARDS severity, patient transition time, oxygen boost and remaining duration, nebuliser state, inspiratory/expiratory holds (if ongoing), scenario actions/event sequence.
- **Vent alarm limits:** `pressureLimit`, `apneaTime`, `peakPressure`, `co2Min`, `co2Max`, `minuteVentilationMin`, `minuteVentilationMax`, `tidalVolumeMin`, `tidalVolumeMax`, `respiratoryRateMin`, `respiratoryRateMax`. Retain alarm timing/onsets/active state and candidate alarm level as needed to prevent false alerts.
- **Vent dynamic physics:** continuous simulator phase, breath triggering/effort timing, volume/flow/pressure integration, auto-PEEP and gas-exchange state must survive authority recovery via a product-specific physics checkpoint. The public `Sample` array is visualization output, not a sufficient physiology snapshot.

## Session-global vs candidate-local vs derived
- **Global session controls:** instructor pause, instructor freeze, shared alarm silence, instructor-driven scenario actions, scenario media/prompt state where shared.
- **Candidate-local presentation:** candidate's optional waveform choice, zoom/layout, local waveform freeze, control tab, diagnostic overlays, open dialogs, speaker/audio preferences, and pointer overlay. These should not override instructor-global freeze or mutate canonical physiology; they normally belong in local per-participant persistence, not shared runtime snapshots.
- **Derived/ephemeral:** rendered waveforms, alarm banners, computed MAP and numerical monitor readouts should normally be regenerated from canonical state. Persist small histories/accumulators ONLY when necessary for continuity (EtSevo kinetic state, NIBP/TOF last readings, BIS/DSA history, ventilator phase and alarm timers).
- **Reset:** separate explicit command that clears runtime patient/device state to scenario-defined baseline, active drug effects, time-dependent derived histories, NIBP/TOF, alarm timers and scenario-specific runtime bookkeeping. It must preserve session ID, members, roles and connection state.

## Audit / implementation status at 1.3.0.0
- **Implemented in isolated v2 reducer:** session snapshots/revisions, basic runtime partitioning, epoch fencing in memory, minimal Anaesth patient/device/FiSevo control commands, declarative ActionEffect snapshot reducer with trusted library injection and candidate action-access checks.
- **NOT yet retained by v2 after a process restart:** all of the above (no snapshot storage/reload or authenticated lease); existing v1 production recovery still applies.
- **Not yet implemented in v2:** complete field/permission coverage, monitor derived-history checkpoints, Vent physics checkpoint, ITU adapter, multi-browser LAN/cloud transport, scenario state restoration, alarm and measurement state rehydration, instructor authentication/lease and fully tested failover.
- The listed fields are a **coverage and acceptance checklist**, not a claim that v2 currently persists them. Reconcile all fields against current runtime at integration time, and add tests which compare pre-refresh and recovered snapshots field by field.
