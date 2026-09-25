/** Vitest replacement for the browser/WASM mavlink2rest parser package. */
export class ParserEmitter {
  /** Test stub constructor compatible with production call sites. */
  constructor(_callback?: (...args: unknown[]) => void) {}

  /** Accept bytes without invoking the real WASM parser. */
  emit(_bytes: Uint8Array): void {}

  /** Return no encoded packet; protocol tests inject packages directly. */
  parse(_message: string): Uint8Array {
    return new Uint8Array()
  }
}
