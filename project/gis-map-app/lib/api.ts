const DEFAULT_API_BASE = "http://localhost:5000"

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "")

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("Content-Type") || ""
  const isJSON = contentType.includes("application/json")

  if (!response.ok) {
    const message = isJSON ? await response.json().catch(() => null) : null
    const errorMsg =
      (message && typeof message === "object" && "error" in message ? (message as any).error : null) ||
      response.statusText ||
      "Request failed"
    throw new Error(errorMsg)
  }

  if (!isJSON) {
    throw new Error("Unexpected response format")
  }

  return (await response.json()) as T
}

export interface LayerSummary {
  id: string
  name: string
  rows: number
  columns: string[]
}

export interface ImportResult {
  layer: string
  rows: number
  columns: string[]
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection"
  features: any[]
}

export async function listLayers(signal?: AbortSignal): Promise<LayerSummary[]> {
  const response = await fetch(`${API_BASE_URL}/layers`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  })

  const data = await handleResponse<{ layers: LayerSummary[] }>(response)
  return data.layers ?? []
}

export async function importCSVFile(file: File, layerName?: string): Promise<ImportResult> {
  const formData = new FormData()
  formData.append("file", file)
  if (layerName) {
    formData.append("layer", layerName)
  }

  const response = await fetch(`${API_BASE_URL}/importCSV`, {
    method: "POST",
    body: formData,
  })

  return handleResponse<ImportResult>(response)
}

export async function getLayerGeoJSON(
  layerId: string,
  options?: { bbox?: string; limit?: number },
  signal?: AbortSignal,
): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams()
  params.set("layer", layerId)

  if (options?.bbox) {
    params.set("bbox", options.bbox)
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit))
  }

  const response = await fetch(`${API_BASE_URL}/getLayer?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  })

  return handleResponse<GeoJsonFeatureCollection>(response)
}

export function exportLayerUrl(layerId: string): string {
  const params = new URLSearchParams()
  params.set("layer", layerId)
  return `${API_BASE_URL}/exportCSV?${params.toString()}`
}

export async function getBufferGeoJSON(
  layerId: string,
  lon: number,
  lat: number,
  radius_m: number,
  limit = 200,
): Promise<GeoJsonFeatureCollection> {
  const response = await fetch(`${API_BASE_URL}/getBuffer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      layer: layerId,
      lon,
      lat,
      radius_m,
      limit,
    }),
  })

  return handleResponse<GeoJsonFeatureCollection>(response)
}

