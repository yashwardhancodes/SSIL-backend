// src/types/number-to-words.d.ts
declare module "number-to-words" {
  export function toWords(number: number): string;
  export function toWordsOrdinal(number: number): string;
  const numberToWords: (num: number) => string;
  export default numberToWords;
  // Add more if you ever use them
}