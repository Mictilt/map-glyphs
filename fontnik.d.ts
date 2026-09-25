declare module "fontnik" {
    export interface RangeOptions {
      font: Buffer;
      start: number;
      end: number;
    }
  
    export function range(
      options: RangeOptions,
      callback: (err: Error | null, pbf: Buffer) => void
    ): void;
  
    const fontnik: {
      range: typeof range;
    };
  
    export default fontnik;
  }
