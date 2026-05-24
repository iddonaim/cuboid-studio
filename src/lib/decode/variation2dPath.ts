/**
 * Path for 2D variation SVG assets under public/2d/.
 * Runtime variation ids and asset filenames both use `v-00`…`v-69`.
 */
export function variation2dPath(variationId: string): string {
  const fileBase =
    variationId.startsWith('v-') ? variationId : `v-${variationId.slice(1)}`;
  return `/2d/${fileBase}.svg`;
}
