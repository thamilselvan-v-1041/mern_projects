/**
 * Sarvam.ai supported language codes (target languages; source can also use "auto")
 * @see https://docs.sarvam.ai/api-reference-docs/text/translate-text
 */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en-IN', name: 'English' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'gu-IN', name: 'Gujarati' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'od-IN', name: 'Odia' },
  { code: 'pa-IN', name: 'Punjabi' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
  { code: 'as-IN', name: 'Assamese' },
  { code: 'brx-IN', name: 'Bodo' },
  { code: 'doi-IN', name: 'Dogri' },
  { code: 'kok-IN', name: 'Konkani' },
  { code: 'ks-IN', name: 'Kashmiri' },
  { code: 'mai-IN', name: 'Maithili' },
  { code: 'mni-IN', name: 'Manipuri (Meiteilon)' },
  { code: 'ne-IN', name: 'Nepali' },
  { code: 'sa-IN', name: 'Sanskrit' },
  { code: 'sat-IN', name: 'Santali' },
  { code: 'sd-IN', name: 'Sindhi' },
  { code: 'ur-IN', name: 'Urdu' },
];

export const SOURCE_AUTO = 'auto';
