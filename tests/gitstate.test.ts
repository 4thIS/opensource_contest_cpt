import { describe, it, expect } from 'vitest';
import { classify } from '../src/auditor/gitstate.js';
import { blobHash } from '../src/resolver/git.js';

const A = Buffer.from('final\n');
const B = Buffer.from('someone else edited\n');
const hashA = blobHash(A);

describe('classify', () => {
  it('디스크와 같고 git에도 있으면 committed', () => {
    expect(classify({ finalContent: A, currentContent: A, gitBlobs: new Set([hashA]) }))
      .toBe('committed');
  });

  it('디스크와 같은데 git에 없으면 uncommitted', () => {
    expect(classify({ finalContent: A, currentContent: A, gitBlobs: new Set() }))
      .toBe('uncommitted');
  });

  it('디스크와 다른데 git 히스토리에 남아있으면 superseded', () => {
    expect(classify({ finalContent: A, currentContent: B, gitBlobs: new Set([hashA]) }))
      .toBe('superseded');
  });

  it('디스크에도 git에도 없으면 lost', () => {
    expect(classify({ finalContent: A, currentContent: B, gitBlobs: new Set() }))
      .toBe('lost');
  });

  it('파일이 사라졌고 git에도 없으면 lost', () => {
    expect(classify({ finalContent: A, currentContent: null, gitBlobs: new Set() }))
      .toBe('lost');
  });

  it('git 저장소가 아니면 unknown', () => {
    expect(classify({ finalContent: A, currentContent: A, gitBlobs: null })).toBe('unknown');
  });

  it('세션 최종본 내용을 모르면 unknown', () => {
    expect(classify({ finalContent: null, currentContent: A, gitBlobs: new Set() }))
      .toBe('unknown');
  });

  it('git 없이 디스크만 같아도 unknown (커밋 여부를 단정하지 않는다)', () => {
    expect(classify({ finalContent: A, currentContent: A, gitBlobs: null })).toBe('unknown');
  });
});
