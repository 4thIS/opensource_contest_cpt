import { describe, it, expect } from 'vitest';
import { makeDiff, countLines, isBinary } from '../src/auditor/diff.js';

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('makeDiff', () => {
  it('추가된 줄을 잡는다', () => {
    const h = makeDiff(buf('a\n'), buf('a\nb\n'), 'f.md');
    expect(h).not.toBeNull();
    expect(countLines(h!)).toEqual({ added: 1, removed: 0 });
  });

  it('삭제된 줄을 잡는다', () => {
    const h = makeDiff(buf('a\nb\n'), buf('a\n'), 'f.md');
    expect(countLines(h!)).toEqual({ added: 0, removed: 1 });
  });

  it('내용이 같으면 빈 배열을 준다', () => {
    expect(makeDiff(buf('a\n'), buf('a\n'), 'f.md')).toEqual([]);
  });

  it('before가 null이면 전부 추가로 본다 (신규 생성)', () => {
    const h = makeDiff(null, buf('a\nb\n'), 'f.md');
    expect(countLines(h!)).toEqual({ added: 2, removed: 0 });
  });

  it('after가 null이면 전부 삭제로 본다', () => {
    const h = makeDiff(buf('a\nb\n'), null, 'f.md');
    expect(countLines(h!)).toEqual({ added: 0, removed: 2 });
  });

  it('둘 다 null이면 null을 준다', () => {
    expect(makeDiff(null, null, 'f.md')).toBeNull();
  });

  it('바이너리는 null을 준다', () => {
    expect(makeDiff(Buffer.from([0, 1, 2, 0]), buf('a\n'), 'f.bin')).toBeNull();
  });

  it('한글 내용을 손상 없이 다룬다', () => {
    const h = makeDiff(buf('안녕\n'), buf('안녕\n반가워\n'), 'f.md');
    expect(h!.some((x) => x.lines.some((l) => l.includes('반가워'))).valueOf()).toBe(true);
  });
});

describe('isBinary', () => {
  it('NUL 바이트가 있으면 바이너리', () => {
    expect(isBinary(Buffer.from([65, 0, 66]))).toBe(true);
  });
  it('평범한 텍스트는 아니다', () => {
    expect(isBinary(buf('hello 한글\n'))).toBe(false);
  });
});
