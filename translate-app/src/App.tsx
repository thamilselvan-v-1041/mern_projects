import { useState } from 'react';
import { translate, type TargetLanguageCode, type SourceLanguageCode } from './services/sarvamApi';
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

  const sourceOptions = [
    { code: SOURCE_AUTO as SourceLanguageCode, name: 'Auto-detect' },
    ...LANGUAGES,
  ];

  return (
    <div className="app">
      <header className="header">
        <h1>Translate</h1>
        <p className="subtitle">Powered by DuRai</p>
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
            <h2>Translation</h2>
            {detectedSource && sourceLang === 'auto' && (
              <p className="detected">Detected language: {detectedSource}</p>
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
