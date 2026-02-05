import { useState, useRef } from 'react';
import { translate, textToSpeech, base64ToAudioUrl, type TargetLanguageCode, type SourceLanguageCode, type TTSSpeaker, FEMALE_SPEAKERS, MALE_SPEAKERS, SPEAKER_DISPLAY_NAMES } from './services/sarvamApi';
import { LANGUAGES, SOURCE_AUTO } from './constants/languages';
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    }
  };

  const handleTranslate = async () => {
    const trimmed = inputText.trim();
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
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text..."
            rows={4}
            maxLength={1000}
          />
          <span className="hint">Max 1000 characters</span>

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
              {result && !loading && (
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
                    {audioLoading ? '⏳' : isPlaying ? '⏸' : isPaused ? '▶' : '🔊'}
                  </button>
                </div>
              )}
            </div>
            {detectedSource && sourceLang === 'auto' && (
              <p className="detected">Detected language: {detectedSource}</p>
            )}
            {audioError && (
              <p className="audio-error">{audioError}</p>
            )}
            <div className="result-text">
              {loading ? '…' : result}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
