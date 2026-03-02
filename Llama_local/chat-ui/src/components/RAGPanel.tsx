import { useState, useEffect, useRef, type MutableRefObject } from 'react';
import {
  ingestDocument,
  listDocuments,
  deleteDocument,
  checkRAGHealth,
  listSamples,
  downloadAndIngestSample,
} from '../services/rag';
import type { SampleFile } from '../services/rag';

interface RAGPanelProps {
  visible: boolean;
  onClose: () => void;
  ragEnabled: boolean;
  onToggleRag: (enabled: boolean) => void;
  headerToggled: MutableRefObject<boolean>;
}

interface DocInfo {
  filename: string;
  chunks: number;
}

export default function RAGPanel({ visible, onClose, ragEnabled, onToggleRag, headerToggled }: RAGPanelProps) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [samples, setSamples] = useState<SampleFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [ragConnected, setRagConnected] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const userToggled = useRef(false);

  const refresh = async () => {
    try {
      const health = await checkRAGHealth();
      setRagConnected(health.status === 'ok');
      const [docData, sampleData] = await Promise.all([
        listDocuments(),
        listSamples(),
      ]);
      setDocs(docData.documents);
      setSamples(sampleData.samples);
      if (docData.documents.length === 0 && ragEnabled && !userToggled.current) {
        onToggleRag(false);
      }
    } catch {
      setRagConnected(false);
      setDocs([]);
      if (ragEnabled) onToggleRag(false);
    }
  };

  useEffect(() => {
    if (visible) {
      if (headerToggled.current) {
        userToggled.current = true;
        headerToggled.current = false;
      } else {
        userToggled.current = false;
      }
      refresh();
      setStatus('');
      setConfirmDelete(null);
    }
  }, [visible]);

  const isInstalled = (filename: string) =>
    docs.some((d) => d.filename === filename);

  const chunkCount = (filename: string) =>
    docs.find((d) => d.filename === filename)?.chunks ?? 0;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus(`Ingesting ${file.name}...`);
    try {
      const result = await ingestDocument(file);
      setStatus(`✓ ${result.message} (${result.chunks} chunks)`);
      await refresh();
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : 'Upload failed'}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleInstall = async (filename: string) => {
    setBusyFile(filename);
    setStatus(`Installing ${filename}...`);
    try {
      const result = await downloadAndIngestSample(filename);
      setStatus(`✓ Installed — ${result.chunks} chunks indexed`);
      await refresh();
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : 'Install failed'}`);
    } finally {
      setBusyFile(null);
    }
  };

  const handleRemove = async (filename: string) => {
    setConfirmDelete(null);
    setBusyFile(filename);
    setStatus(`Removing ${filename}...`);
    try {
      await deleteDocument(filename);
      setStatus(`✓ Removed "${filename}" from knowledge base`);
      await refresh();
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : 'Remove failed'}`);
    } finally {
      setBusyFile(null);
    }
  };

  if (!visible) return null;

  return (
    <>
      <div className="rag-overlay" onClick={onClose} />
      <div className="rag-panel">
        <div className="rag-panel-header">
          <h3>📚 Knowledge Base</h3>
          <div
            className={`rag-power-toggle ${ragEnabled ? 'on' : ''}`}
            onClick={() => {
              userToggled.current = true;
              onToggleRag(!ragEnabled);
              if (ragEnabled) onClose();
            }}
            title={ragEnabled ? 'Turn RAG OFF' : 'Turn RAG ON'}
          >
            <span className="rag-power-label">{ragEnabled ? 'ON' : 'OFF'}</span>
            <div className="rag-power-track">
              <div className="rag-power-thumb" />
            </div>
          </div>
          <button className="rag-close" onClick={onClose}>×</button>
        </div>

        {ragEnabled ? (
          <div className="rag-enabled-banner">
            ✓ RAG mode active — answers will use installed documents
          </div>
        ) : docs.length === 0 ? (
          <div className="rag-disabled-banner">
            Install at least one document below to enable RAG
          </div>
        ) : null}

        {!ragConnected && (
          <div className="rag-warning">
            RAG server not running. Start it with:<br />
            <code>cd Llama_local/rag-server && ./start.sh</code>
          </div>
        )}

        {status && (
          <p className={`rag-status-msg ${status.startsWith('✓') ? 'success' : status.startsWith('✗') ? 'error' : ''}`}>
            {status}
          </p>
        )}

        {/* Sample Data Files */}
        {samples.length > 0 && (
          <div className="rag-section">
            <h4 className="rag-section-title">Sample Data Files</h4>
            <p className="rag-section-hint">Install to add to knowledge base. Remove to stop using.</p>
            <div className="rag-sample-list">
              {samples.map((s) => {
                const installed = isInstalled(s.filename);
                const busy = busyFile === s.filename;
                return (
                  <div
                    key={s.filename}
                    className={`rag-sample-card ${installed ? 'installed' : ''}`}
                  >
                    <div className="rag-sample-top">
                      <span className="rag-sample-icon">{s.icon}</span>
                      <div className="rag-sample-info">
                        <span className="rag-sample-title">{s.title}</span>
                        <span className="rag-sample-size">
                          {s.size_kb} KB
                          {installed && <span className="rag-installed-badge">● Installed · {chunkCount(s.filename)} chunks</span>}
                        </span>
                      </div>
                    </div>
                    <p className="rag-sample-desc">{s.description}</p>
                    <div className="rag-sample-footer">
                      {installed ? (
                        confirmDelete === s.filename ? (
                          <div className="rag-confirm-row">
                            <span>Remove from knowledge base?</span>
                            <button className="rag-btn-yes" onClick={() => handleRemove(s.filename)} disabled={busy}>
                              Yes, remove
                            </button>
                            <button className="rag-btn-no" onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="rag-btn remove"
                            onClick={() => setConfirmDelete(s.filename)}
                            disabled={busy}
                          >
                            {busy ? 'Removing...' : '🗑 Remove'}
                          </button>
                        )
                      ) : (
                        <button
                          className="rag-btn install"
                          onClick={() => handleInstall(s.filename)}
                          disabled={busy || !ragConnected}
                        >
                          {busy ? 'Installing...' : '📥 Install'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Upload */}
        <div className="rag-section">
          <h4 className="rag-section-title">Custom Upload</h4>
          <div className="rag-upload-area">
            <label className="rag-upload-btn">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.pdf,.docx,.json,.csv,.py,.ts,.js,.tsx,.jsx"
                onChange={handleUpload}
                disabled={uploading || !ragConnected}
                hidden
              />
              {uploading ? 'Uploading...' : '+ Upload Document'}
            </label>
            <p className="rag-upload-hint">Supports: txt, md, pdf, docx, json, csv, py, ts, js</p>
          </div>
        </div>

        {/* Installed Documents */}
        {docs.length > 0 && (
          <div className="rag-section">
            <h4 className="rag-section-title">Installed Documents ({docs.length})</h4>
            <div className="rag-doc-list">
              {docs
                .filter((d) => !samples.some((s) => s.filename === d.filename))
                .map((doc) => (
                  <div key={doc.filename} className="rag-doc-item">
                    <div className="rag-doc-info">
                      <span className="rag-doc-name">📄 {doc.filename}</span>
                      <span className="rag-doc-chunks">{doc.chunks} chunks</span>
                    </div>
                    {confirmDelete === doc.filename ? (
                      <div className="rag-confirm-delete">
                        <span>Remove?</span>
                        <button className="rag-confirm-yes" onClick={() => handleRemove(doc.filename)}>Yes</button>
                        <button className="rag-confirm-no" onClick={() => setConfirmDelete(null)}>No</button>
                      </div>
                    ) : (
                      <button
                        className="rag-doc-delete"
                        onClick={() => setConfirmDelete(doc.filename)}
                        title="Remove from knowledge base"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
