# Scenario Builder schema v1

Scenario Builder v0.2.0 establishes the module-agnostic authoring contract that will sit between the Scenario Builder UI and simulation runtimes.

The current EDUVENT ventilator runtime remains unchanged in this release. Existing `InstructorScenarioSnapshot` dynamic scenarios continue to run through the v0.82.2.4 sequential runtime while the generic authoring model is introduced alongside it.

## Document identity and versioning

Generic scenarios use:

- format: `eduvent-scenario`
- scenario schema version: `1`
- a permanent scenario ID
- the Scenario Builder version that last authored the document
- a module reference containing the module ID and that module's schema version

The module schema version is intentionally separate from the scenario-document schema version. This allows the generic document format to remain stable while a simulation module evolves its own variable contract.

## Stable entity IDs

Scenarios, stages, branches and triggers use permanent UUID-style IDs. Runtime and authoring code must refer to these IDs rather than array positions.

This is required for safe stage reordering, copy/paste, branching, future loops and structured runtime-log correlation.

## Stages and selective apply

A stage contains a sparse `changes` map keyed by module variable ID. Variables omitted from a stage are not changed, preserving the selective-apply behaviour of the current EDUVENT dynamic scenarios.

Each changed variable contains both its target value and its own transition definition. The initial transition modes are:

- `immediate`
- `linear` with a duration in seconds

This replaces the concept of one transition duration for an entire stage and allows, for example, FiO2 to change immediately while compliance and shunt change gradually over different intervals.

## Branches and triggers

Branches are first-class records separate from stages. A branch contains:

- permanent branch ID
- source stage ID
- target stage ID
- trigger expression
- non-negative priority
- optional label and enabled state

Lower priority numbers are evaluated first. Branches with equal priority retain document order.

Trigger expressions support atomic manual, time, condition and action triggers. Trigger groups can combine expressions using `all` or `any`, providing explicit AND/OR semantics without embedding arbitrary executable expressions in scenario files.

Because source and target stages are referenced by stable IDs, this representation can later support cycles/loops without changing the document shape.

## Module registry contract

A simulation module publishes metadata rather than requiring the Scenario Builder shell to understand domain physiology. Module metadata includes:

- variables: ID, label, group, type, role, unit, bounds, step, defaults/options and whether the variable is writable
- templates: named collections of variable values
- trigger sources: measurements and candidate/instructor actions that may be used by trigger editors

The first module definition is `ventilator` schema v1. It publishes ventilator settings, patient/physiology settings and runtime measurements.

Patient-profile templates are generated from the same `PATIENT_PROFILES` and `ARDS_PROFILES` definitions used by EDUVENT. Applying a template in the future editor must copy its values into the stage; the saved scenario must not retain a live link to the source profile.

## Validation

The generic document validator checks structural errors before a scenario reaches a runtime, including:

- unsupported format/schema
- missing or duplicate stable IDs
- missing entry/source/target stages
- invalid branch priorities
- duplicate trigger IDs
- empty compound-trigger groups
- invalid time/condition values
- invalid linear transition durations
- module mismatches

It also reports warnings for variables unknown to the selected module and attempts to assign measurement-only variables directly in a stage.

## Compatibility boundary

Scenario Builder v0.2.0 deliberately does not replace the existing ventilator scenario persistence or runtime. The standalone ventilator editor still delegates to the legacy `DynamicScenarioBuilder` so existing saved scenarios and simulator behaviour remain compatible.

The next integration step should be a ventilator adapter that converts between legacy `InstructorScenarioSnapshot` dynamic scenarios and `ScenarioBuilderDocument`. Stable IDs should then be persisted rather than regenerated on every edit. Once that bridge is reliable, branching can be exposed in the authoring UI and the generic Scenario Runtime can begin to replace sequential logic currently embedded in simulator/instructor components.
