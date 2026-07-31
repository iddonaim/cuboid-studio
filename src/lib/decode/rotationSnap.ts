/**
 * Magnetic rotation snapping for underlay registration.
 *
 * Deliberately not stepped: rotation stays continuous and only latches when it
 * arrives near a mark, so 7° remains reachable. Quantising to 15° increments
 * would make every angle between the marks unreachable, which is the wrong
 * behaviour for registering a drawing against a photograph.
 */
export const ROTATION_SNAP_DEGREES = 15;
export const ROTATION_SNAP_THRESHOLD = 3;

export function snapRotation(degrees: number, suppressed = false): number {
  if (suppressed) return degrees;
  const nearest = Math.round(degrees / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
  return Math.abs(degrees - nearest) <= ROTATION_SNAP_THRESHOLD ? nearest : degrees;
}
