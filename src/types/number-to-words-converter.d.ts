// src/types/number-to-words-converter.d.ts
declare module "number-to-words-converter" {
  export function toWords(number: number, options?: {
    currency?: boolean;
    ignoreZeroCurrency?: boolean;
  }): string;
}