/**
 * Sarvam.ai Translation API client
 * API: POST https://api.sarvam.ai/translate
 * Auth: api-subscription-key header
 * @see https://docs.sarvam.ai/api-reference-docs/text/translate-text
 */

const SARVAM_BASE = 'https://api.sarvam.ai';
const TRANSLATE_PATH = '/translate';
const TTS_PATH = '/text-to-speech';

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

export type TranslationSpeakerGender = 'Male' | 'Female';

export type TranslationMode = 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed';

export type TranslationModel = 'mayura:v1' | 'sarvam-translate:v1';

export interface TranslateRequest {
  input: string;
  source_language_code: SourceLanguageCode;
  target_language_code: TargetLanguageCode;
  speaker_gender?: TranslationSpeakerGender;
  mode?: TranslationMode;
  model?: TranslationModel;
}

export interface TranslateResponse {
  request_id: string | null;
  translated_text: string;
  source_language_code: string;
}

export type TTSSpeaker =
  | 'Anushka'
  | 'Manisha'
  | 'Vidya'
  | 'Arya'
  | 'Ritu'
  | 'Priya'
  | 'Neha'
  | 'Pooja'
  | 'Simran'
  | 'Kavya'
  | 'Ishita'
  | 'Shreya'
  | 'Roopa'
  | 'Amelia'
  | 'Sophia'
  | 'Abhilash'
  | 'Karun'
  | 'Hitesh';

export type SpeakerGender = 'Male' | 'Female';

export const FEMALE_SPEAKERS: TTSSpeaker[] = ['Anushka', 'Manisha', 'Vidya', 'Arya', 'Ritu'];
export const MALE_SPEAKERS: TTSSpeaker[] = ['Abhilash', 'Karun'];

// Display names for speakers
export const SPEAKER_DISPLAY_NAMES: Record<TTSSpeaker, string> = {
  Anushka: 'Anushka (Female)',
  Manisha: 'Manisha (Female)',
  Vidya: 'Vidya (Female)',
  Arya: 'Arya (Female)',
  Ritu: 'Ritu (Female)',
  Priya: 'Priya (Female)',
  Neha: 'Neha (Female)',
  Pooja: 'Pooja (Female)',
  Simran: 'Simran (Female)',
  Kavya: 'Kavya (Female)',
  Ishita: 'Ishita (Female)',
  Shreya: 'Shreya (Female)',
  Roopa: 'Roopa (Female)',
  Amelia: 'Amelia (Female)',
  Sophia: 'Sophia (Female)',
  Abhilash: 'Abhilash (Male)',
  Karun: 'Karun (Male)',
  Hitesh: 'Hitesh (Male)',
};

export type TTSModel = 'bulbul:v2' | 'bulbul:v3-beta';

export interface TTSRequest {
  text: string;
  target_language_code: TargetLanguageCode;
  speaker?: TTSSpeaker;
  speaker_gender?: SpeakerGender;
  model?: TTSModel;
  pace?: number;
}

export interface TTSResponse {
  request_id: string | null;
  audios: string[]; // Base64-encoded WAV files
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

export async function textToSpeech(params: TTSRequest): Promise<TTSResponse> {
  const apiKey = getApiKey();
  const url = `${SARVAM_BASE}${TTS_PATH}`;

  // Select speaker based on gender if not explicitly provided
  let speaker: TTSSpeaker = params.speaker || 'Anushka';
  if (!params.speaker && params.speaker_gender) {
    speaker = params.speaker_gender === 'Female' 
      ? FEMALE_SPEAKERS[0] // Default: Anushka
      : MALE_SPEAKERS[0];   // Default: Abhilash
  }

  // Convert speaker name to lowercase as required by API
  const speakerLower = speaker.toLowerCase();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      text: params.text,
      target_language_code: params.target_language_code,
      speaker: speakerLower,
      model: params.model || 'bulbul:v2',
      pace: params.pace ?? 1.0,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let message = `Sarvam TTS API error ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      message = (errJson.detail ?? errJson.message ?? errText) || message;
    } catch {
      message = errText || message;
    }
    throw new Error(message);
  }

  const data = (await response.json()) as TTSResponse;
  return data;
}

/**
 * Convert base64 audio to a playable audio URL
 */
export function base64ToAudioUrl(base64Audio: string): string {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
