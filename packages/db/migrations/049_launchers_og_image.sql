-- 049_launchers_og_image.sql
-- ランチャーページのOGP画像URL。null ならOGP画像なし（テキストのみのプレビュー）。
--
-- SNSやLINEに貼られたとき、画像が無いとリンクが素のテキストに見えて信頼されにくい。
-- 開封率に直接響くため、キャンペーンごとにブランド画像を差し替えられるようにする。

ALTER TABLE launchers ADD COLUMN og_image_url TEXT;
