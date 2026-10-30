# Respiratory mechanics regression

This build-time regression uses the real EDUVENT simulation engine rather than source-string checks.

It currently covers:

- the Normal PSV calibration case;
- volume-control authority with and without patient effort;
- SIMV-VC spontaneous pressure-support breaths between mandatory breaths;
- SIMV-PC spontaneous pressure-support breaths between mandatory breaths;
- SIMV synchronization-window behavior, including early synchronized mandatory breaths;
- preservation of mandatory timing after an out-of-window spontaneous breath;
- SIMV-VC mandatory flow/VT authority;
- SIMV-PC mandatory inspiratory timing and decelerating pressure-controlled flow;
- prevention of duplicate breaths from a single neural effort in the SIMV reference cases.
