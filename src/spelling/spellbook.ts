/**
 * De WASM-module uit `src/spelling/rust` (spellbook, Hunspell-compatibel).
 * Zonder wasm-bindgen: een kale C-ABI met een gedeelde invoer- en
 * uitvoerbuffer. Werkt in een Web Worker en in Node (tests, prestatieproef).
 */

interface Exports {
  memory: WebAssembly.Memory;
  buffer(len: number): number;
  uitvoer_ptr(): number;
  uitvoer_len(): number;
  laad(len: number): number;
  verwijder(id: number): void;
  controleer(id: number, len: number): number;
  controleer_lijst(id: number, len: number): number;
  suggesties(id: number, len: number): number;
}

const codeer = new TextEncoder();
const decodeer = new TextDecoder();

export class Spellbook {
  private constructor(private readonly x: Exports) {}

  static async laad(bron: BufferSource | WebAssembly.Module): Promise<Spellbook> {
    const instantie =
      bron instanceof WebAssembly.Module
        ? await WebAssembly.instantiate(bron, {})
        : (await WebAssembly.instantiate(bron, {})).instance;
    return new Spellbook(instantie.exports as unknown as Exports);
  }

  private schrijf(bytes: Uint8Array) {
    const p = this.x.buffer(bytes.length);
    new Uint8Array(this.x.memory.buffer, p, bytes.length).set(bytes);
    return bytes.length;
  }

  private uitvoer() {
    return new Uint8Array(this.x.memory.buffer, this.x.uitvoer_ptr(), this.x.uitvoer_len());
  }

  /** Laadt een woordenboek en geeft het volgnummer. */
  woordenboek(aff: Uint8Array, dic: Uint8Array): number {
    const samen = new Uint8Array(aff.length + 1 + dic.length);
    samen.set(aff, 0);
    samen.set(dic, aff.length + 1);
    const id = this.x.laad(this.schrijf(samen));
    if (!id) throw new Error(`Woordenboek niet geladen: ${decodeer.decode(this.uitvoer())}`);
    return id;
  }

  verwijder(id: number) {
    this.x.verwijder(id);
  }

  controleer(id: number, woord: string): boolean {
    const r = this.x.controleer(id, this.schrijf(codeer.encode(woord)));
    if (r < 0) throw new Error("Ongeldig verzoek aan de spellingmodule.");
    return r === 1;
  }

  /** Controleert veel woorden in één aanroep; geeft per woord goed/fout. */
  controleerLijst(id: number, woorden: readonly string[]): boolean[] {
    if (!woorden.length) return [];
    // Een regeleinde kan niet in een woord staan; voor de zekerheid vervangen.
    const tekst = woorden.map((w) => w.replace(/\n/g, " ")).join("\n");
    const n = this.x.controleer_lijst(id, this.schrijf(codeer.encode(tekst)));
    if (n !== woorden.length) throw new Error("Ongeldig verzoek aan de spellingmodule.");
    return Array.from(this.uitvoer(), (b) => b === 1);
  }

  suggesties(id: number, woord: string): string[] {
    const n = this.x.suggesties(id, this.schrijf(codeer.encode(woord)));
    if (n < 0) throw new Error("Ongeldig verzoek aan de spellingmodule.");
    if (n === 0) return [];
    return decodeer.decode(this.uitvoer()).split("\n");
  }
}
