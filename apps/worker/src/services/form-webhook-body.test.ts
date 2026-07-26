import { describe, it, expect } from 'vitest';
import { buildWebhookBody, resolveRefForSubmission } from './form-webhook-body.js';

/**
 * 集計のための付加情報（流入元）が、回答そのものを壊してはいけない。
 * この形が崩れるとスプレッドシートの列がずれ、調査データが痛む。
 */

const ANSWERS = { likert_a: '5', respondent_name: '山澤修平', store_count: '3' };

describe('resolveRefForSubmission', () => {
  it('ラストタッチを使う（今回どの配布先URLから来たか）', () => {
    expect(
      resolveRefForSubmission({ ref_code: 'first-touch', last_ref_code: 'this-click' }),
    ).toBe('this-click');
  });

  it('ラストタッチが無ければファーストタッチで代用する', () => {
    // ラストタッチの記録を始める前に来た人のため
    expect(resolveRefForSubmission({ ref_code: 'first-touch', last_ref_code: null })).toBe(
      'first-touch',
    );
  });

  it('どちらも無ければ null', () => {
    expect(resolveRefForSubmission({ ref_code: null, last_ref_code: null })).toBeNull();
    expect(resolveRefForSubmission(null)).toBeNull();
  });
});

describe('buildWebhookBody', () => {
  it('流入元を足す。回答は変えない', () => {
    const body = buildWebhookBody(ANSWERS, { ref: 'ref-12', refName: '東京都飲食業組合' });
    expect(body).toEqual({ ...ANSWERS, ref: 'ref-12', ref_name: '東京都飲食業組合' });
  });

  it('流入元が無ければ回答オブジェクトをそのまま返す（構造も同一）', () => {
    expect(buildWebhookBody(ANSWERS, null)).toBe(ANSWERS);
    expect(buildWebhookBody(ANSWERS, undefined)).toBe(ANSWERS);
    expect(buildWebhookBody(ANSWERS, { ref: null, refName: null })).toBe(ANSWERS);
  });

  it('空文字は載せない', () => {
    expect(buildWebhookBody(ANSWERS, { ref: '', refName: '' })).toBe(ANSWERS);
  });

  it('表示名が引けなくても ref だけ載せる', () => {
    expect(buildWebhookBody(ANSWERS, { ref: 'ref-12', refName: null })).toEqual({
      ...ANSWERS,
      ref: 'ref-12',
    });
  });

  it('同名の設問がある場合は回答を優先する（付加情報で上書きしない）', () => {
    const withRefField = { ...ANSWERS, ref: '回答者が入力した値' };
    const body = buildWebhookBody(withRefField, { ref: 'ref-12' });
    expect(body.ref).toBe('回答者が入力した値');
  });

  it('元のオブジェクトを書き換えない', () => {
    const original = { ...ANSWERS };
    buildWebhookBody(original, { ref: 'ref-12', refName: 'name' });
    expect(original).toEqual(ANSWERS);
    expect(original).not.toHaveProperty('ref');
  });

  it('回答が空でも壊れない', () => {
    expect(buildWebhookBody({}, { ref: 'ref-12' })).toEqual({ ref: 'ref-12' });
    expect(buildWebhookBody({}, null)).toEqual({});
  });
});
