/** Types for the parts of gifenc (MIT, CommonJS, no bundled types) the demo script uses. */
declare module "gifenc" {
  type Palette = number[][];
  interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: Palette; delay: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  // Plain functions (they do not use `this`), so they can be destructured.
  const gifenc: {
    quantize: (rgba: Uint8Array, maxColors: number) => Palette;
    applyPalette: (rgba: Uint8Array, palette: Palette) => Uint8Array;
    GIFEncoder: () => Encoder;
  };
  export default gifenc;
}
