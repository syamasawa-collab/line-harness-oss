import { describe, it, expect } from 'vitest';
import { buildWebhookBody } from './form-webhook-body.js';

/**
 * 集計のための付加情報（流入元）が、回答そのものを壊してはいけない。
 * この形が崩れるとスプレッドシートの列がずれ、調査データが痛む。
 */

const ANSWERS = { likert_a: '5', respondent_name: '山澤修平', store_count: '3' };

describe('buildWebhookBody', () => {
  it('ref を1つだけ足す。回答は変えない', () => {
    const body = buildWebhookBody(ANSWERS, 'ref-01');
    expect(body).toEqual({ ...ANSWERS, ref: 'ref-01' });
  });

  it('ref が無ければ回答オブジェクトをそのまま返す（構造も同一）', () => {
    expect(buildWebhookBody(ANSWERS, null)).toBe(ANSWERS);
    expect(buildWebhookBody(ANSWERS, undefined)).toBe(ANSWERS);
    expect(buildWebhookBody(ANSWERS, '')).toBe(ANSWERS);
  });

  it('同名の設問がある場合は回答を優先する（付加情報で上書きしない）', () => {
    const withRefField = { ...ANSWERS, ref: '回答者が入力した値' };
    const body = buildWebhookBody(withRefField, 'ref-01');
    expect(body.ref).toBe('回答者が入力した値');
  });

  it('元のオブジェクトを書き換えない', () => {
    const original = { ...ANSWERS };
    buildWebhookBody(original, 'ref-01');
    expect(original).toEqual(ANSWERS);
    expect(original).not.toHaveProperty('ref');
  });

  it('回答が空でも壊れない', () => {
    expect(buildWebhookBody({}, 'ref-01')).toEqual({ ref: 'ref-01' });
    expect(buildWebhookBody({}, null)).toEqual({});
  });
});
