/** Vitest replacement for the browser/WASM mavlink2rest parser package. */
export class ParserEmitter {
  /** Accept bytes without invoking the real WASM parser. */
  emit(bytes: Uint8Array): void {
    void bytes
  }

  /** Return no encoded packet; protocol tests inject packages directly. */
  parse(message: string): Uint8Array {
    void message
    return new Uint8Array()
  }
}
