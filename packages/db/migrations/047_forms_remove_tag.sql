-- 047_forms_remove_tag.sql
-- フォーム送信時に「外す」タグを追加。null なら何も外さない（従来どおり）。
--
-- 用途は排他的な属性の登録。たとえば「飲食店」「飲食店以外」の2つのお立場
-- フォームがある場合、タグは付与されるだけで外れないため、両方のボタンを
-- 押した人は両方のタグを持ってしまい、以後の判定・セグメント配信・集計が
-- 実態と食い違う。各フォームに「反対側のタグを外す」設定を持たせることで、
-- 最後に選んだお立場だけが残るようにする。

ALTER TABLE forms ADD COLUMN on_submit_remove_tag_id TEXT REFERENCES tags(id) ON DELETE SET NULL;
