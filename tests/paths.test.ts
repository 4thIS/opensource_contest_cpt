import { describe, it, expect } from 'vitest';
import {
  normalizePath, pathKey, isAncestor, relativeTo, hashPath,
} from '../src/resolver/paths.js';

describe('normalizePath', () => {
  it('역슬래시를 슬래시로 바꾼다', () => {
    expect(normalizePath('C:\\Users\\t\\work')).toBe('C:/Users/t/work');
  });
  it('드라이브 문자를 대문자로 만든다', () => {
    expect(normalizePath('c:/users/t')).toBe('C:/users/t');
  });
  it('후행 슬래시를 제거한다', () => {
    expect(normalizePath('C:/Users/t/')).toBe('C:/Users/t');
  });
  it('루트만 남는 경우 슬래시를 지키다', () => {
    expect(normalizePath('/')).toBe('/');
  });
  it('한글 경로를 손상 없이 보존한다', () => {
    expect(normalizePath('C:\\Users\\t\\work\\공모전\\임베디드'))
      .toBe('C:/Users/t/work/공모전/임베디드');
  });
  it('중복 슬래시를 접는다', () => {
    expect(normalizePath('C:\\\\Users\\\\t')).toBe('C:/Users/t');
  });
});

describe('pathKey', () => {
  it('대소문자를 무시하고 같은 키를 준다', () => {
    expect(pathKey('C:/Users/T')).toBe(pathKey('c:/users/t'));
  });
});

describe('isAncestor', () => {
  it('상위 폴더를 인식한다', () => {
    expect(isAncestor('C:/a/b', 'C:/a/b/c')).toBe(true);
  });
  it('자기 자신은 상위가 아니다', () => {
    expect(isAncestor('C:/a/b', 'C:/a/b')).toBe(false);
  });
  it('접두어가 같아도 경계가 다르면 아니다', () => {
    expect(isAncestor('C:/a/b', 'C:/a/bc')).toBe(false);
  });
  it('형제 폴더는 아니다 (공모전/임베디드 vs 오픈소스)', () => {
    expect(isAncestor('C:/w/공모전/임베디드', 'C:/w/공모전/오픈소스')).toBe(false);
  });
});

describe('relativeTo', () => {
  it('루트 안이면 상대경로를 준다', () => {
    expect(relativeTo('C:/a', 'C:/a/b/c.md')).toBe('b/c.md');
  });
  it('루트 밖이면 null을 준다', () => {
    expect(relativeTo('C:/a', 'C:/z/x.md')).toBeNull();
  });
  it('루트 자신은 빈 문자열이 아니라 null이 아니다', () => {
    expect(relativeTo('C:/a', 'C:/a')).toBe('');
  });
});

describe('hashPath', () => {
  it('같은 경로는 같은 id, 대소문자만 다르면 같은 id', () => {
    expect(hashPath('C:/a/B.md')).toBe(hashPath('c:/A/b.md'));
  });
  it('다른 경로는 다른 id', () => {
    expect(hashPath('C:/a.md')).not.toBe(hashPath('C:/b.md'));
  });
});
