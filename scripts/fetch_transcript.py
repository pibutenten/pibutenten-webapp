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
            text = " ".join(
                s.text.replace("\n", " ").strip()
                for s in fetched.snippets
                if s.text and s.text.strip()
            ).strip()
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
            text = " ".join(
                s.text.replace("\n", " ").strip() for s in fetched.snippets
            ).strip()
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
