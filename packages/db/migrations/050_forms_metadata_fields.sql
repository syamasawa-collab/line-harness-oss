-- 050_forms_metadata_fields.sql
-- 友だちの metadata に保存する項目を絞る設定。
--
-- 背景：アンケートは save_to_metadata が有効だと全設問がそのまま
-- friends.metadata に入り、管理画面の友だち詳細がアンケートの回答で
-- 埋まる。数十問の調査ではCRMとして使えなくなる。
--
-- 一方で、氏名・会社名・メール・都道府県のような**属性情報**は
-- 友だちに残したい。次回のフォームで自動入力に使えるし、これが
-- 入らないとアンケートでしか聞いていない属性が友だちに反映されない。
--
-- metadata_fields に項目名のJSON配列を入れると、その項目だけを
-- metadata に保存する（NULL は従来どおり全項目）。
-- save_to_metadata = 0 のときは何も保存しない（従来の意味を保つ）。

ALTER TABLE forms ADD COLUMN metadata_fields TEXT;
