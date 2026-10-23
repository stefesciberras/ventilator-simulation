import App from '../App'

/**
 * Product route boundary for EDUVENT.
 *
 * Ventilator mechanics and waveform morphology remain owned by EDUVENT. Shared
 * EDUSIM chrome, teaching/session infrastructure and product-neutral respiratory
 * gas-exchange physiology are consumed through explicit core/adaptor boundaries.
 */
export function EduventApp() {
  return <App />
}
