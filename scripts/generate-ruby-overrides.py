#!/usr/bin/env python3
"""Generate reviewed-at-build-time ruby segmentation candidates.

Run with:
  uv run --no-project --with 'fugashi[unidic-lite]' \
    python scripts/generate-ruby-overrides.py

The browser never runs a tokenizer. This script only supplies explicit display
segments for authored readings that the conservative runtime splitter cannot
align uniquely.
"""

from __future__ import annotations

import argparse
import functools
import json
import re
import unicodedata
from pathlib import Path

from fugashi import Tagger


HAN = re.compile(r"[\u3400-\u9fff々〇]")
GROUPS = re.compile(r"[\u3400-\u9fff々〇]+|[^\u3400-\u9fff々〇]+")
PUNCTUATION = set("、。!?！？「」『』()（）：:；;")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = "".join(
        chr(ord(char) - 0x60) if "ァ" <= char <= "ヶ" else char
        for char in text
    )
    return re.sub(r"\s", "", text).replace(",", "、").replace(".", "。")


def unpunctuated(text: str) -> str:
    return "".join(char for char in normalize(text) if char not in PUNCTUATION)


def runtime_can_split(text: str, reading: str) -> bool:
    groups = GROUPS.findall(text)

    def attempt(key) -> bool:
        if any(
            0 < index < len(groups) - 1
            and not HAN.search(group)
            and not key(group)
            and HAN.search(groups[index - 1])
            and HAN.search(groups[index + 1])
            for index, group in enumerate(groups)
        ):
            return False
        pattern = "".join(
            "(.+?)" if HAN.search(group) else re.escape(key(group))
            for group in groups
        )
        greedy = "".join(
            "(.+)" if HAN.search(group) else re.escape(key(group))
            for group in groups
        )
        shortest = re.fullmatch(pattern, key(reading))
        longest = re.fullmatch(greedy, key(reading))
        return bool(shortest and longest and shortest.groups() == longest.groups())

    return attempt(normalize) or attempt(unpunctuated)


def distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for row, a in enumerate(left, 1):
        current = [row]
        for column, b in enumerate(right, 1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[column] + 1,
                    previous[column - 1] + (a != b),
                )
            )
        previous = current
    return previous[-1]


def token_reading(token) -> str:
    kana = getattr(token.feature, "kana", None)
    return normalize(kana or token.surface)


def align_tokens(text: str, reading: str, tagger: Tagger):
    tokens = list(tagger(text))
    normalized_reading = normalize(reading)

    @functools.lru_cache(maxsize=None)
    def solve(index: int, position: int):
        if index == len(tokens):
            return (0, 0, []) if position == len(normalized_reading) else None
        token = tokens[index]
        surface = token.surface
        surface_key = normalize(surface)
        contains_kanji = bool(HAN.search(surface))
        candidates = []
        if not contains_kanji:
            if normalized_reading.startswith(surface_key, position):
                tail = solve(index + 1, position + len(surface_key))
                if tail:
                    candidates.append((tail[0], tail[1], [(surface, None, None)] + tail[2]))
            if surface_key and all(char in PUNCTUATION for char in surface_key):
                tail = solve(index + 1, position)
                if tail:
                    candidates.append((tail[0], tail[1] + 1, [(surface, None, None)] + tail[2]))
        else:
            expected = token_reading(token)
            remaining_kanji = sum(
                1 for later in tokens[index + 1 :] if HAN.search(later.surface)
            )
            latest = len(normalized_reading) - remaining_kanji
            for end in range(position + 1, latest + 1):
                assigned = normalized_reading[position:end]
                tail = solve(index + 1, end)
                if tail:
                    edit_cost = distance(assigned, expected)
                    candidates.append(
                        (
                            edit_cost + tail[0],
                            abs(len(assigned) - len(expected)) + tail[1],
                            [(surface, assigned, expected)] + tail[2],
                        )
                    )
        return min(candidates, key=lambda item: (item[0], item[1])) if candidates else None

    result = solve(0, 0)
    if not result:
        raise ValueError(f"Tokenizer alignment failed: {text} / {reading}")
    return result[2]


def split_token(surface: str, reading: str):
    groups = GROUPS.findall(surface)
    if sum(bool(HAN.search(group)) for group in groups) != 1:
        return [{"text": surface, "reading": reading}]
    pattern = "".join(
        "(.+?)" if HAN.search(group) else re.escape(normalize(group))
        for group in groups
    )
    match = re.fullmatch(pattern, reading)
    if not match:
        return [{"text": surface, "reading": reading}]
    captured = iter(match.groups())
    return [
        {"text": group, "reading": next(captured)}
        if HAN.search(group)
        else {"text": group}
        for group in groups
    ]


def compact(parts):
    result = []
    for part in parts:
        if result and "reading" not in result[-1] and "reading" not in part:
            result[-1]["text"] += part["text"]
        else:
            result.append(part)
    return result


def merge_contiguous_kanji_tokens(aligned):
    """Keep compounds/counters together so sound changes stay on one ruby."""
    result = []
    index = 0
    while index < len(aligned):
        surface, reading, expected = aligned[index]
        pure_kanji = bool(surface) and all(HAN.fullmatch(char) for char in surface)
        if not pure_kanji:
            result.append((surface, reading))
            index += 1
            continue
        run = []
        while index < len(aligned):
            item = aligned[index]
            if not item[0] or not all(HAN.fullmatch(char) for char in item[0]):
                break
            run.append(item)
            index += 1
        # Keep separate tokens when each authored reading has the same span as
        # UniDic (including same-length sound changes such as 百=ひゃっ). If a
        # reading boundary drifts into the next token (光=ひか / 回線=りかいせん),
        # merge only the shortest block whose cumulative lengths realign.
        block = []
        authored_length = expected_length = 0
        for item in run:
            block.append(item)
            authored_length += len(item[1])
            expected_length += len(item[2])
            if authored_length == expected_length:
                if len(block) == 1:
                    result.append((block[0][0], block[0][1]))
                else:
                    result.append(("".join(x[0] for x in block), "".join(x[1] for x in block)))
                block = []
                authored_length = expected_length = 0
        if block:
            result.append(("".join(x[0] for x in block), "".join(x[1] for x in block)))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cards", default="src/data/cards.json")
    parser.add_argument("--output", default="src/data/ruby-overrides.json")
    args = parser.parse_args()
    cards = json.loads(Path(args.cards).read_text())
    candidates = {}
    for card in cards:
        for field in ("before", "after"):
            for part in card.get(field, []):
                text = part.get("text", "")
                reading = part.get("reading")
                if not reading or len([g for g in GROUPS.findall(text) if HAN.search(g)]) < 2:
                    continue
                if runtime_can_split(text, reading):
                    continue
                candidates[(text, reading)] = None

    tagger = Tagger()
    rows = []
    for text, reading in sorted(candidates):
        aligned = merge_contiguous_kanji_tokens(align_tokens(text, reading, tagger))
        parts = []
        for surface, assigned in aligned:
            parts.extend(split_token(surface, assigned) if assigned else [{"text": surface}])
        rows.append({"text": text, "reading": reading, "parts": compact(parts)})
    Path(args.output).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"cards": len(cards), "overrides": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
