import { describe, expect, it } from 'vitest';
import { joinBase } from '@/lib/url/with-base';

describe('joinBase', () => {
  it('prefixes a root-absolute path with the base', () => {
    expect(joinBase('/blog', '/principles/typescript/no-casting')).toBe(
      '/blog/principles/typescript/no-casting',
    );
  });

  it('roots a path that has no leading slash', () => {
    expect(joinBase('/blog', 'principles')).toBe('/blog/principles');
  });

  it('maps the root path to the base root with a trailing slash', () => {
    expect(joinBase('/blog', '/')).toBe('/blog/');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(joinBase('/blog/', '/skills')).toBe('/blog/skills');
  });

  it('is a no-op when the base is the domain root', () => {
    expect(joinBase('/', '/c/testing')).toBe('/c/testing');
  });

  it('does not collapse the scheme of an absolute path it is given', () => {
    // Only ever called with internal paths; double slashes inside the path collapse.
    expect(joinBase('/blog', '/c//testing')).toBe('/blog/c/testing');
  });
});
