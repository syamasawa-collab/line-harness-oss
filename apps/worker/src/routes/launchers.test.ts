import { describe, it, expect } from 'vitest';
import { isSafeTargetUrl, SLUG_PATTERN, resolvePublicOrigin } from './launchers.js';

/**
 * ランチャーページは運用者が設定した target_url を HTML の href に出す。
 * 値の検証を緩めると、そこがそのまま注入口になる（`javascript:` スキームや
 * 属性を閉じる引用符）。slug は URL のパスに入るので同様に絞る。
 */
describe('isSafeTargetUrl', () => {
  it.each([
    'https://liff.line.me/2010757177-abc?page=gate&ref=x',
    'https://line.me/R/ti/p/@974doceg',
    'https://example.com/a/b?c=1&d=2#frag',
  ])('https の通常URLは許可する: %s', (url) => {
    expect(isSafeTargetUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',                       // スキーム注入
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com',                        // 平文HTTPは許可しない
    'line://app/123',                            // カスタムスキームは許可しない
    '//example.com',
    '',
    'https://example.com/" onclick="alert(1)',   // 属性を閉じる引用符
    "https://example.com/' onclick='alert(1)",
    'https://example.com/<script>',
    'https://exa mple.com',                      // 空白
  ])('危険・不正な値は拒否する: %j', (url) => {
    expect(isSafeTargetUrl(url)).toBe(false);
  });
});

describe('SLUG_PATTERN', () => {
  it.each(['01', 'ssw2026', 'a_b-c', 'A1'])('通常のslugは許可: %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(['', '../etc', 'a/b', 'a b', 'a.b', '<script>', 'x'.repeat(33)])(
    'パス操作や記号を含むslugは拒否: %j',
    (slug) => {
      expect(SLUG_PATTERN.test(slug)).toBe(false);
    },
  );
});

/**
 * 独自サブドメイン（vor.shokudanren.jp）から Netlify の 200 プロキシ経由で
 * 配信する場合、og:url と shareUrl は配布したURLと一致していなければ
 * プレビューに別ドメインが出て不信感につながる。
 * ただし X-Forwarded-Host はクライアントが自由に付けられるので、
 * 自社ドメイン以外は採用しない（採用値はHTMLに出る）。
 */
describe('resolvePublicOrigin', () => {
  const REQ = 'https://line-harness.shokudanren.workers.dev/s/01';

  it('ヘッダが無ければリクエストのオリジンを使う', () => {
    expect(resolvePublicOrigin(REQ, null)).toBe('https://line-harness.shokudanren.workers.dev');
  });

  it('自社サブドメインなら採用する', () => {
    expect(resolvePublicOrigin(REQ, 'vor.shokudanren.jp')).toBe('https://vor.shokudanren.jp');
    expect(resolvePublicOrigin(REQ, 'VOR.Shokudanren.JP')).toBe('https://vor.shokudanren.jp');
  });

  it('カンマ区切りで複数来たら先頭だけを見る', () => {
    expect(resolvePublicOrigin(REQ, 'vor.shokudanren.jp, evil.example.com')).toBe(
      'https://vor.shokudanren.jp',
    );
  });

  it.each([
    'evil.example.com',
    'shokudanren.jp.evil.com',
    'vor.shokudanren.jp.evil.com',
    'a.b.shokudanren.jp',
    'vor.shokudanren.jp:8080',
    'vor.shokudanren.jp"><script>',
    '',
  ])('信頼できない値は無視する: %j', (host) => {
    expect(resolvePublicOrigin(REQ, host)).toBe('https://line-harness.shokudanren.workers.dev');
  });
});
