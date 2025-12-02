const DEFAULT_API_BASE = "http://localhost:5000"

function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/$/, "")
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location
    const defaultPort = protocol === "https:" ? 443 : 5000
    return `${protocol}//${hostname}:${defaultPort}`
  }

  return DEFAULT_API_BASE
}

const API_BASE_URL = resolveApiBase()

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

export interface DeleteLayerResponse {
  layer: string
  deleted: boolean
}

export interface CompareLayersRequest {
  layerA: string
  layerB: string
  distance_m?: number
}

export interface CompareLayersResponse {
  pairs: Array<{
    idA: number
    idB: number
    distance_m: number
  }>
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

export async function deleteLayer(layerId: string): Promise<DeleteLayerResponse> {
  const response = await fetch(`${API_BASE_URL}/deleteLayer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ layer: layerId }),
  })

  return handleResponse<DeleteLayerResponse>(response)
}

export async function compareLayers(
  layerA: string,
  layerB: string,
  distance_m = 200,
): Promise<CompareLayersResponse> {
  const response = await fetch(`${API_BASE_URL}/compareLayers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      layerA,
      layerB,
      distance_m,
    }),
  })

  return handleResponse<CompareLayersResponse>(response)
}

export async function getEnvironmentalLayers(
  type: "air_quality" | "weather",
  lat: number,
  lon: number,
  radius_m = 5000,
): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams()
  params.set("type", type)
  params.set("lat", String(lat))
  params.set("lon", String(lon))
  params.set("radius_m", String(radius_m))

  const response = await fetch(`${API_BASE_URL}/getEnvironmentalLayers?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })

  return handleResponse<GeoJsonFeatureCollection>(response)
}

export async function getTransportationLayers(
  type: "transit" | "stations",
  lat: number,
  lon: number,
  radius_m = 5000,
): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams()
  params.set("type", type)
  params.set("lat", String(lat))
  params.set("lon", String(lon))
  params.set("radius_m", String(radius_m))

  const response = await fetch(`${API_BASE_URL}/getTransportationLayers?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })

  return handleResponse<GeoJsonFeatureCollection>(response)
}

