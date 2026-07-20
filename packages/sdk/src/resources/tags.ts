import type { HttpClient } from '../http.js'
import type { ApiResponse, Tag, CreateTagInput, UpdateTagInput, TagUsage } from '../types.js'

export class TagsResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<Tag[]> {
    const res = await this.http.get<ApiResponse<Tag[]>>('/api/tags')
    return res.data
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const res = await this.http.post<ApiResponse<Tag>>('/api/tags', input)
    return res.data
  }

  /** Rename a tag and/or change its color. References are by id, so logic is unaffected. */
  async update(id: string, input: UpdateTagInput): Promise<Tag> {
    const res = await this.http.patch<ApiResponse<Tag>>(`/api/tags/${id}`, input)
    return res.data
  }

  /** Everywhere the tag is referenced — check before a destructive delete. */
  async usage(id: string): Promise<TagUsage> {
    const res = await this.http.get<ApiResponse<TagUsage>>(`/api/tags/${id}/usage`)
    return res.data
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/api/tags/${id}`)
  }
}
