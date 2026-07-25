import { describe, it, expect } from 'vitest';
import { pickMetadataToSave, parseMetadataFields } from './form-metadata.js';

/**
 * アンケートの回答を友だち詳細に出さず、氏名・会社名等の属性だけを
 * 残すための絞り込み。ここが緩むと数十問の回答が friends.metadata に
 * 流れ込み、管理画面の友だち詳細がアンケートで埋まる。
 */

const ANSWERS = {
  respondent_name: '山澤修平',
  company_name: 'レストランテック協会',
  email: 's@example.com',
  likert_a: '5',
  opinion_policy: '長い自由記述',
};

describe('parseMetadataFields', () => {
  it('JSON配列をパースする', () => {
    expect(parseMetadataFields('["a","b"]')).toEqual(['a', 'b']);
  });

  it('未設定・空・壊れた値は null（＝全項目保存）として扱う', () => {
    expect(parseMetadataFields(null)).toBeNull();
    expect(parseMetadataFields('')).toBeNull();
    expect(parseMetadataFields('not json')).toBeNull();
    expect(parseMetadataFields('{"a":1}')).toBeNull();
  });

  it('文字列以外の要素は捨てる', () => {
    expect(parseMetadataFields('[1,"a",null]')).toEqual(['a']);
  });

  it('空配列は「保存しない」を意味するので空配列のまま返す', () => {
    expect(parseMetadataFields('[]')).toEqual([]);
  });
});

describe('pickMetadataToSave', () => {
  it('save_to_metadata が 0 なら null（何も保存しない）', () => {
    expect(pickMetadataToSave({ save_to_metadata: 0 }, ANSWERS)).toBeNull();
  });

  it('metadata_fields 未設定なら全項目（従来の挙動）', () => {
    expect(pickMetadataToSave({ save_to_metadata: 1 }, ANSWERS)).toEqual(ANSWERS);
  });

  it('metadata_fields があればその項目だけを保存する', () => {
    const picked = pickMetadataToSave(
      { save_to_metadata: 1, metadata_fields: '["respondent_name","company_name","email"]' },
      ANSWERS,
    );
    expect(picked).toEqual({
      respondent_name: '山澤修平',
      company_name: 'レストランテック協会',
      email: 's@example.com',
    });
    expect(picked).not.toHaveProperty('likert_a');
    expect(picked).not.toHaveProperty('opinion_policy');
  });

  it('未回答の項目は書き込まない（既存の値を空で上書きしない）', () => {
    const picked = pickMetadataToSave(
      { save_to_metadata: 1, metadata_fields: '["respondent_name","prefecture"]' },
      { respondent_name: '山澤修平' },
    );
    expect(picked).toEqual({ respondent_name: '山澤修平' });
  });

  it('空配列なら null（保存対象なし）', () => {
    expect(
      pickMetadataToSave({ save_to_metadata: 1, metadata_fields: '[]' }, ANSWERS),
    ).toBeNull();
  });

  it('保存対象が1つも含まれない送信では null', () => {
    expect(
      pickMetadataToSave({ save_to_metadata: 1, metadata_fields: '["prefecture"]' }, ANSWERS),
    ).toBeNull();
  });
});
