'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { MetadataField, MetadataFieldType } from '@/lib/api'
import Header from '@/components/layout/header'

const TYPE_LABELS: Record<MetadataFieldType, string> = {
  text: 'テキスト',
  number: '数値',
  date: '日付',
  select: '選択肢',
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; field: MetadataField }
  | { kind: 'delete'; field: MetadataField }

export default function FriendFieldsPage() {
  const [fields, setFields] = useState<MetadataField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.metadataFields.list()
      if (res.success) setFields(res.data)
      else setError(res.error)
    } catch {
      setError('項目の読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <Header
        title="友だち情報の項目"
        description="友だちに登録できる情報項目（会社名・役職など）をあらかじめ定義します。ここで定義した項目は、友だち詳細の情報編集で選べるようになります。"
      />

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => setModal({ kind: 'create' })}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#06C755' }}
        >
          ＋ 項目を追加
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-3 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-40" />
              <div className="h-3 bg-gray-100 rounded w-24 ml-auto" />
            </div>
          ))}
        </div>
      ) : fields.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">項目がまだありません。「項目を追加」から作成できます。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_120px_160px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            <div>表示名</div>
            <div>キー</div>
            <div>型</div>
            <div className="text-right">操作</div>
          </div>
          {fields.map((field) => (
            <div
              key={field.id}
              className="grid grid-cols-1 sm:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_120px_160px] gap-2 sm:gap-3 px-4 py-3 border-b border-gray-100 items-center"
            >
              <div className="text-sm font-medium text-gray-800">{field.label}</div>
              <div className="text-xs text-gray-500 font-mono break-all">{field.fieldKey}</div>
              <div className="text-xs text-gray-600">
                {TYPE_LABELS[field.fieldType]}
                {field.fieldType === 'select' && field.options.length > 0 && (
                  <span className="text-gray-400">（{field.options.length}件）</span>
                )}
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'edit', field })}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'delete', field })}
                  className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg bg-white hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal.kind === 'create' || modal.kind === 'edit') && (
        <FieldEditModal
          field={modal.kind === 'edit' ? modal.field : null}
          existingKeys={fields
            .filter((f) => modal.kind !== 'edit' || f.id !== modal.field.id)
            .map((f) => f.fieldKey)}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => { setModal({ kind: 'none' }); load() }}
        />
      )}
      {modal.kind === 'delete' && (
        <FieldDeleteModal
          field={modal.field}
          onClose={() => setModal({ kind: 'none' })}
          onDeleted={() => { setModal({ kind: 'none' }); load() }}
        />
      )}
    </div>
  )
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

function FieldEditModal({
  field,
  existingKeys,
  onClose,
  onSaved,
}: {
  field: MetadataField | null
  existingKeys: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = field !== null
  const [label, setLabel] = useState(field?.label ?? '')
  const [fieldKey, setFieldKey] = useState(field?.fieldKey ?? '')
  const [fieldType, setFieldType] = useState<MetadataFieldType>(field?.fieldType ?? 'text')
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')

  const trimmedKey = fieldKey.trim()
  const trimmedLabel = label.trim()
  const keyInvalid = trimmedKey !== '' && !KEY_PATTERN.test(trimmedKey)
  const keyDuplicate = trimmedKey !== '' && existingKeys.includes(trimmedKey)
  const canSave = trimmedKey !== '' && trimmedLabel !== '' && !keyInvalid && !keyDuplicate && !busy

  const handleSave = async () => {
    if (!canSave) return
    const options = fieldType === 'select'
      ? optionsText.split('\n').map((o) => o.trim()).filter(Boolean)
      : []
    setBusy(true)
    setSaveError('')
    try {
      const payload = { fieldKey: trimmedKey, label: trimmedLabel, fieldType, options }
      const res = isEdit
        ? await api.metadataFields.update(field!.id, payload)
        : await api.metadataFields.create(payload)
      if (res.success) onSaved()
      else setSaveError(res.error || '保存に失敗しました')
    } catch (err) {
      setSaveError(err instanceof Error && err.message.includes('409')
        ? '同じキーの項目が既にあります'
        : '保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalFrame title={isEdit ? '項目を編集' : '項目を追加'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">表示名</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="会社名"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">キー（半角英数と _）</label>
          <input
            type="text"
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
            placeholder="company_name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {keyInvalid && (
            <p className="mt-1 text-xs text-red-600">英字または _ で始まる半角英数字・アンダースコアのみ使えます</p>
          )}
          {keyDuplicate && (
            <p className="mt-1 text-xs text-red-600">同じキーの項目が既にあります</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">型</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as MetadataFieldType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="text">テキスト</option>
            <option value="number">数値</option>
            <option value="date">日付</option>
            <option value="select">選択肢</option>
          </select>
        </div>
        {fieldType === 'select' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">選択肢（1行に1つ）</label>
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={4}
              placeholder={'経営者\n役員\n一般'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        )}

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </ModalFrame>
  )
}

function FieldDeleteModal({
  field,
  onClose,
  onDeleted,
}: {
  field: MetadataField
  onClose: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleDelete = async () => {
    setBusy(true)
    setDeleteError('')
    try {
      const res = await api.metadataFields.delete(field.id)
      if (res.success) onDeleted()
      else setDeleteError(res.error || '削除に失敗しました')
    } catch {
      setDeleteError('削除に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalFrame title="項目を削除" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          項目「<span className="font-semibold">{field.label}</span>」（キー: <span className="font-mono text-xs">{field.fieldKey}</span>）の定義を削除します。
        </p>
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
          この項目の定義だけを削除します。既に各友だちに登録済みの値は消えません（値は友だちごとに保持されます）。
        </p>
        {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </ModalFrame>
  )
}
