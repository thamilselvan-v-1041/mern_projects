/**
 * Sarvam.ai Translation API client
 * API: POST https://api.sarvam.ai/translate
 * Auth: api-subscription-key header
 * @see https://docs.sarvam.ai/api-reference-docs/text/translate-text
 */

const SARVAM_BASE = 'https://api.sarvam.ai';
const TRANSLATE_PATH = '/translate';

export type SourceLanguageCode =
  | 'auto'
  | 'en-IN'
  | 'hi-IN'
  | 'bn-IN'
  | 'gu-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'mr-IN'
  | 'od-IN'
  | 'pa-IN'
  | 'ta-IN'
  | 'te-IN'
  | 'as-IN'
  | 'brx-IN'
  | 'doi-IN'
  | 'kok-IN'
  | 'ks-IN'
  | 'mai-IN'
  | 'mni-IN'
  | 'ne-IN'
  | 'sa-IN'
  | 'sat-IN'
  | 'sd-IN'
  | 'ur-IN';

export type TargetLanguageCode = Exclude<SourceLanguageCode, 'auto'>;

export type SpeakerGender = 'Male' | 'Female';

export type TranslationMode = 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed';

export type TranslationModel = 'mayura:v1' | 'sarvam-translate:v1';

export interface TranslateRequest {
  input: string;
  source_language_code: SourceLanguageCode;
  target_language_code: TargetLanguageCode;
  speaker_gender?: SpeakerGender;
  mode?: TranslationMode;
  model?: TranslationModel;
}

export interface TranslateResponse {
  request_id: string | null;
  translated_text: string;
  source_language_code: string;
}

const getApiKey = (): string => {
  const key = import.meta.env.VITE_SARVAM_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('Missing VITE_SARVAM_API_KEY. Add it to your .env file.');
  }
  return key;
};

export async function translate(params: TranslateRequest): Promise<TranslateResponse> {
  const apiKey = getApiKey();
  const url = `${SARVAM_BASE}${TRANSLATE_PATH}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      input: params.input,
      source_language_code: params.source_language_code,
      target_language_code: params.target_language_code,
      ...(params.speaker_gender && { speaker_gender: params.speaker_gender }),
      ...(params.mode && { mode: params.mode }),
      ...(params.model && { model: params.model }),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let message = `Sarvam API error ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      message = (errJson.detail ?? errJson.message ?? errText) || message;
    } catch {
      message = errText || message;
    }
    throw new Error(message);
  }

  const data = (await response.json()) as TranslateResponse;
  return data;
}
