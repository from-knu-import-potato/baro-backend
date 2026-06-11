type SseClient = (data: string) => void

const clients = new Map<string, Set<SseClient>>()

export function addClient(storeId: string, send: SseClient) {
  if (!clients.has(storeId)) clients.set(storeId, new Set())
  clients.get(storeId)!.add(send)
}

export function removeClient(storeId: string, send: SseClient) {
  clients.get(storeId)?.delete(send)
}

export function broadcast(storeId: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  clients.get(storeId)?.forEach((send) => send(payload))
}
