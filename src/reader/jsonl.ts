import { readFileSync } from 'node:fs';

export interface RawRecord { type?: string; [k: string]: unknown }

export interface ParseResult {
  records: RawRecord[];
  parseErrors: number;
  truncatedTail: boolean;   // 기록 중인 세션이면 마지막 줄이 잘려 있다
}

export function parseJsonl(text: string): ParseResult {
  const lines = text.split('\n');
  const records: RawRecord[] = [];
  let parseErrors = 0;
  let truncatedTail = false;

  // 파일이 개행으로 끝나지 않으면 마지막 줄은 기록 중일 수 있다.
  const endsWithNewline = text.endsWith('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.replace(/\r$/, '').trim();
    if (!line) continue;

    const isLast = i === lines.length - 1;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        parseErrors++;
        continue;
      }
      records.push(parsed as RawRecord);
    } catch {
      if (isLast && !endsWithNewline) {
        truncatedTail = true;   // 기록 중 — 오류가 아니다
      } else {
        parseErrors++;
      }
    }
  }

  return { records, parseErrors, truncatedTail };
}

export function readSessionFile(absPath: string): ParseResult {
  try {
    return parseJsonl(readFileSync(absPath, 'utf8'));
  } catch {
    return { records: [], parseErrors: 1, truncatedTail: false };
  }
}
