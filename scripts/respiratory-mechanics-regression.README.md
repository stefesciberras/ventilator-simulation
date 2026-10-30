# Respiratory mechanics regression

This build-time regression uses the real EDUVENT simulation engine rather than source-string checks.

It currently covers:

- the canonical Normal-profile PSV calibration case (PS 10 / PEEP 5 / neural Ti 1 s);
- measured neural effort duration rather than assuming the configured Ti is the observed waveform duration;
- trigger delay, mechanical Ti, cycling offset from neural effort end, and residual Pmus at cycle-off;
- ETS 10% / 25% / 50% behavior, verifying that lower ETS cycles later and higher ETS cycles earlier;
- volume-control authority with and without patient effort;
- SIMV-VC spontaneous pressure-support breaths between mandatory breaths;
- SIMV-PC spontaneous pressure-support breaths between mandatory breaths;
- SIMV spontaneous-breath cycling synchrony relative to neural effort end;
- SIMV synchronization-window behavior, including early synchronized mandatory breaths;
- preservation of mandatory timing after an out-of-window spontaneous breath;
- SIMV-VC mandatory flow/VT authority;
- SIMV-PC mandatory inspiratory timing and decelerating pressure-controlled flow;
- prevention of duplicate breaths from a single neural effort in the SIMV reference cases.

For pressure-supported breaths, synchrony is assessed against the end of neural inspiratory effort. Mechanical Ti is deliberately not forced to equal the full configured neural Ti because ventilator inspiration begins only after trigger detection and response delay.
