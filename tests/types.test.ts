import { describe, it, expect } from 'vitest';
import { emptyReport, emptyTokenSum } from '../src/types.js';

describe('AuditReport 계약', () => {
  it('빈 리포트가 모든 필수 키를 갖는다', () => {
    const r = emptyReport('C:/proj', 'proj');
    expect(Object.keys(r).sort()).toEqual(
      ['files', 'meta', 'project', 'range', 'sessions', 'stats', 'warnings'].sort(),
    );
    expect(r.project.root).toBe('C:/proj');
    expect(r.files).toEqual([]);
    expect(r.stats.lost).toBe(0);
  });

  it('빈 토큰 합계는 0으로 초기화된다', () => {
    expect(emptyTokenSum()).toEqual({
      input: 0, output: 0, cacheRead: 0, cacheCreation: 0,
    });
  });
});
