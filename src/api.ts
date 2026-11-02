export type Account = { id: string; name: string; handle: string; createdAt: number }
export type Friend = Account & { nudgedAt: number | null }
export type ChatMessage = { id: string; from: string; text: string; time: number }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const result = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new ApiError(result.error || 'İstek tamamlanamadı.', response.status)
  return result
}

export const jsonPost = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })
