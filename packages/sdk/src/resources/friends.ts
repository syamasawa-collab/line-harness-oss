import type { HttpClient } from '../http.js'
import type { ApiResponse, PaginatedData, Friend, FriendListParams, MessageType } from '../types.js'

export class FriendsResource {
  constructor(
    private readonly http: HttpClient,
    private readonly defaultAccountId?: string,
  ) {}

  async list(params?: FriendListParams): Promise<PaginatedData<Friend>> {
    const query = new URLSearchParams()
    if (params?.limit !== undefined) query.set('limit', String(params.limit))
    if (params?.offset !== undefined) query.set('offset', String(params.offset))
    if (params?.tagId) query.set('tagId', params.tagId)
    if (params?.search) query.set('search', params.search)
    if (params?.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        query.set(`metadata.${key}`, String(value))
      }
    }
    const accountId = params?.accountId ?? this.defaultAccountId
    if (accountId) query.set('lineAccountId', accountId)
    const qs = query.toString()
    const path = qs ? `/api/friends?${qs}` : '/api/friends'
    const res = await this.http.get<ApiResponse<PaginatedData<Friend>>>(path)
    return res.data
  }

  async get(id: string): Promise<Friend> {
    const res = await this.http.get<ApiResponse<Friend>>(`/api/friends/${id}`)
    return res.data
  }

  async count(): Promise<number> {
    const res = await this.http.get<ApiResponse<{ count: number }>>('/api/friends/count')
    return res.data.count
  }

  async addTag(friendId: string, tagId: string): Promise<void> {
    await this.http.post(`/api/friends/${friendId}/tags`, { tagId })
  }

  async removeTag(friendId: string, tagId: string): Promise<void> {
    await this.http.delete(`/api/friends/${friendId}/tags/${tagId}`)
  }

  async sendMessage(friendId: string, content: string, messageType: MessageType = 'text', altText?: string): Promise<{ messageId: string }> {
    const res = await this.http.post<ApiResponse<{ messageId: string }>>(`/api/friends/${friendId}/messages`, {
      messageType,
      content,
      ...(altText ? { altText } : {}),
    })
    return res.data
  }

  /**
   * Update friend metadata. Default is a shallow merge; pass
   * `{ replace: true }` to replace the whole object — the only way to
   * delete a key (merging stores a null value instead of removing it).
   */
  async setMetadata(
    friendId: string,
    fields: Record<string, unknown>,
    opts?: { replace?: boolean },
  ): Promise<Friend> {
    const path = `/api/friends/${friendId}/metadata${opts?.replace ? '?replace=true' : ''}`
    const res = await this.http.put<ApiResponse<Friend>>(path, fields)
    return res.data
  }

  async setRichMenu(friendId: string, richMenuId: string): Promise<void> {
    await this.http.post(`/api/friends/${friendId}/rich-menu`, { richMenuId })
  }

  async removeRichMenu(friendId: string): Promise<void> {
    await this.http.delete(`/api/friends/${friendId}/rich-menu`)
  }
}
