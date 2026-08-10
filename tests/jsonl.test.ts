import { describe, it, expect } from 'vitest';
import { parseJsonl } from '../src/reader/jsonl.js';

describe('parseJsonl', () => {
  it('정상 줄을 모두 파싱한다', () => {
    const text = '{"type":"a"}\n{"type":"b"}\n';
    const r = parseJsonl(text);
    expect(r.records).toHaveLength(2);
    expect(r.records[0]!.type).toBe('a');
    expect(r.parseErrors).toBe(0);
    expect(r.truncatedTail).toBe(false);
  });

  it('깨진 줄은 건너뛰고 나머지를 살린다', () => {
    const text = '{"type":"a"}\nnot json at all\n{"type":"b"}\n';
    const r = parseJsonl(text);
    expect(r.records.map((x) => x.type)).toEqual(['a', 'b']);
    expect(r.parseErrors).toBe(1);
  });

  it('빈 줄과 공백 줄은 오류로 세지 않는다', () => {
    const r = parseJsonl('{"type":"a"}\n\n   \n{"type":"b"}\n');
    expect(r.records).toHaveLength(2);
    expect(r.parseErrors).toBe(0);
  });

  it('마지막 줄이 잘리면 truncatedTail을 세우고 오류로 세지 않는다', () => {
    const r = parseJsonl('{"type":"a"}\n{"type":"assistant","uuid":"a9","time');
    expect(r.records).toHaveLength(1);
    expect(r.truncatedTail).toBe(true);
    expect(r.parseErrors).toBe(0);
  });

  it('CRLF 개행을 처리한다', () => {
    const r = parseJsonl('{"type":"a"}\r\n{"type":"b"}\r\n');
    expect(r.records).toHaveLength(2);
    expect(r.parseErrors).toBe(0);
  });

  it('JSON이지만 객체가 아닌 줄은 오류로 센다', () => {
    const r = parseJsonl('{"type":"a"}\n42\n"hello"\n');
    expect(r.records).toHaveLength(1);
    expect(r.parseErrors).toBe(2);
  });
});
