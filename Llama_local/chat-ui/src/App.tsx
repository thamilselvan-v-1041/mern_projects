import { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, Conversation } from './types';
import { streamChat, checkConnection } from './services/ollama';
import { streamRAGResponse, listDocuments, checkRAGHealth } from './services/rag';
import { streamSmartChat } from './services/langchain';
import { loadConversations, saveConversations, generateId } from './services/storage';
import MessageBubble from './components/MessageBubble';
import ChatInput from './components/ChatInput';
import Sidebar from './components/Sidebar';
import RAGPanel from './components/RAGPanel';

function newConversation(): Conversation {
  return {
    id: generateId(),
    title: 'New chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragPanelOpen, setRagPanelOpen] = useState(false);
  const [ragSources, setRagSources] = useState<string[]>([]);
  const [langchainEnabled, setLangchainEnabled] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const ragUserToggled = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) || null;
  const conversationsRef = useRef(conversations);

  useEffect(() => {
    conversationsRef.current = conversations;
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    checkConnection().then(setConnected);
    const iv = setInterval(() => checkConnection().then(setConnected), 10000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    checkRAGHealth().catch(() => {});
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  useEffect(scrollToBottom, [active?.messages.length, scrollToBottom]);

  const handleNewChat = useCallback(() => {
    const c = newConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setRagSources([]);
    setActiveProvider('');
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setActiveId(id);
    setRagSources([]);
    setActiveProvider('');
  }, []);

  const handleDeleteChat = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const handleSend = useCallback(async (text: string) => {
    let targetId = activeId;
    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    if (!targetId) {
      const c = newConversation();
      c.messages = [userMsg];
      c.title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
      c.updatedAt = Date.now();
      targetId = c.id;
      setConversations((prev) => [c, ...prev]);
      setActiveId(targetId);
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? {
                ...c,
                messages: [...c.messages, userMsg],
                title: c.messages.length === 0
                  ? text.slice(0, 50) + (text.length > 50 ? '...' : '')
                  : c.title,
                updatedAt: Date.now(),
              }
            : c
        )
      );
    }

    const assistantMsg: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() }
          : c
      )
    );

    setStreaming(true);
    setRagSources([]);
    setActiveProvider('');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const existing = conversationsRef.current.find((c) => c.id === targetId);
      const allMessages = [...(existing?.messages || []), userMsg];

      let accumulated = '';
      let resolvedProvider = 'ollama';

      const updateMsg = (content: string, provider?: string) => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content, ...(provider ? { provider } : {}) }
                      : m
                  ),
                }
              : c
          )
        );
        scrollToBottom();
      };

      const ragLacksAnswer = (text: string) => {
        const lower = text.toLowerCase();
        return (
          lower.includes('not available in the knowledge base') ||
          lower.includes('no documents are installed') ||
          lower.includes('no direct connection') ||
          lower.includes('does not contain') ||
          lower.includes('not mentioned in') ||
          lower.includes('no relevant information') ||
          lower.includes('no information available') ||
          lower.includes('not found in the') ||
          lower.includes('knowledge base does not') ||
          lower.includes('unable to find')
        );
      };

      const runSmartFallback = async () => {
        accumulated = '';
        setActiveProvider('groq');
        updateMsg('_Searching the web & asking Groq..._', 'groq');
        const lcMessages = allMessages.map((m) => ({ role: m.role, content: m.content }));
        for await (const event of streamSmartChat(lcMessages, controller.signal)) {
          if (event.event === 'status') {
            resolvedProvider = event.provider;
            setActiveProvider(event.provider);
            if (!accumulated) updateMsg(`_${event.message}_`, event.provider);
          } else if (event.event === 'chunk') {
            if (accumulated.startsWith('_') && accumulated.endsWith('_')) {
              accumulated = '';
            }
            accumulated += event.content || '';
            resolvedProvider = event.provider;
            setActiveProvider(event.provider);
            updateMsg(accumulated, event.provider);
          }
        }
      };

      if (langchainEnabled) {
        const lcMessages = allMessages.map((m) => ({ role: m.role, content: m.content }));
        for await (const event of streamSmartChat(lcMessages, controller.signal, true)) {
          if (event.event === 'status') {
            resolvedProvider = event.provider;
            setActiveProvider(event.provider);
            updateMsg(accumulated || `_${event.message}_`, event.provider);
          } else if (event.event === 'chunk') {
            if (accumulated.startsWith('_') && accumulated.endsWith('_')) {
              accumulated = '';
            }
            accumulated += event.content || '';
            resolvedProvider = event.provider;
            setActiveProvider(event.provider);
            updateMsg(accumulated, event.provider);
          }
        }
      } else if (ragEnabled) {
        resolvedProvider = 'rag';
        setActiveProvider('rag');
        const chatHistory = allMessages
          .slice(0, -1)
          .map((m) => ({ role: m.role, content: m.content }));

        for await (const chunk of streamRAGResponse(text, chatHistory, controller.signal)) {
          accumulated += chunk.content;
          if (chunk.sources.length > 0) setRagSources(chunk.sources);
          updateMsg(accumulated, 'rag');
        }

        if (ragLacksAnswer(accumulated)) {
          accumulated = '';
          resolvedProvider = 'ollama';
          setActiveProvider('ollama');
          updateMsg('_Checking with Local LLaMA..._', 'ollama');

          for await (const chunk of streamChat(allMessages, controller.signal)) {
            accumulated += chunk;
            updateMsg(accumulated, 'ollama');
          }
        }
      } else {
        for await (const chunk of streamChat(allMessages, controller.signal)) {
          accumulated += chunk;
          updateMsg(accumulated, 'ollama');
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // user stopped generation
      } else {
        const errorContent = `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: errorContent } : m
                  ),
                }
              : c
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [activeId, scrollToBottom, ragEnabled, langchainEnabled]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectChat}
        onNew={handleNewChat}
        onDelete={handleDeleteChat}
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <RAGPanel
        visible={ragPanelOpen}
        onClose={() => setRagPanelOpen(false)}
        ragEnabled={ragEnabled}
        onToggleRag={setRagEnabled}
        headerToggled={ragUserToggled}
      />

      <main className="chat-main">
        <header className="chat-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} title="Chat history">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5H17M3 10H17M3 15H17" />
            </svg>
          </button>
          <h1>LLaMA Chat</h1>
          <div className="header-actions">
            <div
              className={`langchain-toggle ${langchainEnabled ? 'active' : ''}`}
              onClick={() => setLangchainEnabled((v) => !v)}
              title={langchainEnabled
                ? 'LangChain ON — LLaMA first, then Web Search + Groq if needed'
                : 'LangChain OFF — Local LLaMA only'}
            >
              <span className="toggle-label">LangChain</span>
              <div className="toggle-track">
                <div className="toggle-thumb" />
              </div>
            </div>
            <div
              className={`rag-header-toggle ${ragEnabled ? 'active' : ''}`}
              title={ragEnabled
                ? 'RAG ON — answers grounded in your documents'
                : 'RAG OFF — click switch to enable'}
            >
              <span
                className="toggle-label rag-label-click"
                onClick={() => setRagPanelOpen(true)}
                title="Open Knowledge Base panel"
              >
                RAG
              </span>
              <div
                className="toggle-track"
                onClick={() => {
                  const next = !ragEnabled;
                  ragUserToggled.current = true;
                  setRagEnabled(next);
                  if (next) setRagPanelOpen(true);
                }}
              >
                <div className="toggle-thumb" />
              </div>
            </div>
          </div>
        </header>

        <div className="chat-messages" ref={chatContainerRef}>
          {!active || active.messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🦙</div>
              <h2>LLaMA 3.1 8B</h2>
              <p>Local AI assistant for coding &amp; translation</p>
              {langchainEnabled && (
                <p className="langchain-badge-info">
                  LangChain ON — LLaMA first, then Web Search + Groq for real-time data
                </p>
              )}
              {ragEnabled && (
                <p className="rag-badge-info">RAG mode — answers grounded in your documents</p>
              )}
              <div className="quick-prompts">
                <button onClick={() => handleSend('Write a React custom hook for debouncing input')}>
                  Write a debounce hook
                </button>
                <button onClick={() => handleSend('Explain async/await in TypeScript with examples')}>
                  Explain async/await
                </button>
                <button onClick={() => handleSend('Translate "How are you?" to Tamil, Hindi, and Japanese')}>
                  Translate a phrase
                </button>
                <button onClick={() => handleSend('Write a REST API with Express and TypeScript')}>
                  Express REST API
                </button>
              </div>
            </div>
          ) : (
            <>
              {active.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {ragSources.length > 0 && !streaming && (
                <div className="rag-sources">
                  <span className="rag-sources-label">Sources:</span>
                  {ragSources.map((s) => (
                    <span key={s} className="rag-source-tag">{s}</span>
                  ))}
                </div>
              )}
            </>
          )}
          {streaming && active && (
            <div className="typing-indicator">
              {activeProvider && (
                <span className={`provider-badge ${activeProvider}`}>
                  {activeProvider === 'groq'
                    ? '🔍 Groq + Web Search'
                    : activeProvider === 'rag'
                      ? '📄 RAG + LLaMA'
                      : '🦙 LLaMA'}
                </span>
              )}
              <span /><span /><span />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <ChatInput
          onSend={handleSend}
          disabled={!connected}
          onStop={handleStop}
          streaming={streaming}
        />
      </main>
    </div>
  );
}
