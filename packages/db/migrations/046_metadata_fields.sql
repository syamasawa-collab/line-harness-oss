-- 友だち情報の項目マスター（metadata フィールド定義）
-- friends.metadata（自由形式 JSON）のキーを、管理画面で事前に定義・管理するための
-- マスターテーブル。値そのものは引き続き friends.metadata に保存する。
CREATE TABLE IF NOT EXISTS metadata_fields (
  id          TEXT PRIMARY KEY,
  field_key   TEXT NOT NULL UNIQUE,             -- metadata のキー名（例: company_name）
  label       TEXT NOT NULL,                    -- 管理画面での表示名（例: 会社名）
  field_type  TEXT NOT NULL DEFAULT 'text'
              CHECK (field_type IN ('text', 'number', 'date', 'select')),
  options     TEXT,                             -- field_type='select' のときの選択肢（JSON 配列）
  sort_order  INTEGER NOT NULL DEFAULT 0,       -- 表示順
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_metadata_fields_sort ON metadata_fields (sort_order);
