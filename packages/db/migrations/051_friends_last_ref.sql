-- 051_friends_last_ref.sql
-- 「直近どの入口から来たか」を記録する。
--
-- 既存の friends.ref_code は**ファーストタッチ**（最初に踏んだ入口）で、
-- 一度入ったら上書きしない。友だちの獲得元を知るにはこれが正しい。
--
-- ただしアンケートの集計で知りたいのは「この回答者が**今回**どの配布先URLから
-- 来たか」で、これは別の情報である。既存フォロワーが配布先URLを踏んで回答した
-- 場合、ファーストタッチは昔の入口のままなので、配布先別の回答数が数えられない。
--
-- そこで last_ref_code を分けて持つ。こちらは毎回上書きする（ラストタッチ）。

ALTER TABLE friends ADD COLUMN last_ref_code TEXT;
ALTER TABLE friends ADD COLUMN last_ref_at TEXT;

CREATE INDEX IF NOT EXISTS idx_friends_last_ref ON friends (last_ref_code);
