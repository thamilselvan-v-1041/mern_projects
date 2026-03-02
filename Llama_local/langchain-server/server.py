import json
import logging
import os
import re
from typing import Annotated, Dict, List, Literal, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("langchain-server")

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="LangChain + LangGraph Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Provider", "X-Model", "X-Fallback"],
)

OLLAMA_BASE = os.getenv("OLLAMA_BASE", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1-finetuned")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GROQ_BASE = "https://api.groq.com/openai/v1"

REFUSAL_PATTERNS = [
    r"i (?:do not|don'?t) have (?:any )?(?:access to|information|data|real-?time)",
    r"i (?:can'?t|cannot|couldn'?t|am unable to) (?:provide|access|browse|search|retrieve|verify|find|confirm)",
    r"(?:as an ai|as a language model|as a text-based)",
    r"i (?:do not|don'?t) (?:know|have) (?:the |any )?(?:current|latest|recent|specific|exact|up-to-date)",
    r"my (?:knowledge|training|data) (?:cutoff|only goes|was cut|ends|is limited)",
    r"(?:as of|based on) my (?:knowledge|last|training|available)",
    r"i (?:do not|don'?t) have (?:the ability|access)",
    r"(?:i'?m not sure|i'?m unable|unfortunately)",
    r"beyond my (?:knowledge|training|capabilities)",
    r"not (?:available|accessible) to me",
    r"(?:please (?:check|refer|consult|visit)|try (?:searching|googling|checking))",
    r"i (?:do not|don'?t) have (?:any )?(?:information|details|news) (?:regarding|about|on)",
    r"i (?:would )?recommend (?:checking|visiting|searching)",
    r"couldn'?t find (?:any|specific|recent|the latest)",
    r"(?:without|lack) (?:more )?(?:context|information|details)",
    r"(?:if you could|could you) (?:clarify|provide|specify|share)",
    r"(?:i am not|i'?m not) (?:aware|sure) (?:of|about|whether)",
    r"(?:no|not any) (?:recent|latest|current|specific) (?:information|data|news|updates)",
    r"difficult for me to (?:provide|answer|confirm|verify)",
    r"(?:i (?:do not|don'?t) have|there is no) (?:direct|real-?time) (?:connection|access)",
    r"(?:was |were )?not (?:directly |specifically )?(?:mentioned|provided|included|listed|available|covered)",
    r"(?:we can |i can (?:only )?)?infer|based on (?:the )?(?:provided|available|given) data",
    r"(?:does not|doesn'?t) (?:include|contain|mention|cover|have) (?:specific|direct|exact)",
    r"(?:no |not (?:any )?)(?:direct|specific|exact) (?:data|information|mention|record|entry)",
    r"(?:that )?may have (?:impacted|affected|influenced|caused)",
    r"according to (?:the )?data I have",
    r"(?:based on|from) (?:the |my )?(?:gold|price|market) (?:data|information)",
    r"(?:i (?:do not|don'?t|cannot|can'?t) )?(?:provide|give|offer) (?:a )?(?:comprehensive|complete|full|detailed) (?:overview|summary|list|answer)",
    r"(?:my |the )?(?:data|information) (?:is |are )?(?:limited|only covers|only includes)",
]

REFUSAL_RE = re.compile("|".join(REFUSAL_PATTERNS), re.IGNORECASE)


def llama_lacks_knowledge(text: str) -> bool:
    if len(text.strip()) < 15:
        return True
    return bool(REFUSAL_RE.search(text))


_SEARCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )
}


def web_search(query: str, max_results: int = 5) -> str:
    """Search the web via DuckDuckGo HTML and return formatted results."""
    try:
        resp = httpx.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers=_SEARCH_HEADERS,
            timeout=15,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            return ""
        soup = BeautifulSoup(resp.text, "html.parser")
        items = soup.select(".result__body")[:max_results]
        if not items:
            return ""
        formatted = []
        for item in items:
            title_el = item.select_one(".result__title")
            snippet_el = item.select_one(".result__snippet")
            url_el = item.select_one(".result__url")
            title = title_el.get_text(strip=True) if title_el else ""
            snippet = snippet_el.get_text(strip=True) if snippet_el else ""
            url = url_el.get_text(strip=True) if url_el else ""
            formatted.append(f"**{title}**\n{snippet}\nSource: {url}")
        return "\n\n---\n\n".join(formatted)
    except Exception:
        return ""


def build_ollama_llm(model: Optional[str] = None):
    return ChatOllama(
        base_url=OLLAMA_BASE,
        model=model or OLLAMA_MODEL,
        temperature=0.7,
    )


def build_groq_llm(api_key: str, model: Optional[str] = None):
    return ChatOpenAI(
        api_key=api_key,
        base_url=GROQ_BASE,
        model=model or GROQ_MODEL,
        temperature=0.7,
        streaming=True,
    )


def build_openai_llm(api_key: str, model: Optional[str] = None):
    return ChatOpenAI(
        api_key=api_key,
        model=model or OPENAI_MODEL,
        temperature=0.7,
        streaming=True,
    )


def build_graph(llm):
    async def chat_node(state: MessagesState) -> Dict:
        response = await llm.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(MessagesState)
    graph.add_node("chat", chat_node)
    graph.add_edge(START, "chat")
    graph.add_edge("chat", END)
    return graph.compile()


def convert_messages(messages: List[dict]) -> list:
    lc_messages = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        elif role == "system":
            lc_messages.append(SystemMessage(content=content))
    return lc_messages


def _get_groq_key(header_key: Optional[str]) -> Optional[str]:
    return header_key or os.getenv("GROQ_API_KEY")


def _get_user_query(messages: List[dict]) -> str:
    """Extract the last user message as the search query."""
    for m in reversed(messages):
        if m.get("role") == "user":
            return m.get("content", "")
    return ""


class ChatRequest(BaseModel):
    messages: List[dict]
    provider: Literal["ollama", "openai", "groq"] = "ollama"
    model: Optional[str] = None


class SmartChatRequest(BaseModel):
    messages: List[dict]
    direct_groq: bool = False


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "providers": ["ollama", "groq", "openai"],
        "ollama_model": OLLAMA_MODEL,
        "groq_model": GROQ_MODEL,
        "groq_configured": bool(os.getenv("GROQ_API_KEY")),
    }


@app.post("/chat")
async def chat(
    req: ChatRequest,
    x_openai_key: Annotated[Optional[str], Header()] = None,
    x_groq_key: Annotated[Optional[str], Header()] = None,
):
    if req.provider == "groq":
        groq_key = _get_groq_key(x_groq_key)
        if not groq_key:
            return JSONResponse(status_code=400, content={"detail": "Groq API key required."})
        llm = build_groq_llm(groq_key, req.model)
    elif req.provider == "openai":
        openai_key = x_openai_key or os.getenv("OPENAI_API_KEY")
        if not openai_key:
            return JSONResponse(status_code=400, content={"detail": "OpenAI API key required."})
        llm = build_openai_llm(openai_key, req.model)
    else:
        llm = build_ollama_llm(req.model)

    lc_messages = convert_messages(req.messages)

    async def event_stream():
        try:
            async for chunk in llm.astream(lc_messages):
                if hasattr(chunk, "content") and chunk.content:
                    yield chunk.content
        except Exception as e:
            yield f"\n\n**Error:** {e}"

    return StreamingResponse(event_stream(), media_type="text/plain")


@app.post("/chat/smart")
async def smart_chat(
    req: SmartChatRequest,
    x_groq_key: Annotated[Optional[str], Header()] = None,
):
    """
    Smart LangChain flow:
    1. Ask local LLaMA first
    2. If LLaMA can't answer → search the web + ask Groq with search context
    """
    lc_messages = convert_messages(req.messages)
    user_query = _get_user_query(req.messages)
    ollama_llm = build_ollama_llm()

    async def event_stream():
        if not req.direct_groq:
            yield f'{{"event":"status","provider":"ollama","message":"Asking Local LLaMA..."}}\n'

            llama_response = ""
            try:
                response = await ollama_llm.ainvoke(lc_messages)
                llama_response = response.content or ""
            except Exception:
                llama_response = ""

            lacks = llama_lacks_knowledge(llama_response) if llama_response else True
            logger.info("LLaMA response length=%d, lacks_knowledge=%s", len(llama_response), lacks)
            if llama_response and lacks:
                logger.info("LLaMA refusal detected, falling back to Groq + web search")
            elif llama_response:
                logger.info("LLaMA answered confidently, returning ollama response")

            if llama_response and not lacks:
                yield f'{{"event":"status","provider":"ollama","message":"Answered by Local LLaMA"}}\n'
                yield f'{{"event":"chunk","provider":"ollama","content":{json.dumps(llama_response)}}}\n'
                yield '{"event":"done","provider":"ollama"}\n'
                return
        else:
            logger.info("direct_groq=True, skipping LLaMA, going straight to Groq + web search")

        groq_key = _get_groq_key(x_groq_key)
        if not groq_key:
            if llama_response:
                yield f'{{"event":"status","provider":"ollama","message":"Local LLaMA (may be incomplete)"}}\n'
                yield f'{{"event":"chunk","provider":"ollama","content":{json.dumps(llama_response)}}}\n'
            else:
                yield f'{{"event":"chunk","provider":"ollama","content":"No Groq API key configured for fallback."}}\n'
            yield '{"event":"done","provider":"ollama"}\n'
            return

        yield f'{{"event":"status","provider":"groq","message":"Searching the web & asking Groq..."}}\n'

        search_results = web_search(user_query)

        search_context = ""
        if search_results:
            search_context = (
                f"\n\nHere are recent web search results for the query \"{user_query}\":\n\n"
                f"{search_results}\n\n"
                "Use the above search results to provide an accurate, detailed answer. "
                "Cite sources where possible."
            )

        system_msg = SystemMessage(
            content=(
                "You are a helpful assistant with access to real-time web search results. "
                "Answer the user's question using the provided search results. "
                "Be specific and cite sources when available."
                f"{search_context}"
            )
        )

        groq_messages = [system_msg] + lc_messages
        groq_llm = build_groq_llm(groq_key)

        try:
            async for chunk in groq_llm.astream(groq_messages):
                if hasattr(chunk, "content") and chunk.content:
                    yield f'{{"event":"chunk","provider":"groq","content":{json.dumps(chunk.content)}}}\n'
        except Exception as e:
            yield f'{{"event":"chunk","provider":"groq","content":{json.dumps(f"Error: {e}")}}}\n'

        yield '{"event":"done","provider":"groq"}\n'

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
