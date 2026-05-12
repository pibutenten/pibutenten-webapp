"""
Vercel Python Serverless Function — YouTube 자막 fetch.

배포 시 Vercel이 `/api/transcript` 로 자동 호출 가능하게 처리.
Next.js Node API route (`src/app/api/*`)와는 별개로, Vercel의 Python runtime이
이 디렉토리 (`/api/*.py`)를 별도 함수로 빌드.

호출:
  GET  /api/transcript?videoId=abc123
  POST /api/transcript {"videoId": "abc123"}

응답 (200):
  {"transcript": "...", "source": "ko-manual"|"ko-auto"|"en"|"default", "lang": "ko"}
응답 (4xx/5xx):
  {"error": "..."}
"""

from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import (
        TranscriptsDisabled,
        NoTranscriptFound,
        CouldNotRetrieveTranscript,
    )
except Exception as _e:
    YouTubeTranscriptApi = None
    _IMPORT_ERROR = str(_e)


def _find_kind(api, video_id, language):
    try:
        for t in api.list(video_id):
            if t.language_code == language:
                return "auto" if t.is_generated else "manual"
    except Exception:
        pass
    return "manual"


def _fmt_ts(sec: float) -> str:
    s = int(sec or 0)
    if s >= 3600:
        return f"[{s // 3600}:{(s % 3600) // 60:02d}:{s % 60:02d}]"
    return f"[{s // 60:02d}:{s % 60:02d}]"


def _with_timestamps(snippets) -> str:
    """[MM:SS] 텍스트 형식. LLM이 카드별 timestamp 추출에 사용."""
    parts = []
    for s in snippets:
        t = (s.text or "").replace("\n", " ").strip()
        if not t:
            continue
        parts.append(f"{_fmt_ts(s.start)} {t}")
    return "\n".join(parts).strip()


def _do_fetch(video_id: str) -> dict:
    if YouTubeTranscriptApi is None:
        return {"error": f"import failed: {_IMPORT_ERROR}"}
    if not video_id or not isinstance(video_id, str) or len(video_id) != 11:
        return {"error": "invalid videoId"}
    api = YouTubeTranscriptApi()
    for lang in ["ko", "en"]:
        try:
            fetched = api.fetch(video_id, languages=[lang])
            text = _with_timestamps(fetched.snippets)
            if not text or len(text) < 20:
                continue
            kind = _find_kind(api, video_id, lang)
            if lang == "ko":
                source = "ko-auto" if kind == "auto" else "ko-manual"
            elif lang == "en":
                source = "en"
            else:
                source = "default"
            return {"transcript": text, "source": source, "lang": lang}
        except (NoTranscriptFound, TranscriptsDisabled, CouldNotRetrieveTranscript):
            continue
        except Exception:
            continue
    # 마지막 — 어떤 언어든
    try:
        transcripts = list(api.list(video_id))
        if transcripts:
            first = transcripts[0]
            fetched = first.fetch()
            text = _with_timestamps(fetched.snippets)
            if text and len(text) >= 20:
                return {
                    "transcript": text,
                    "source": "default",
                    "lang": first.language_code,
                }
    except Exception as e:
        return {"error": f"fallback failed: {e}"}
    return {"error": "no transcript found in any language"}


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _shared_secret_ok(self) -> bool:
        """간단한 보안: env에 PYTHON_TRANSCRIPT_SECRET 설정되어 있으면
        헤더 X-Transcript-Secret 일치해야 통과. 미설정이면 통과 (dev/내부 호출).
        """
        import os
        expected = (os.environ.get("PYTHON_TRANSCRIPT_SECRET") or "").strip()
        if not expected:
            return True
        got = self.headers.get("X-Transcript-Secret") or ""
        return got == expected

    def do_GET(self):
        if not self._shared_secret_ok():
            self._send_json(401, {"error": "unauthorized"})
            return
        q = parse_qs(urlparse(self.path).query)
        video_id = (q.get("videoId") or [""])[0]
        result = _do_fetch(video_id)
        status = 200 if "transcript" in result else (
            400 if "invalid" in (result.get("error") or "") else 422
        )
        self._send_json(status, result)

    def do_POST(self):
        if not self._shared_secret_ok():
            self._send_json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            body = json.loads(raw) if raw else {}
        except Exception:
            self._send_json(400, {"error": "invalid JSON body"})
            return
        video_id = body.get("videoId") or ""
        result = _do_fetch(video_id)
        status = 200 if "transcript" in result else (
            400 if "invalid" in (result.get("error") or "") else 422
        )
        self._send_json(status, result)
