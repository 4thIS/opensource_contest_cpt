import { describe, it, expect } from 'vitest';
import { redactText, redactReport } from '../src/redact/secrets.js';
import { emptyReport } from '../src/types.js';

describe('redactText', () => {
  it('OpenAI 형식 키를 가린다', () => {
    const r = redactText('key is sk-abcdefghij0123456789ABCDEFGHIJ done');
    expect(r.text).not.toContain('sk-abcdefghij');
    expect(r.text).toContain('▓▓▓');
    expect(r.count).toBe(1);
  });

  it('GitHub 토큰을 가린다', () => {
    const r = redactText(`token ghp_${'a'.repeat(36)}`);
    expect(r.text).toContain('▓▓▓');
    expect(r.count).toBe(1);
  });

  it('AWS 액세스 키를 가린다', () => {
    const r = redactText('AKIAIOSFODNN7EXAMPLE');
    expect(r.count).toBe(1);
  });

  it('PRIVATE KEY 블록을 통째로 가린다', () => {
    const r = redactText('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----');
    expect(r.text).not.toContain('abc');
    expect(r.count).toBe(1);
  });

  it('여러 개를 각각 센다', () => {
    const r = redactText(`sk-${'a'.repeat(24)} and ghp_${'b'.repeat(36)}`);
    expect(r.count).toBe(2);
  });

  it('평범한 텍스트는 건드리지 않는다', () => {
    const r = redactText('그냥 한글 문장입니다. sk- 는 접두어만 있고요.');
    expect(r.count).toBe(0);
    expect(r.text).toContain('한글 문장');
  });
});

describe('redactReport', () => {
  it('대화 본문과 diff를 가리고 stats.redacted를 채운다', () => {
    const rep = emptyReport('C:/p', 'p');
    rep.sessions.push({
      id: 's1', title: null, startedAt: '', endedAt: '', launchCwd: 'C:/p',
      cwds: [], gitBranches: [], ccVersion: '', model: null,
      counts: { user: 0, assistant: 0, tools: {} },
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      firstPrompt: `my key sk-${'a'.repeat(24)}`,
      fileIds: [], inProgress: false,
      messages: [{ uuid: 'u', role: 'user', at: '', text: `AKIAIOSFODNN7EXAMPLE`, toolCalls: [] }],
    });
    const out = redactReport(rep);
    expect(out.stats.redacted).toBe(2);
    expect(out.sessions[0]!.firstPrompt).toContain('▓▓▓');
    expect(out.sessions[0]!.messages![0]!.text).toContain('▓▓▓');
  });

  it('.env 파일의 diff는 통째로 가린다', () => {
    const rep = emptyReport('C:/p', 'p');
    rep.files.push({
      id: 'f1', absPath: 'C:/p/.env', relPath: '.env',
      status: 'modified', gitState: 'unknown',
      versions: [], touches: [],
      diff: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
               lines: ['-OLD=1', '+DB_PASSWORD=hunter2'] }],
      diffAvailability: 'full',
    });
    const out = redactReport(rep);
    expect(JSON.stringify(out.files[0]!.diff)).not.toContain('hunter2');
    expect(out.stats.redacted).toBeGreaterThan(0);
  });
});
