/**
 * Path for 2D variation SVG assets under public/2d/.
 * Runtime variation ids are `v-00`…`v-69`; assets are named `v00.svg`…`v69.svg`.
 */
export function variation2dPath(variationId: string): string {
  const fileBase = variationId.startsWith('v-')
    ? `v${variationId.slice(2)}`
    : variationId;
  return `/2d/${fileBase}.svg`;
}
