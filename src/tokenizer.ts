import { Segment, useDefault } from 'segmentit'

type SegmentResultItem = string | { w?: string }

const TOKEN_PATTERN = /\p{Script=Han}+|[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/gu
const HAS_VALID_CHAR_PATTERN = /[\p{Script=Han}A-Za-z0-9]/u

export class ChineseTokenizer {
  private readonly segmenter: Segment

  constructor() {
    this.segmenter = useDefault(new Segment())
  }

  public tokenize(input: string): string[] {
    const text = input.trim()
    if (!text) {
      return []
    }

    try {
      const segmented = this.segmenter.doSegment(text, { simple: true }) as SegmentResultItem[]
      const tokens = segmented
        .map(part => this.extractToken(part))
        .filter((term): term is string => term.length > 0)
      if (tokens.length > 0) {
        return tokens
      }
    }
    catch {
      // Fall back to a simpler tokenizer when segmentit fails.
    }

    return this.fallbackTokenize(text)
  }

  private extractToken(part: SegmentResultItem): string {
    if (typeof part === 'string') {
      return this.normalizeToken(part)
    }
    if (typeof part?.w === 'string') {
      return this.normalizeToken(part.w)
    }
    return ''
  }

  private normalizeToken(raw: string): string {
    const token = raw.trim()
    if (!token || !HAS_VALID_CHAR_PATTERN.test(token)) {
      return ''
    }
    return token
  }

  private fallbackTokenize(text: string): string[] {
    const tokens: string[] = []

    for (const match of text.matchAll(TOKEN_PATTERN)) {
      const chunk = match[0].trim()
      if (!chunk) {
        continue
      }

      // Chinese fallback is per-character, ensuring useful output without lexicon support.
      if (/^\p{Script=Han}+$/u.test(chunk)) {
        for (const char of chunk) {
          tokens.push(char)
        }
        continue
      }

      tokens.push(chunk)
    }

    return tokens
  }
}
