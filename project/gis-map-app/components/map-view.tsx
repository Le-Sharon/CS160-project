"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { MapControls } from "./map-controls"
import { LayerPanel } from "./layer-panel"
import { MapHeader } from "./map-header"
import {
  exportLayerUrl,
  getLayerGeoJSON,
  importCSVFile,
  listLayers,
  type GeoJsonFeatureCollection,
  type LayerSummary,
} from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

const MapContainer = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="text-muted-foreground">Loading map...</div>
    </div>
  ),
})

type LayerStatus = "idle" | "loading" | "error"
const NEON_COLORS = [
  "#FB5607",
  "#FF006E",
  "#8338EC",
  "#3A86FF",
  "#00F5D4",
  "#F15BB5",
  "#FEE440",
  "#4CC9F0",
  "#8AFF80",
  "#FFBE0B",
] as const

export default function MapView() {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [coordinates, setCoordinates] = useState({ lng: -98.5795, lat: 39.8283, zoom: 4 })
  const [activeLayers, setActiveLayers] = useState<string[]>([])
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [layerSummaries, setLayerSummaries] = useState<LayerSummary[]>([])
  const [isLoadingLayers, setIsLoadingLayers] = useState(false)
  const [layerStatuses, setLayerStatuses] = useState<Record<string, LayerStatus>>({})
  const [geoJsonLayers, setGeoJsonLayers] = useState<Record<string, GeoJsonFeatureCollection>>({})
  const [isImporting, setIsImporting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const activeLayersRef = useRef<string[]>([])
  const { toast } = useToast()

  const refreshLayers = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoadingLayers(true)

    try {
      const layers = await listLayers(controller.signal)
      setLayerSummaries(layers)
      setLayerStatuses((prev) => {
        const next: Record<string, LayerStatus> = {}
        layers.forEach((layer) => {
          next[layer.id] = prev[layer.id] ?? "idle"
        })
        return next
      })
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error("Failed to load layers", error)
        toast({
          title: "Unable to fetch layers",
          description: error?.message ?? "Unknown error loading available layers.",
          variant: "destructive",
        })
      }
    } finally {
      setIsLoadingLayers(false)
    }
  }, [toast])

  useEffect(() => {
    refreshLayers()
    return () => {
      abortRef.current?.abort()
    }
  }, [refreshLayers])

  const updateActiveLayers = useCallback((updater: (prev: string[]) => string[]) => {
    setActiveLayers((prev) => {
      const next = updater(prev)
      activeLayersRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    activeLayersRef.current = activeLayers
  }, [activeLayers])

  const layerColorMap = useMemo(() => {
    const colors: Record<string, string> = {}
    const hashId = (value: string) => {
      let hash = 0
      for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i)
        hash |= 0
      }
      return Math.abs(hash)
    }
    layerSummaries.forEach((layer) => {
      const hash = hashId(layer.id)
      colors[layer.id] = NEON_COLORS[hash % NEON_COLORS.length]
    })
    return colors
  }, [layerSummaries])

  useEffect(() => {
    setGeoJsonLayers((prev) => {
      const updated: Record<string, GeoJsonFeatureCollection> = {}
      for (const [layerId, collection] of Object.entries(prev)) {
        const color = layerColorMap[layerId] ?? NEON_COLORS[0]
        const features = (collection?.features ?? []).map((feature) => ({
          ...feature,
          properties: {
            ...(feature?.properties ?? {}),
            _layerId: layerId,
            _layerColor: color,
          },
        }))
        updated[layerId] = {
          ...collection,
          features,
        }
      }
      return updated
    })
  }, [layerColorMap])

  const fetchLayerGeoJson = useCallback(
    async (layerId: string) => {
      setLayerStatuses((prev) => ({ ...prev, [layerId]: "loading" }))
      try {
        const data = await getLayerGeoJSON(layerId)
        if (!activeLayersRef.current.includes(layerId)) {
          setLayerStatuses((prev) => ({ ...prev, [layerId]: "idle" }))
          return
        }
        const color = layerColorMap[layerId] ?? NEON_COLORS[0]
        const decorated: GeoJsonFeatureCollection = {
          ...data,
          features: (data?.features ?? []).map((feature) => ({
            ...feature,
            properties: {
              ...(feature?.properties ?? {}),
              _layerId: layerId,
              _layerColor: color,
            },
          })),
        }
        setGeoJsonLayers((prev) => ({ ...prev, [layerId]: decorated }))
        setLayerStatuses((prev) => ({ ...prev, [layerId]: "idle" }))
      } catch (error: any) {
        console.error(`Failed to fetch layer ${layerId}`, error)
        setLayerStatuses((prev) => ({ ...prev, [layerId]: "error" }))
        toast({
          title: "Layer load failed",
          description: error?.message ?? "Unable to fetch layer data.",
          variant: "destructive",
        })
      }
    },
    [layerColorMap, toast],
  )

  const handleLayerToggle = (layerId: string) => {
    updateActiveLayers((prev) => {
      const isActive = prev.includes(layerId)
      if (isActive) {
        setGeoJsonLayers((existing) => {
          const next = { ...existing }
          delete next[layerId]
          return next
        })
        setLayerStatuses((prevStatuses) => ({ ...prevStatuses, [layerId]: "idle" }))
        return prev.filter((id) => id !== layerId)
      }

      fetchLayerGeoJson(layerId)
      return [...prev, layerId]
    })
  }

  const combinedGeoJson = useMemo(() => {
    const features = Object.values(geoJsonLayers)
      .flatMap((layer) => (Array.isArray(layer?.features) ? layer.features : []))
      .filter(Boolean)

    if (!features.length) {
      return null
    }

    return {
      type: "FeatureCollection",
      features,
    } satisfies GeoJsonFeatureCollection
  }, [geoJsonLayers])

  const handleFlyTo = (lng: number, lat: number, zoom = 12) => {
    if (mapInstance) {
      mapInstance.flyTo([lat, lng], zoom, {
        duration: 2,
      })
    }
  }

  const handleImportCsv = async (file: File) => {
    setIsImporting(true)
    try {
      const result = await importCSVFile(file)
      toast({
        title: "Import successful",
        description: `Layer ${result.layer} imported with ${result.rows} rows.`,
      })
      await refreshLayers()
      updateActiveLayers((prev) => {
        if (prev.includes(result.layer)) {
          return prev
        }
        return [...prev, result.layer]
      })
      await fetchLayerGeoJson(result.layer)
    } catch (error: any) {
      console.error("Import failed", error)
      toast({
        title: "Import failed",
        description: error?.message ?? "Unable to import the CSV file.",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleExportActiveLayer = () => {
    if (!activeLayers.length) {
      toast({
        title: "No active layer",
        description: "Select a layer before exporting.",
        variant: "destructive",
      })
      return
    }
    const url = exportLayerUrl(activeLayers[0])
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleClearLayers = () => {
    updateActiveLayers(() => [])
    setGeoJsonLayers({})
    setLayerStatuses({})
  }

  return (
    <div className="relative h-full w-full">
      <MapHeader coordinates={coordinates} />

      <MapContainer
        onMapReady={useCallback((map: any) => {
          setMapInstance(map)
          setMapLoaded(true)
        }, [])}
        onMove={useCallback((coords: { lng: number; lat: number; zoom: number }) => {
          setCoordinates(coords)
        }, [])}
        geoJson={combinedGeoJson}
        fitToBounds={true}
      />

      <LayerPanel
        activeLayers={activeLayers}
        layers={layerSummaries}
        layerStatuses={layerStatuses}
        onLayerToggle={handleLayerToggle}
        mapLoaded={mapLoaded}
        loadingLayers={isLoadingLayers}
        onRefreshLayers={refreshLayers}
        layerColors={layerColorMap}
      />

      <MapControls
        onFlyTo={handleFlyTo}
        mapLoaded={mapLoaded}
        onImportCSV={handleImportCsv}
        onExportLayer={handleExportActiveLayer}
        onClearLayers={handleClearLayers}
        isImporting={isImporting}
        activeLayerCount={activeLayers.length}
      />
    </div>
  )
}
