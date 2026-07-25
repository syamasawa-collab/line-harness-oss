-- 048_launchers.sql
-- 配布用の短いURL（ランチャーページ）。
--
-- 目的は3つ。
-- (1) SNSのアプリ内ブラウザ対策：Facebook / Instagram の内蔵ブラウザは
--     ユニバーサルリンクを尊重しないことがあり、LIFF URL を直接配ると
--     LINEが開かない。普通のHTMLページなら確実に表示できるので、そこに
--     置いたボタンを利用者にタップさせる（自動転送はしない。自動転送は
--     リダイレクト経由と同じでLIFFが起動しない）。
-- (2) 配布URLの短縮：LIFF URL に載せていたパラメータをこちら側に置ける。
-- (3) 配布チャネルを問わず同一形式のURLで配れる（運用側の要望）。
--
-- target_url に完成形の遷移先（LIFF URL 等）を入れる。ページはそれを
-- ボタンの href に出すだけなので、遷移先の仕様変更に追随しやすい。

CREATE TABLE IF NOT EXISTS launchers (
  slug TEXT PRIMARY KEY,
  name TEXT,
  target_url TEXT NOT NULL,
  headline TEXT,
  body TEXT,
  button_label TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_launchers_is_active ON launchers (is_active);
