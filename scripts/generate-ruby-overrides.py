#!/usr/bin/env python3
"""Generate explicit, word-boundary-aware ruby layouts for active cards.

The output is display metadata. It never changes authored card text or readings.
Sudachi C supplies word-boundary candidates offline; authored readings remain
authoritative. Ambiguous alignments fail instead of silently guessing.

Run with:
  uv run --no-project \
    --with 'sudachipy==0.6.10' \
    --with 'sudachidict-core==20250825' \
    python scripts/generate-ruby-overrides.py
"""

from __future__ import annotations

import argparse
import functools
import importlib.metadata
import json
import re
import subprocess
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from sudachipy import dictionary, tokenizer


HAN = re.compile(r"[\u3400-\u9fff々〇]")
GROUPS = re.compile(r"[\u3400-\u9fff々〇]+|[^\u3400-\u9fff々〇]+")
PUNCTUATION = set("、。,.!?！？「」『』()（）：:；;…")

# A word-internal kana anchor is ambiguous only in this active vocabulary.
INTERNAL_LAYOUTS = {
    ("飲み水", "のみみず"): [
        {"text": "飲", "reading": "の"},
        {"text": "み"},
        {"text": "水", "reading": "みず"},
    ],
}

# Counters/lexicalized quantities whose readings contain sound changes or whose
# Sudachi boundary is smaller than the learner-facing word.
FORCED_WORDS = {"一晩", "一曲", "千字", "二十字"}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = "".join(
        chr(ord(char) - 0x60) if "ァ" <= char <= "ヶ" else char
        for char in text
    )
    return re.sub(r"\s", "", text).replace(",", "、").replace(".", "。")


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


@dataclass(frozen=True)
class Unit:
    surface: str
    expected: str
    pos: tuple[str, ...]

    @property
    def has_han(self) -> bool:
        return bool(HAN.search(self.surface))


def combine(units: list[Unit]) -> Unit:
    return Unit(
        "".join(unit.surface for unit in units),
        "".join(unit.expected for unit in units),
        units[0].pos,
    )


def is_counter(unit: Unit) -> bool:
    return (
        len(unit.pos) > 2
        and unit.pos[2] == "助数詞可能"
        or unit.pos[0] == "接尾辞"
        and len(unit.pos) > 2
        and unit.pos[2] in {"助数詞", "一般"}
    )


def merge_units(morphemes) -> list[Unit]:
    raw = [
        Unit(m.surface(), normalize(m.reading_form() or m.surface()), m.part_of_speech())
        for m in morphemes
    ]
    result: list[Unit] = []
    index = 0
    while index < len(raw):
        item = raw[index]
        forced = None
        for end in range(min(len(raw), index + 4), index + 1, -1):
            if "".join(unit.surface for unit in raw[index:end]) in FORCED_WORDS:
                forced = end
                break
        if forced:
            result.append(combine(raw[index:forced]))
            index = forced
            continue
        # 第 + numeral is one ordinal marker; the following noun stays separate.
        if item.surface == "第" and index + 1 < len(raw) and raw[index + 1].pos[:2] == ("名詞", "数詞"):
            members = [item]
            index += 1
            while index < len(raw) and raw[index].pos[:2] == ("名詞", "数詞"):
                members.append(raw[index])
                index += 1
            result.append(combine(members))
            continue
        # Numerals and their counter/date/time suffix form one semantic unit.
        if item.pos[:2] == ("名詞", "数詞"):
            members = [item]
            index += 1
            while index < len(raw) and raw[index].pos[:2] == ("名詞", "数詞"):
                members.append(raw[index])
                index += 1
            if index < len(raw) and is_counter(raw[index]):
                members.append(raw[index])
                index += 1
            result.append(combine(members))
            continue
        # Sudachi sometimes exposes productive prefixes/suffixes separately.
        if item.pos[0] == "接頭辞" and index + 1 < len(raw):
            result.append(combine([item, raw[index + 1]]))
            index += 2
            continue
        if item.pos[0] == "接尾辞" and result:
            result[-1] = combine([result[-1], item])
            index += 1
            continue
        result.append(item)
        index += 1
    return result


def align_units(text: str, reading: str, units: list[Unit]):
    target = normalize(reading)

    @functools.lru_cache(maxsize=None)
    def solve(index: int, position: int):
        if index == len(units):
            return ((0, 0, 0), ((),)) if position == len(target) else None
        unit = units[index]
        candidates = []
        if not unit.has_han:
            surface = normalize(unit.surface)
            advances = []
            if target.startswith(surface, position):
                advances.append((position + len(surface), 0))
            if surface and all(char in PUNCTUATION for char in surface):
                advances.append((position, 1))
            for end, punctuation_penalty in advances:
                tail = solve(index + 1, end)
                if tail:
                    score, solutions = tail
                    candidates.append(
                        (
                            (score[0], score[1] + punctuation_penalty, score[2]),
                            tuple(((unit.surface, None),) + solution for solution in solutions),
                        )
                    )
        else:
            minimum_remaining = sum(1 for later in units[index + 1 :] if later.has_han)
            latest = len(target) - minimum_remaining
            for end in range(position + 1, latest + 1):
                assigned = target[position:end]
                if any(char in PUNCTUATION for char in assigned):
                    continue
                tail = solve(index + 1, end)
                if not tail:
                    continue
                score, solutions = tail
                exact = int(assigned == unit.expected)
                local = (
                    distance(assigned, unit.expected),
                    abs(len(assigned) - len(unit.expected)),
                    -exact,
                )
                candidates.append(
                    (
                        tuple(local[i] + score[i] for i in range(3)),
                        tuple(((unit.surface, assigned),) + solution for solution in solutions),
                    )
                )
        if not candidates:
            return None
        best_score = min(score for score, _ in candidates)
        best = []
        for score, solutions in candidates:
            if score == best_score:
                for solution in solutions:
                    if solution not in best:
                        best.append(solution)
                    if len(best) > 1:
                        break
            if len(best) > 1:
                break
        return best_score, tuple(best)

    result = solve(0, 0)
    if not result:
        raise ValueError(f"Sudachi alignment failed: {text} / {reading}")
    _, solutions = result
    if len(solutions) != 1:
        raise ValueError(f"Sudachi alignment is ambiguous: {text} / {reading} / {solutions}")
    return solutions[0]


def split_word(surface: str, reading: str):
    manual = INTERNAL_LAYOUTS.get((surface, reading))
    if manual:
        return manual
    groups = GROUPS.findall(surface)
    if len(groups) == 1:
        return [{"text": surface, "reading": reading}]

    def attempt(capture: str):
        pattern = "".join(
            capture if HAN.search(group) else re.escape(normalize(group))
            for group in groups
        )
        return re.fullmatch(pattern, reading)

    shortest = attempt("(.+?)")
    longest = attempt("(.+)")
    if not shortest or not longest or shortest.groups() != longest.groups():
        raise ValueError(f"Word-internal alignment is ambiguous: {surface} / {reading}")
    captured = iter(shortest.groups())
    return [
        {"text": group, "reading": next(captured)} if HAN.search(group) else {"text": group}
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


def collect_parts(cards):
    unique = {}
    # Share the renderer's source list, including dictionary forms, with the audit.
    source = subprocess.run(
        ["node", "--input-type=module", "-e",
         "import {rubySourceParts} from './src/lib/ruby-source-parts.mjs';"
         "process.stdin.setEncoding('utf8');let input='';for await(const chunk of process.stdin)input+=chunk;"
         "console.log(JSON.stringify(rubySourceParts(JSON.parse(input))));"],
        input=json.dumps(cards, ensure_ascii=False), text=True,
        capture_output=True, check=True,
    )
    for part in json.loads(source.stdout):
        text, reading = part.get("text", ""), part.get("reading")
        if reading and HAN.search(text):
            unique[(text, reading)] = None
    return sorted(unique)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cards", default="src/data/cards.json")
    parser.add_argument("--output", default="src/data/ruby-layouts.json")
    args = parser.parse_args()
    cards = json.loads(Path(args.cards).read_text())
    tagger = dictionary.Dictionary().create()
    rows = []
    for text, reading in collect_parts(cards):
        units = merge_units(tagger.tokenize(text, tokenizer.Tokenizer.SplitMode.C))
        aligned = align_units(text, reading, units)
        parts = []
        for surface, assigned in aligned:
            parts.extend(split_word(surface, assigned) if assigned else [{"text": surface}])
        rows.append({"text": text, "reading": reading, "parts": compact(parts)})
    result = {
        "version": 1,
        "policy": "word-boundary-ruby",
        "generator": {
            "sudachipy": importlib.metadata.version("SudachiPy"),
            "sudachidictCore": importlib.metadata.version("SudachiDict-core"),
        },
        "cards": len(cards),
        "layouts": rows,
    }
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"cards": len(cards), "layouts": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
