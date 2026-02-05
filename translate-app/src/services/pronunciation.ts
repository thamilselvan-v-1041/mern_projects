/**
 * Pronunciation helper functions
 * Generates phonetic pronunciation guide for translated text
 */

/**
 * Get pronunciation using Web Speech API or phonetic approximation
 * For Indian languages, provides a simple phonetic guide
 */
export async function getPronunciation(
  text: string,
  languageCode: string
): Promise<string> {
  // For now, return a simple phonetic representation
  // This can be enhanced with a pronunciation API later
  return text;
}

/**
 * Format pronunciation with phonetic hints
 * This is a simple implementation - can be enhanced with actual pronunciation API
 */
export function formatPronunciation(text: string, languageCode: string): string {
  // Simple phonetic guide - for now just return the text
  // In production, this would call a pronunciation API or use phonetic rules
  return text;
}

/**
 * Get pronunciation using free public APIs
 * Options:
 * 1. Free Dictionary API (dictionaryapi.dev) - Free, no API key required
 * 2. WordsAPI - Requires API key but has pronunciation
 * 3. Dictionary.com API - Some free access
 */
export async function getPronunciationFromAPI(
  text: string,
  languageCode: string
): Promise<string> {
  // Only fetch pronunciation for English
  if (languageCode !== 'en-IN') {
    return text;
  }

  try {
    // Split text into words
    const words = text.trim().split(/\s+/);
    const pronunciations: string[] = [];

    // Fetch pronunciation for all words using Free Dictionary API
    // API: https://api.dictionaryapi.dev/api/v2/entries/en/{word}
    const phoneticParts: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Clean word (remove punctuation)
      const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
      
      if (!cleanWord) {
        continue;
      }

      try {
        const response = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          
          // Extract phonetic pronunciation from API response
          if (Array.isArray(data) && data.length > 0) {
            const entry = data[0];
            
            // Try to get phonetic text or pronunciation
            let phonetic = '';
            if (entry.phonetic) {
              phonetic = entry.phonetic;
            } else if (entry.phonetics && Array.isArray(entry.phonetics) && entry.phonetics.length > 0) {
              // Get first phonetic that has text
              const phoneticEntry = entry.phonetics.find((p: any) => p.text);
              if (phoneticEntry) {
                phonetic = phoneticEntry.text;
              }
            }
            
            if (phonetic) {
              // Remove any commas from phonetic text
              const cleanPhonetic = phonetic.replace(/,/g, '');
              phoneticParts.push(cleanPhonetic);
            }
          }
        }
      } catch (wordError) {
        // If individual word fails, skip it
        console.warn(`Failed to get pronunciation for "${word}":`, wordError);
      }
    }

    // Return only the phonetic pronunciations separated by space (no commas)
    return phoneticParts.join(' ');
  } catch (error) {
    console.error('Error getting pronunciation:', error);
    return text;
  }
}
