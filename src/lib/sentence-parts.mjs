import rubyOverrides from '../data/ruby-overrides.json' with {type:'json'};

const kanji = /[\u3400-\u9fff々〇]/u;

const readingKey = text => text.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/\s/g, '').replace(/,/g, '、').replace(/\./g, '。');
const unpunctuatedReading = text => readingKey(text).replace(/[、。!?「」『』()：:；;]/g, '');
const sentenceGroups = text => text.match(/[\u3400-\u9fff々〇]+|[^\u3400-\u9fff々〇]+/gu) ?? [];
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const overrideKey = part => `${part.text}\u0000${part.reading}`;
const overrideMap = new Map(rubyOverrides.map(row => [overrideKey(row), row.parts]));

function inferredSentenceParts(part) {
  const groups = sentenceGroups(part.text);
  const match = key => {
    if (groups.some((group, index) => index > 0 && index < groups.length - 1
      && !kanji.test(group) && !key(group) && kanji.test(groups[index - 1]) && kanji.test(groups[index + 1]))) return null;
    const pattern = capture => groups.map(group => kanji.test(group) ? capture
      : escapePattern(key(group))).join('');
    const reading = key(part.reading);
    const shortest = reading.match(new RegExp(`^${pattern('(.+?)')}$`, 'u'));
    const longest = reading.match(new RegExp(`^${pattern('(.+)')}$`, 'u'));
    // Repeated kana may occur inside a word's reading too: 昨日の -> きのうの.
    // Accept a split only when its shortest and longest alignments agree.
    if (!shortest || !longest || shortest.some((value, index) => value !== longest[index])) return null;
    return shortest;
  };
  let matched = match(readingKey);
  // Legacy readings sometimes omit punctuation. Never guess the split between
  // adjacent kanji words once their only separator has been removed.
  if (!matched) matched = match(unpunctuatedReading);
  if (!matched) return null;
  let index = 1;
  return groups.map(text => kanji.test(text) ? {text, reading: matched[index++]} : {text});
}

/** Align kana anchors so long authored clauses can wrap between ruby words. */
export function usageSentenceParts(part) {
  if (!part.reading || !kanji.test(part.text)) return [{text: part.text}];
  const inferred = inferredSentenceParts(part);
  if (inferred) return inferred;
  if (sentenceGroups(part.text).filter(group => kanji.test(group)).length < 2) return [part];
  // Never spread an ambiguous full reading over a whole clause. Use reviewed
  // display-only segments when available; otherwise show the text without
  // furigana and let the audit require an explicit mapping.
  return overrideMap.get(overrideKey(part)) ?? [{text: part.text}];
}

export function hasUnresolvedRuby(part) {
  if (!part?.reading || !kanji.test(part.text)) return false;
  if (sentenceGroups(part.text).filter(group => kanji.test(group)).length < 2) return false;
  return !inferredSentenceParts(part) && !overrideMap.has(overrideKey(part));
}
