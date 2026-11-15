"""Dependency-free writing signals intended to execute inside Pyodide."""

from __future__ import annotations

import json
import re
from collections import Counter

POSITIVE = {"clear", "good", "great", "helpful", "effective", "excellent", "strong", "success"}
NEGATIVE = {"bad", "unclear", "weak", "poor", "difficult", "confusing", "failure", "wrong"}


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]


def _words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text.lower())


def _syllables(word: str) -> int:
    word = re.sub(r"[^a-z]", "", word.lower())
    if not word:
        return 1
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def readability(text: str) -> dict:
    words = _words(text)
    sentences = _sentences(text)
    if not words or not sentences:
        return {"flesch_reading_ease": None, "label": "Not enough text"}
    syllable_count = sum(_syllables(word) for word in words)
    score = 206.835 - 1.015 * (len(words) / len(sentences)) - 84.6 * (syllable_count / len(words))
    label = "Fairly easy" if score >= 70 else "Moderate" if score >= 50 else "Complex"
    return {"flesch_reading_ease": round(score, 1), "label": label}


def summarize(text: str, max_sentences: int = 3) -> str:
    sentences = _sentences(text)
    if len(sentences) <= max_sentences:
        return " ".join(sentences)
    frequencies = Counter(_words(text))
    for common in ("the", "and", "for", "with", "that", "this", "from", "are", "was", "were"):
        frequencies.pop(common, None)
    scored = []
    for index, sentence in enumerate(sentences):
        terms = _words(sentence)
        score = sum(frequencies.get(term, 0) for term in terms) / max(1, len(terms))
        scored.append((score, index, sentence))
    chosen = sorted(scored, reverse=True)[:max_sentences]
    return " ".join(item[2] for item in sorted(chosen, key=lambda item: item[1]))


def tone_signals(text: str) -> dict:
    terms = set(_words(text))
    positive = sorted(terms & POSITIVE)
    critical = sorted(terms & NEGATIVE)
    label = "More positive wording" if len(positive) > len(critical) else (
        "More critical wording" if len(critical) > len(positive) else "Neutral or mixed wording"
    )
    return {"label": label, "positive_terms": positive, "critical_terms": critical}


def writing_hints(text: str) -> list[str]:
    hints = []
    if re.search(r"\b(\w+)\s+\1\b", text, flags=re.IGNORECASE):
        hints.append("A repeated word appears next to itself; review that sentence.")
    if "  " in text:
        hints.append("There are consecutive spaces; check the spacing.")
    if re.search(r"(^|[.!?]\s+)i\b", text):
        hints.append("Capitalize the first-person pronoun “I”.")
    if text and text[-1].isalnum():
        hints.append("Consider whether the final sentence needs punctuation.")
    return hints or ["No basic pattern-based writing hints were detected."]


def analyze_text_json(text: str, task_name: str = "summary") -> str:
    task = task_name.lower()
    if task == "summary":
        result = {"summary": summarize(text)}
    elif task == "readability":
        result = readability(text)
    elif task == "tone":
        result = tone_signals(text)
    elif task == "hints":
        result = {"hints": writing_hints(text)}
    else:
        result = {
            "summary": summarize(text),
            "readability": readability(text),
            "tone": tone_signals(text),
            "hints": writing_hints(text),
        }
    return json.dumps(result, ensure_ascii=False)
