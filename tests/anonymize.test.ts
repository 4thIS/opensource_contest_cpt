import { describe, it, expect } from 'vitest';
import { anonymizeLine, newNameMap } from '../tools/anonymize.js';

describe('anonymizeLine', () => {
  it('사용자명을 치환하되 한글 경로 구조는 보존한다', () => {
    const map = newNameMap({ user: 'ddj25' });
    const out = anonymizeLine(
      JSON.stringify({ type: 'user', cwd: 'C:\\Users\\ddj25\\work\\공모전\\임베디드' }),
      map,
    );
    const o = JSON.parse(out);
    expect(o.cwd).toBe('C:\\Users\\testuser\\work\\공모전\\임베디드');
  });

  it('대화 본문을 자리표시자로 바꾼다', () => {
    const map = newNameMap({ user: 'ddj25' });
    const out = anonymizeLine(
      JSON.stringify({ type: 'user', message: { role: 'user', content: '비밀 이야기 sk-abc123' } }),
      map,
    );
    expect(JSON.parse(out).message.content).toBe('[redacted prompt]');
  });

  it('구조 필드는 그대로 둔다', () => {
    const map = newNameMap({ user: 'ddj25' });
    const src = { type: 'file-history-delta', trackingPath: 'C:\\a\\b.md',
                  backup: { backupFileName: 'abc@v1', version: 1, backupTime: 'T' } };
    const o = JSON.parse(anonymizeLine(JSON.stringify(src), map));
    expect(o.backup).toEqual(src.backup);
    expect(o.type).toBe('file-history-delta');
  });

  it('깨진 줄은 그대로 통과시킨다', () => {
    expect(anonymizeLine('{not json', newNameMap({ user: 'x' }))).toBe('{not json');
  });
});
