import { useState, useEffect, useRef } from 'react';
import { getTranslationHistory, deleteTranslation } from '../services/translationHistory';
import { type TranslationHistory } from '../services/supabase';
import { LANGUAGES } from '../constants/languages';
import { textToSpeech, base64ToAudioUrl, type TTSSpeaker, type TargetLanguageCode } from '../services/sarvamApi';
import { getPronunciationFromAPI } from '../services/pronunciation';

interface TranslationHistoryProps {
  refreshTrigger?: number;
  selectedSpeaker?: TTSSpeaker;
}

export default function TranslationHistory({ refreshTrigger, selectedSpeaker = 'Manisha' }: TranslationHistoryProps) {
  const [history, setHistory] = useState<TranslationHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const [currentPlayingType, setCurrentPlayingType] = useState<'source' | 'translated' | null>(null);
  const [pausedItemId, setPausedItemId] = useState<string | null>(null);
  const [pausedAtType, setPausedAtType] = useState<'source' | 'translated' | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});
  const [pronunciations, setPronunciations] = useState<Record<string, string>>({});
  const audioRefs = useRef<Record<string, { source?: HTMLAudioElement; translated?: HTMLAudioElement }>>({});
  const sequenceTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTranslationHistory(20);
      setHistory(data);
      
      // Fetch pronunciations for English translations with word count <= 2
      const pronunciationPromises = data
        .filter(item => {
          if (item.target_language_code !== 'en-IN' || !item.id) return false;
          const wordCount = item.translated_text.trim().split(/\s+/).length;
          return wordCount <= 2;
        })
        .map(async (item) => {
          try {
            const pronunciation = await getPronunciationFromAPI(
              item.translated_text,
              item.target_language_code
            );
            if (item.id && pronunciation) {
              setPronunciations(prev => ({ ...prev, [item.id!]: pronunciation }));
            }
          } catch (err) {
            console.warn(`Failed to get pronunciation for item ${item.id}:`, err);
          }
        });
      
      // Fetch pronunciations in parallel (don't await to avoid blocking)
      Promise.all(pronunciationPromises).catch(err => {
        console.error('Error fetching pronunciations:', err);
      });
    } catch (err) {
      setError('Failed to load translation history');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to pause all audio in history
  const pauseAllHistoryAudio = () => {
    Object.keys(audioRefs.current).forEach(key => {
      audioRefs.current[key].source?.pause();
      audioRefs.current[key].translated?.pause();
    });
    // Clear any pending sequence timeouts
    Object.values(sequenceTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
    sequenceTimeoutRef.current = {};
    setPlayingItemId(null);
    setCurrentPlayingType(null);
    setPausedItemId(null);
    setPausedAtType(null);
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Pause all audio when history section is collapsed/hidden
  useEffect(() => {
    if (!expanded) {
      pauseAllHistoryAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audioObj => {
        audioObj.source?.pause();
        audioObj.translated?.pause();
        audioObj.source && (audioObj.source.src = '');
        audioObj.translated && (audioObj.translated.src = '');
      });
      Object.values(sequenceTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
      audioRefs.current = {};
      sequenceTimeoutRef.current = {};
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (audioRefs.current[id]) {
      audioRefs.current[id].source?.pause();
      audioRefs.current[id].translated?.pause();
      delete audioRefs.current[id];
    }
    if (sequenceTimeoutRef.current[id]) {
      clearTimeout(sequenceTimeoutRef.current[id]);
      delete sequenceTimeoutRef.current[id];
    }
    const success = await deleteTranslation(id);
    if (success) {
      setHistory(history.filter(item => item.id !== id));
      setPlayingItemId(prev => prev === id ? null : prev);
      setCurrentPlayingType(null);
      setPausedItemId(prev => prev === id ? null : prev);
      setPausedAtType(null);
      setLoadingItemId(prev => prev === id ? null : prev);
    }
  };

  // Play a single audio (source or translated) and return promise
  const playSingleAudio = async (
    item: TranslationHistory, 
    type: 'source' | 'translated',
    onEndedCallback?: () => void
  ): Promise<boolean> => {
    const itemId = item.id!;
    const text = type === 'source' ? item.source_text : item.translated_text;
    
    let languageCode: TargetLanguageCode;
    if (type === 'source') {
      if (item.source_language_code === 'auto') {
        if (item.detected_language_code) {
          languageCode = item.detected_language_code as TargetLanguageCode;
        } else {
          setAudioErrors(prev => ({ ...prev, [itemId]: 'Source language not detected.' }));
          return false;
        }
      } else {
        languageCode = item.source_language_code as TargetLanguageCode;
      }
    } else {
      languageCode = item.target_language_code as TargetLanguageCode;
    }

    if (!text || text.trim() === '') {
      setAudioErrors(prev => ({ ...prev, [itemId]: 'No text to play.' }));
      return false;
    }

    try {
      const ttsResponse = await textToSpeech({
        text: text,
        target_language_code: languageCode,
        speaker: selectedSpeaker,
        model: 'bulbul:v2',
        pace: 1.0,
      });

      if (ttsResponse.audios && ttsResponse.audios.length > 0) {
        const audioUrl = base64ToAudioUrl(ttsResponse.audios[0]);
        const audio = new Audio(audioUrl);
        
        if (!audioRefs.current[itemId]) {
          audioRefs.current[itemId] = {};
        }
        audioRefs.current[itemId][type] = audio;

        return new Promise((resolve) => {
          audio.onplay = () => {
            setPlayingItemId(itemId);
            setCurrentPlayingType(type);
            setPausedItemId(null);
            setPausedAtType(null);
            setLoadingItemId(null);
          };

          audio.onpause = () => {
            setPlayingItemId(prev => prev === itemId ? null : prev);
            setCurrentPlayingType(prev => prev === type ? null : prev);
            setPausedItemId(itemId);
            setPausedAtType(type);
          };

          audio.onended = () => {
            if (audioRefs.current[itemId]) {
              delete audioRefs.current[itemId][type];
              if (!audioRefs.current[itemId].source && !audioRefs.current[itemId].translated) {
                delete audioRefs.current[itemId];
              }
            }
            setPlayingItemId(prev => prev === itemId ? null : prev);
            setCurrentPlayingType(prev => prev === type ? null : prev);
            setPausedItemId(prev => prev === itemId ? null : prev);
            setPausedAtType(prev => prev === type ? null : prev);
            setLoadingItemId(prev => prev === itemId ? null : prev);
            
            // Call custom callback if provided (for sequential playback)
            if (onEndedCallback) {
              onEndedCallback();
            }
            
            resolve(true);
          };

          audio.onerror = () => {
            setAudioErrors(prev => ({ ...prev, [itemId]: 'Failed to play audio.' }));
            setLoadingItemId(prev => prev === itemId ? null : prev);
            setPlayingItemId(prev => prev === itemId ? null : prev);
            setCurrentPlayingType(prev => prev === type ? null : prev);
            setPausedItemId(prev => prev === itemId ? null : prev);
            setPausedAtType(prev => prev === type ? null : prev);
            if (audioRefs.current[itemId]) {
              delete audioRefs.current[itemId][type];
            }
            resolve(false);
          };

          audio.play().catch(() => {
            setAudioErrors(prev => ({ ...prev, [itemId]: 'Failed to play audio.' }));
            setLoadingItemId(prev => prev === itemId ? null : prev);
            resolve(false);
          });
        });
      } else {
        setAudioErrors(prev => ({ ...prev, [itemId]: 'No audio received from API.' }));
        setLoadingItemId(prev => prev === itemId ? null : prev);
        return false;
      }
    } catch (err) {
      setAudioErrors(prev => ({ ...prev, [itemId]: err instanceof Error ? err.message : 'Failed to generate audio.' }));
      setLoadingItemId(prev => prev === itemId ? null : prev);
      return false;
    }
  };

  // Handle sequential playback: source first, then translated after 1 second gap
  const handlePlaySequence = async (item: TranslationHistory) => {
    const itemId = item.id!;

    // Pause ALL other audio in history
    pauseAllHistoryAudio();

    // If paused, resume from where we left off
    if (pausedItemId === itemId && pausedAtType) {
      const audio = audioRefs.current[itemId]?.[pausedAtType];
      if (audio) {
        try {
          await audio.play();
          setPlayingItemId(itemId);
          setCurrentPlayingType(pausedAtType);
          setPausedItemId(null);
          setPausedAtType(null);
          
          // If we resumed source, set up to play translated after it ends
          if (pausedAtType === 'source') {
            const sourceAudio = audioRefs.current[itemId]?.source;
            if (sourceAudio) {
              const playTranslatedAfterSource = async () => {
                setLoadingItemId(itemId);
                const success = await playSingleAudio(item, 'translated');
                if (!success) {
                  setPlayingItemId(prev => prev === itemId ? null : prev);
                  setCurrentPlayingType(null);
                  setLoadingItemId(prev => prev === itemId ? null : prev);
                }
              };
              
              sourceAudio.onended = playTranslatedAfterSource;
            }
          }
          return;
        } catch (err) {
          setAudioErrors(prev => ({ ...prev, [itemId]: 'Failed to resume audio.' }));
          return;
        }
      }
    }

    // Clear errors
    setAudioErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[itemId];
      return newErrors;
    });

    // Check if source language is available
    const canPlaySource = item.source_language_code !== 'auto' || item.detected_language_code;
    
    if (canPlaySource) {
      // Play source first with callback to play translated immediately after
      setLoadingItemId(itemId);
      
      const playTranslatedAfterSource = async () => {
        // Call API and play translated immediately
        setLoadingItemId(itemId);
        const success = await playSingleAudio(item, 'translated');
        if (!success) {
          setPlayingItemId(prev => prev === itemId ? null : prev);
          setCurrentPlayingType(null);
          setLoadingItemId(prev => prev === itemId ? null : prev);
        }
      };
      
      const sourceSuccess = await playSingleAudio(item, 'source', playTranslatedAfterSource);
      
      if (!sourceSuccess) {
        return;
      }
    } else {
      // Skip source, play only translated
      setLoadingItemId(itemId);
      await playSingleAudio(item, 'translated');
    }
  };

  const handlePausePlayToggle = (itemId: string) => {
    if (playingItemId === itemId) {
      // Pause current audio
      const currentType = currentPlayingType;
      if (currentType && audioRefs.current[itemId]?.[currentType]) {
        audioRefs.current[itemId][currentType]?.pause();
      }
      // Clear any pending sequence timeout
      if (sequenceTimeoutRef.current[itemId]) {
        clearTimeout(sequenceTimeoutRef.current[itemId]);
        delete sequenceTimeoutRef.current[itemId];
      }
    } else if (pausedItemId === itemId) {
      // Resume from pause
      pauseAllHistoryAudio();
      const pausedType = pausedAtType;
      if (pausedType && audioRefs.current[itemId]?.[pausedType]) {
        // Find the item to get its data
        const item = history.find(h => h.id === itemId);
        if (!item) return;
        
        audioRefs.current[itemId][pausedType]?.play();
        
        // If resuming source, set up translated to play after
        if (pausedType === 'source') {
          const sourceAudio = audioRefs.current[itemId]?.source;
          if (sourceAudio) {
            const playTranslatedAfterSource = async () => {
              setLoadingItemId(itemId);
              const success = await playSingleAudio(item, 'translated');
              if (!success) {
                setPlayingItemId(prev => prev === itemId ? null : prev);
                setCurrentPlayingType(null);
                setLoadingItemId(prev => prev === itemId ? null : prev);
              }
            };
            
            sourceAudio.onended = playTranslatedAfterSource;
          }
        }
      }
    }
  };

  const getLanguageName = (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang ? lang.name : code;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="translation-history">
      <div className="history-header" onClick={() => setExpanded(!expanded)}>
        <div className="history-title">
          <span>📜 Translation History</span>
          <span className="history-count">({history.length})</span>
        </div>
        <button className="history-toggle" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className="history-content">
          {loading && <div className="history-loading">Loading history...</div>}
          {error && <div className="history-error">{error}</div>}
          {!loading && !error && history.length === 0 && (
            <div className="history-empty">No translation history yet. Start translating to see your history here!</div>
          )}
          {!loading && !error && history.length > 0 && (
            <div className="history-list">
              {history.map((item) => {
                const itemId = item.id!;
                const isPlaying = playingItemId === itemId;
                const isPaused = pausedItemId === itemId;
                const isLoading = loadingItemId === itemId;
                
                return (
                  <div key={itemId} className="history-item">
                    <div className="history-item-header">
                      <div className="history-languages">
                        <span className="lang-badge source-lang">
                          {item.source_language_code === 'auto' ? 'Auto' : getLanguageName(item.source_language_code)}
                        </span>
                        <span className="lang-arrow">→</span>
                        <span className="lang-badge target-lang">
                          {getLanguageName(item.target_language_code)}
                        </span>
                      </div>
                      <div className="history-item-actions">
                        <div className="history-audio-controls">
                          {isLoading ? (
                            <button
                              className="history-audio-btn"
                              disabled
                              title="Loading audio..."
                              aria-label="Loading audio"
                            >
                              <span className="audio-icon-loading">⏳</span>
                            </button>
                          ) : isPlaying ? (
                            <button
                              className="history-audio-btn"
                              onClick={() => handlePausePlayToggle(itemId)}
                              title="Pause audio"
                              aria-label="Pause audio"
                            >
                              <span className="audio-icon-pause">⏸</span>
                            </button>
                          ) : isPaused ? (
                            <button
                              className="history-audio-btn"
                              onClick={() => handlePausePlayToggle(itemId)}
                              title="Play audio"
                              aria-label="Play audio"
                            >
                              <span className="audio-icon-play">▶</span>
                            </button>
                          ) : (
                            <button
                              className="history-audio-btn"
                              onClick={() => handlePlaySequence(item)}
                              title="Play source and translated text"
                              aria-label="Play source and translated text"
                            >
                              <span className="audio-icon-speaker">🔊</span>
                            </button>
                          )}
                        </div>
                        <span className="history-date">{formatDate(item.created_at)}</span>
                        <button
                          className="history-delete-btn"
                          onClick={() => handleDelete(itemId)}
                          title="Delete"
                          aria-label="Delete translation"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="history-item-content">
                      <div className="history-source">
                        <strong>Source:</strong> {item.source_text}
                      </div>
                      <div className="history-translated">
                        <strong>Translated:</strong>{' '}
                        {(() => {
                          // Only remove commas if source text doesn't have commas
                          const sourceHasCommas = item.source_text.includes(',');
                          return sourceHasCommas ? item.translated_text : item.translated_text.replace(/,/g, '');
                        })()}
                        {(() => {
                          const wordCount = item.translated_text.trim().split(/\s+/).length;
                          // Show pronunciation only if English and word count <= 2
                          if (item.target_language_code === 'en-IN' && wordCount <= 2 && pronunciations[itemId]) {
                            return (
                              <div className="pronunciation-text" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                <span className="pronunciation-label" style={{ fontWeight: 600 }}>Pronunciation:</span> {pronunciations[itemId]}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      {audioErrors[itemId] && (
                        <div className="history-audio-error">{audioErrors[itemId]}</div>
                      )}
                      {item.detected_language_code && item.source_language_code === 'auto' && (
                        <div className="history-detected">
                          <small>Detected: {getLanguageName(item.detected_language_code)}</small>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
