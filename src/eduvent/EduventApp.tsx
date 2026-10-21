import App from '../App'

/**
 * Product route boundary for EDUVENT.
 *
 * The ventilator engine/display remain owned by EDUVENT. Shared EDUSIM chrome,
 * teaching, sessions and scenario infrastructure are progressively extracted
 * from App and consumed by both EDUVENT and EDUMON without moving simulation
 * physiology into the shared layer.
 */
export function EduventApp() {
  return <App />
}
