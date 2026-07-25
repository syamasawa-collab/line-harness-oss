import { Hono } from 'hono';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

/**
 * ランチャーページ — 配布用の短いURL（`/s/<slug>`）。
 *
 * なぜ「普通のHTMLページ + ボタン」なのか:
 *
 * LIFF URL（`liff.line.me/...`）を配布チャネルに直接貼ると、環境によって
 * LINEアプリが起動せず、LINEのWebログイン画面に化けることがある。原因は
 * iOSのユニバーサルリンクが「リンクをタップしたとき」しか発火しないことと、
 * SNS（Facebook / Instagram）の内蔵ブラウザがそれを尊重しないことがあるため。
 *
 * ランチャーページを挟むと、内蔵ブラウザが読むのは**普通のHTML**になるので
 * 確実に表示でき、そこから利用者が**タップ**して遷移する形にできる。
 * 「開かないときはSafariで開いてください」といった案内も添えられる。
 *
 * 自動転送（302 / meta refresh / onload のJS遷移）は**使わない**。
 * それはリダイレクト経由と同じで、LIFFが起動しない元の問題に戻る。
 */
const launchers = new Hono<Env>();

interface LauncherRow {
  slug: string;
  name: string | null;
  target_url: string;
  headline: string | null;
  body: string | null;
  button_label: string | null;
  og_image_url: string | null;
  view_count: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * target_url は運用者が設定した値をページの href に出すため、
 * `javascript:` 等のスキームを弾いて https に限定する。
 */
export function isSafeTargetUrl(url: string): boolean {
  return /^https:\/\/[^\s"'<>]+$/.test(url);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 改行を <br> にする（本文を運用者が書けるようにするため） */
function escapeMultiline(str: string): string {
  return escapeHtml(str).replace(/\r?\n/g, '<br>');
}

function serialize(row: LauncherRow, origin: string) {
  return {
    slug: row.slug,
    name: row.name,
    targetUrl: row.target_url,
    headline: row.headline,
    body: row.body,
    buttonLabel: row.button_label,
    ogImageUrl: row.og_image_url,
    viewCount: row.view_count,
    isActive: Boolean(row.is_active),
    shareUrl: `${origin}/s/${row.slug}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_HEADLINE = 'アンケートのご協力をお願いします';
const DEFAULT_BUTTON = 'LINEで回答する';

function renderPage(row: LauncherRow, origin: string): string {
  const headline = escapeHtml(row.headline || DEFAULT_HEADLINE);
  const body = row.body ? escapeMultiline(row.body) : '';
  const label = escapeHtml(row.button_label || DEFAULT_BUTTON);
  const href = escapeHtml(row.target_url);

  // SNS・LINEに貼られたときのプレビュー（OGP）。
  // 画像が無いとリンクが素のテキストに見えて信頼されにくく、開封率に直接響く。
  // og:description は本文の改行を詰めて1行にする（プレビューは改行を扱えない）。
  const ogUrl = escapeHtml(`${origin}/s/${row.slug}`);
  const ogDesc = escapeHtml(
    (row.body || '').replace(/\s*\n+\s*/g, ' ').trim().slice(0, 180),
  );
  const ogImage = row.og_image_url ? escapeHtml(row.og_image_url) : '';
  const ogTags = [
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${headline}">`,
    ogDesc ? `<meta property="og:description" content="${ogDesc}">` : '',
    `<meta property="og:url" content="${ogUrl}">`,
    '<meta property="og:locale" content="ja_JP">',
    ogImage ? `<meta property="og:image" content="${ogImage}">` : '',
    ogImage ? '<meta property="og:image:width" content="1200">' : '',
    ogImage ? '<meta property="og:image:height" content="630">' : '',
    ogImage
      ? '<meta name="twitter:card" content="summary_large_image">'
      : '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${headline}">`,
    ogDesc ? `<meta name="twitter:description" content="${ogDesc}">` : '',
    ogImage ? `<meta name="twitter:image" content="${ogImage}">` : '',
    ogDesc ? `<meta name="description" content="${ogDesc}">` : '',
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${headline}</title>
<meta name="robots" content="noindex">
${ogTags}
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 20px 40px;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
    background: #f7f8fa; color: #1f2328; line-height: 1.75;
    display: flex; justify-content: center;
  }
  .wrap { width: 100%; max-width: 460px; }
  .card {
    background: #fff; border-radius: 14px; padding: 24px 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
  }
  h1 { font-size: 19px; line-height: 1.6; margin: 0 0 14px; }
  p { font-size: 14.5px; margin: 0 0 14px; color: #3c4149; }
  .btn {
    display: block; text-align: center; text-decoration: none;
    background: #06C755; color: #fff; font-weight: 700; font-size: 16px;
    border-radius: 10px; padding: 16px; margin: 22px 0 12px;
  }
  .hint { font-size: 12.5px; color: #6b7280; margin: 0 0 8px; }
  .note {
    margin-top: 20px; padding-top: 16px; border-top: 1px solid #e9ecef;
    font-size: 12px; color: #8a9099;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #14161a; color: #e6e8eb; }
    .card { background: #1c1f24; box-shadow: none; }
    p { color: #c3c8cf; }
    .note { border-top-color: #2b3038; }
  }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1>${headline}</h1>
    ${body ? `<p>${body}</p>` : ''}
    <a class="btn" href="${href}">${label}</a>
    <p class="hint">ボタンを押すとLINEが開きます。</p>
    <p class="hint">
      開かない場合は、この画面右上のメニューから「ブラウザで開く」（Safari等）を選び、
      もう一度お試しください。
    </p>
    <div class="note">
      パソコンでご覧の場合は、お手数ですがスマートフォンのLINEからお願いいたします。
    </div>
  </div>
</div>
</body></html>`;
}

// GET /s/:slug — 配布用ページ（公開）
launchers.get('/s/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = await c.env.DB
    .prepare('SELECT * FROM launchers WHERE slug = ?')
    .bind(slug)
    .first<LauncherRow>();

  if (!row || !row.is_active) {
    return c.text('このリンクは現在ご利用いただけません。', 404);
  }

  // 表示数を記録する。直リンク配布ではトラッキングリンクのクリック数が
  // 増えないため、配布先ごとの反応を見る唯一の手がかりになる。
  // 失敗しても表示は止めない。
  c.executionCtx.waitUntil(
    c.env.DB
      .prepare('UPDATE launchers SET view_count = view_count + 1 WHERE slug = ?')
      .bind(slug)
      .run()
      .then(() => undefined)
      .catch((err: unknown) => {
        console.error(`/s/${slug} view_count update failed:`, err);
      }),
  );

  return c.html(renderPage(row, new URL(c.req.url).origin), 200, {
    'Cache-Control': 'no-store',
  });
});

// GET /api/launchers — 一覧
launchers.get('/api/launchers', async (c) => {
  try {
    const result = await c.env.DB
      .prepare('SELECT * FROM launchers ORDER BY slug ASC')
      .all<LauncherRow>();
    const origin = new URL(c.req.url).origin;
    return c.json({ success: true, data: result.results.map((r) => serialize(r, origin)) });
  } catch (err) {
    console.error('GET /api/launchers error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/launchers — 作成（同じ slug なら上書き）
launchers.post('/api/launchers', async (c) => {
  try {
    const body = await c.req.json<{
      slug: string;
      targetUrl: string;
      name?: string | null;
      headline?: string | null;
      body?: string | null;
      buttonLabel?: string | null;
      ogImageUrl?: string | null;
    }>();

    if (!body.slug || !SLUG_PATTERN.test(body.slug)) {
      return c.json(
        { success: false, error: 'slug is required (letters, digits, hyphen, underscore; max 32)' },
        400,
      );
    }
    if (!body.targetUrl || !isSafeTargetUrl(body.targetUrl)) {
      return c.json({ success: false, error: 'targetUrl must be an https URL' }, 400);
    }
    if (body.ogImageUrl && !isSafeTargetUrl(body.ogImageUrl)) {
      return c.json({ success: false, error: 'ogImageUrl must be an https URL' }, 400);
    }

    const now = jstNow();
    await c.env.DB
      .prepare(
        `INSERT INTO launchers (slug, name, target_url, headline, body, button_label, view_count, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           target_url = excluded.target_url,
           headline = excluded.headline,
           body = excluded.body,
           button_label = excluded.button_label,
           og_image_url = excluded.og_image_url,
           updated_at = excluded.updated_at`,
      )
      .bind(
        body.slug,
        body.name ?? null,
        body.targetUrl,
        body.headline ?? null,
        body.body ?? null,
        body.buttonLabel ?? null,
        body.ogImageUrl ?? null,
        now,
        now,
      )
      .run();

    const row = await c.env.DB
      .prepare('SELECT * FROM launchers WHERE slug = ?')
      .bind(body.slug)
      .first<LauncherRow>();
    return c.json({ success: true, data: serialize(row!, new URL(c.req.url).origin) }, 201);
  } catch (err) {
    console.error('POST /api/launchers error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/launchers/:slug — 更新（配布後に遷移先や文面を差し替えられる）
launchers.patch('/api/launchers/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const body = await c.req.json<{
      name?: string | null;
      targetUrl?: string;
      headline?: string | null;
      body?: string | null;
      buttonLabel?: string | null;
      ogImageUrl?: string | null;
      isActive?: boolean;
    }>();

    const existing = await c.env.DB
      .prepare('SELECT * FROM launchers WHERE slug = ?')
      .bind(slug)
      .first<LauncherRow>();
    if (!existing) return c.json({ success: false, error: 'Launcher not found' }, 404);

    if (body.targetUrl !== undefined && !isSafeTargetUrl(body.targetUrl)) {
      return c.json({ success: false, error: 'targetUrl must be an https URL' }, 400);
    }
    if (body.ogImageUrl && !isSafeTargetUrl(body.ogImageUrl)) {
      return c.json({ success: false, error: 'ogImageUrl must be an https URL' }, 400);
    }

    await c.env.DB
      .prepare(
        `UPDATE launchers
           SET name = ?, target_url = ?, headline = ?, body = ?, button_label = ?, og_image_url = ?, is_active = ?, updated_at = ?
         WHERE slug = ?`,
      )
      .bind(
        body.name === undefined ? existing.name : body.name,
        body.targetUrl === undefined ? existing.target_url : body.targetUrl,
        body.headline === undefined ? existing.headline : body.headline,
        body.body === undefined ? existing.body : body.body,
        body.buttonLabel === undefined ? existing.button_label : body.buttonLabel,
        body.ogImageUrl === undefined ? existing.og_image_url : body.ogImageUrl,
        body.isActive === undefined ? existing.is_active : body.isActive ? 1 : 0,
        jstNow(),
        slug,
      )
      .run();

    const row = await c.env.DB
      .prepare('SELECT * FROM launchers WHERE slug = ?')
      .bind(slug)
      .first<LauncherRow>();
    return c.json({ success: true, data: serialize(row!, new URL(c.req.url).origin) });
  } catch (err) {
    console.error('PATCH /api/launchers/:slug error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/launchers/:slug
launchers.delete('/api/launchers/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    await c.env.DB.prepare('DELETE FROM launchers WHERE slug = ?').bind(slug).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/launchers/:slug error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { launchers };
