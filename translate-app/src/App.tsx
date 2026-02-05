import { useState, useRef, useEffect } from 'react';
import { translate, transliterate, textToSpeech, base64ToAudioUrl, type TargetLanguageCode, type SourceLanguageCode, type TTSSpeaker, FEMALE_SPEAKERS, MALE_SPEAKERS, SPEAKER_DISPLAY_NAMES } from './services/sarvamApi';
import { LANGUAGES, SOURCE_AUTO } from './constants/languages';
import { saveTranslation } from './services/translationHistory';
import TranslationHistory from './components/TranslationHistory';
import { getPronunciationFromAPI } from './services/pronunciation';
import './App.css';

function App() {
  const [inputText, setInputText] = useState('');
  const [sourceLang, setSourceLang] = useState<SourceLanguageCode>('auto');
  const [targetLang, setTargetLang] = useState<TargetLanguageCode>('en-IN');
  const [result, setResult] = useState<string | null>(null);
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<TTSSpeaker>('Manisha');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [pronunciation, setPronunciation] = useState<string | null>(null);
  const [transliteratedText, setTransliteratedText] = useState<string | null>(null);
  const [transliterating, setTransliterating] = useState(false);
  const [originalEnglishText, setOriginalEnglishText] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleClearText = () => {
    setInputText('');
    setTransliteratedText(null);
    setOriginalEnglishText('');
    setResult(null);
    setDetectedSource(null);
    setPronunciation(null);
    setError(null);
    setAudioError(null);
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handleSwitchLanguages = () => {
    if (sourceLang === 'auto') {
      setSourceLang(targetLang);
      const newTarget: TargetLanguageCode =
        detectedSource && LANGUAGES.some((l) => l.code === detectedSource)
          ? (detectedSource as TargetLanguageCode)
          : 'en-IN';
      setTargetLang(newTarget);
    } else {
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
    }
    if (result !== null) {
      setInputText(result);
      setResult(null);
      setDetectedSource(null);
      setPronunciation(null);
    }
  };

  const handleTranslate = async () => {
    // Use original English text for translation if transliteration was applied
    // Otherwise use the input text as-is
    const textToTranslate = transliteratedText && originalEnglishText ? originalEnglishText : inputText;
    const trimmed = textToTranslate.trim();
    if (!trimmed) {
      setError('Please enter some text to translate.');
      return;
    }
    setError(null);
    setResult(null);
    setDetectedSource(null);
    setLoading(true);
    try {
      const response = await translate({
        input: trimmed,
        source_language_code: sourceLang,
        target_language_code: targetLang,
      });
      setResult(response.translated_text);
      setDetectedSource(response.source_language_code);
      
      // Get pronunciation for all English translations
      if (targetLang === 'en-IN') {
        try {
          const pronunciationText = await getPronunciationFromAPI(
            response.translated_text,
            targetLang
          );
          setPronunciation(pronunciationText);
        } catch (err) {
          console.error('Failed to get pronunciation:', err);
          setPronunciation(null);
        }
      } else {
        setPronunciation(null);
      }

      // Save translation to Supabase history
      const saved = await saveTranslation({
        source_text: trimmed,
        translated_text: response.translated_text,
        source_language_code: sourceLang,
        target_language_code: targetLang,
        detected_language_code: response.source_language_code,
      });
      
      // Refresh history if translation was saved
      if (saved) {
        setHistoryRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpeakerChange = async (speaker: TTSSpeaker) => {
    setSelectedSpeaker(speaker);
    // Auto-generate audio when speaker changes if there's a result
    if (result && result.trim() !== '') {
      await handlePlayAudioWithSpeaker(speaker);
    }
  };

  const handlePlayAudioWithSpeaker = async (speaker?: TTSSpeaker) => {
    const speakerToUse = speaker || selectedSpeaker;
    if (!result || result.trim() === '') {
      setAudioError('No text to play.');
      return;
    }

    // If audio is paused, resume it
    if (audioRef.current && isPaused) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        setIsPaused(false);
        return;
      } catch (err) {
        setAudioError('Failed to resume audio.');
        return;
      }
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setAudioError(null);
    setAudioLoading(true);
    setIsPlaying(false);
    setIsPaused(false);

    try {
      const ttsResponse = await textToSpeech({
        text: result,
        target_language_code: targetLang,
        speaker: speakerToUse,
        model: 'bulbul:v2',
        pace: 1.0,
      });

      if (ttsResponse.audios && ttsResponse.audios.length > 0) {
        const audioUrl = base64ToAudioUrl(ttsResponse.audios[0]);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setIsPlaying(true);
          setIsPaused(false);
          setAudioLoading(false);
        };

        audio.onpause = () => {
          setIsPlaying(false);
          setIsPaused(true);
        };

        audio.onended = () => {
          audioRef.current = null;
          setAudioLoading(false);
          setIsPlaying(false);
          setIsPaused(false);
        };

        audio.onerror = () => {
          setAudioError('Failed to play audio.');
          setAudioLoading(false);
          setIsPlaying(false);
          setIsPaused(false);
          audioRef.current = null;
        };

        await audio.play();
      } else {
        setAudioError('No audio received from API.');
        setAudioLoading(false);
      }
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Failed to generate audio.');
      setAudioLoading(false);
    }
  };

  const handlePausePlayToggle = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else if (isPaused) {
      audioRef.current.play();
    }
  };

  // Apply transliteration for full text when user types in English and target is an Indic language
  useEffect(() => {
    const applyTransliteration = async () => {
      // Only transliterate if:
      // 1. Source is English (en-IN)
      // 2. Target is an Indic language (not English)
      // 3. There's input text
      const isSourceEnglish = sourceLang === 'en-IN';
      const isTargetIndic = targetLang !== 'en-IN';
      
      if (!isSourceEnglish || !isTargetIndic || inputText.trim().length === 0) {
        setTransliteratedText(null);
        setOriginalEnglishText('');
        return;
      }

      // Store original English text
      setOriginalEnglishText(inputText);
      setTransliterating(true);
      try {
        const transliterateResponse = await transliterate({
          input: inputText,
          source_language_code: 'en-IN',
          target_language_code: targetLang,
        });
        setTransliteratedText(transliterateResponse.transliterated_text);
      } catch (err) {
        console.error('Transliteration failed:', err);
        setTransliteratedText(null);
      } finally {
        setTransliterating(false);
      }
    };

    // Debounce transliteration to avoid too many API calls
    const timeoutId = setTimeout(() => {
      applyTransliteration();
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [inputText, sourceLang, targetLang]);



  const sourceOptions = [
    { code: SOURCE_AUTO as SourceLanguageCode, name: 'Auto-detect' },
    ...LANGUAGES,
  ];

  return (
    <div className="app">
      <header className="header">
        <h1>Translate</h1>
        <p className="subtitle">Powered by Jambav</p>
      </header>

      <main className="main">
        <div className="card input-card">
          <label htmlFor="input">Text to translate</label>
          <textarea
            id="input"
            value={transliteratedText || inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (transliteratedText) {
                setTransliteratedText(null);
              }
            }}
            placeholder="Enter text..."
            rows={4}
            maxLength={1000}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <span className="hint">Max 1000 characters</span>
            {(inputText || transliteratedText) && (
              <button
                type="button"
                onClick={handleClearText}
                className="clear-text-btn"
                title="Clear"
                aria-label="Clear"
              >
                Clear
              </button>
            )}
          </div>
          {transliterating && (
            <span className="hint" style={{ color: 'var(--muted)', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
              Transliterating...
            </span>
          )}

          <div className="lang-row">
            <div className="field">
              <label>From</label>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value as SourceLanguageCode)}
              >
                {sourceOptions.map(({ code, name }) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="switch-btn"
              onClick={handleSwitchLanguages}
              title="Switch languages"
              aria-label="Switch source and target languages"
            >
              ⇄
            </button>
            <div className="field">
              <label>To</label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as TargetLanguageCode)}
              >
                {LANGUAGES.map(({ code, name }) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>


          <button
            type="button"
            className="translate-btn"
            onClick={handleTranslate}
            disabled={loading}
          >
            {loading ? 'Translating…' : 'Translate'}
          </button>
        </div>

        {error && (
          <div className="card error-card" role="alert">
            {error}
          </div>
        )}

        {(result !== null || loading) && (
          <div className="card result-card">
            <div className="result-header">
              <h2>Translation</h2>
            </div>
            {detectedSource && sourceLang === 'auto' && (
              <p className="detected">Detected language: {detectedSource}</p>
            )}
            {audioError && (
              <p className="audio-error">{audioError}</p>
            )}
            <div className="result-content">
              <div className="result-text">
                {loading ? '…' : (() => {
                  if (!result) return '';
                  // Only remove commas if source text doesn't have commas
                  const sourceHasCommas = inputText.includes(',');
                  return sourceHasCommas ? result : result.replace(/,/g, '');
                })()}
              </div>
              {result && !loading && targetLang === 'en-IN' && (
                <div className="pronunciation-text">
                  <div className="pronunciation-content">
                    <span className="pronunciation-label">Pronunciation:</span> {pronunciation || 'Loading...'}
                  </div>
                  <div className="audio-controls">
                    <select
                      className="speaker-select"
                      value={selectedSpeaker}
                      onChange={(e) => handleSpeakerChange(e.target.value as TTSSpeaker)}
                      disabled={audioLoading}
                    >
                      <optgroup label="Female Voices">
                        {FEMALE_SPEAKERS.map((speaker) => (
                          <option key={speaker} value={speaker}>
                            {SPEAKER_DISPLAY_NAMES[speaker]}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Male Voices">
                        {MALE_SPEAKERS.map((speaker) => (
                          <option key={speaker} value={speaker}>
                            {SPEAKER_DISPLAY_NAMES[speaker]}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <button
                      type="button"
                      className="play-audio-btn"
                      onClick={isPlaying || isPaused ? handlePausePlayToggle : () => handlePlayAudioWithSpeaker()}
                      disabled={audioLoading}
                      title={isPlaying ? 'Pause audio' : isPaused ? 'Play audio' : 'Play audio'}
                      aria-label={isPlaying ? 'Pause audio' : isPaused ? 'Play audio' : 'Play translated text audio'}
                    >
                      {audioLoading ? (
                        <span className="audio-icon-loading">⏳</span>
                      ) : isPlaying ? (
                        <span className="audio-icon-pause">⏸</span>
                      ) : isPaused ? (
                        <span className="audio-icon-play">▶</span>
                      ) : (
                        <span className="audio-icon-speaker">🔊</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Translation History */}
        <TranslationHistory refreshTrigger={historyRefreshTrigger} selectedSpeaker={selectedSpeaker} />
      </main>
    </div>
  );
}

export default App;
