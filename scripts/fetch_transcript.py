#!/usr/bin/env python3
"""
youtube-transcript-api 로 자막 fetch.
Node child_process에서 호출. argv[1]=video_id.

출력 (stdout, JSON 1줄):
  성공: {"transcript": "...", "source": "ko-manual"|"ko-auto"|"en"|"default", "lang": "ko"}
  실패: {"error": "..."}
"""
import sys
import json
import io

# Windows 콘솔 UTF-8 강제
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import (
        TranscriptsDisabled,
        NoTranscriptFound,
        CouldNotRetrieveTranscript,
    )
except Exception as e:
    print(json.dumps({"error": f"import failed: {e}"}))
    sys.exit(0)


def find_kind(api, video_id, language):
    """해당 언어 트랙의 generated 여부 판정."""
    try:
        for t in api.list(video_id):
            if t.language_code == language:
                return "auto" if t.is_generated else "manual"
    except Exception:
        pass
    return "manual"


def format_ts(sec: float) -> str:
    """초 → [MM:SS] 또는 [H:MM:SS] (1시간 넘으면)."""
    s = int(sec or 0)
    if s >= 3600:
        return f"[{s // 3600}:{(s % 3600) // 60:02d}:{s % 60:02d}]"
    return f"[{s // 60:02d}:{s % 60:02d}]"


def with_timestamps(snippets) -> str:
    """[MM:SS] 텍스트 형식. LLM이 카드별 timestamp 추출에 사용."""
    parts = []
    for s in snippets:
        t = (s.text or "").replace("\n", " ").strip()
        if not t:
            continue
        parts.append(f"{format_ts(s.start)} {t}")
    return "\n".join(parts).strip()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "video_id required"}))
        return
    vid = sys.argv[1]
    api = YouTubeTranscriptApi()
    # 우선순위: 한국어 → 영어 → 첫 트랙
    for lang in ["ko", "en"]:
        try:
            fetched = api.fetch(vid, languages=[lang])
            text = with_timestamps(fetched.snippets)
            if not text or len(text) < 20:
                continue
            kind = find_kind(api, vid, lang)
            if lang == "ko":
                source = "ko-auto" if kind == "auto" else "ko-manual"
            elif lang == "en":
                source = "en"
            else:
                source = "default"
            print(json.dumps(
                {"transcript": text, "source": source, "lang": lang},
                ensure_ascii=False,
            ))
            return
        except (NoTranscriptFound, TranscriptsDisabled, CouldNotRetrieveTranscript):
            continue
        except Exception:
            continue
    # 마지막 fallback — 어떤 언어든
    try:
        transcripts = list(api.list(vid))
        if transcripts:
            first = transcripts[0]
            fetched = first.fetch()
            text = with_timestamps(fetched.snippets)
            if text and len(text) >= 20:
                print(json.dumps(
                    {"transcript": text, "source": "default", "lang": first.language_code},
                    ensure_ascii=False,
                ))
                return
    except Exception as e:
        print(json.dumps({"error": f"fallback failed: {e}"}))
        return
    print(json.dumps({"error": "no transcript found in any language"}))


if __name__ == "__main__":
    main()
