"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { MapControls } from "./map-controls"
import { LayerPanel } from "./layer-panel"
import { MapHeader } from "./map-header"
import { BufferZonePanel } from "./buffer-zone-panel"
import {
  exportLayerUrl,
  getLayerGeoJSON,
  getBufferGeoJSON,
  getEnvironmentalLayers,
  getTransportationLayers,
  importCSVFile,
  listLayers,
  deleteLayer,
  compareLayers,
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
  const [isClearing, setIsClearing] = useState(false)
  const [bufferMode, setBufferMode] = useState(false)
  const [bufferRadius, setBufferRadius] = useState(500)
  const [isCreatingBuffer, setIsCreatingBuffer] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
  const [isLoadingEnvironmental, setIsLoadingEnvironmental] = useState(false)
  const [isLoadingTransportation, setIsLoadingTransportation] = useState(false)
  const [bufferZonePoints, setBufferZonePoints] = useState<any[]>([])
  const [bufferZoneCenter, setBufferZoneCenter] = useState<{ lat: number; lng: number } | null>(null)
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

  const handleClearLayers = useCallback(async () => {
    const layersToRemove = [...activeLayersRef.current]
    const dynamicLayers = Object.keys(geoJsonLayers).filter(
      (id) => id.startsWith("env_") || id.startsWith("trans_") || id.endsWith("_buffer")
    )
    
    // Check if there are any layers to clear (CSV or dynamic)
    if (!layersToRemove.length && !dynamicLayers.length) {
      toast({
        title: "No layers to clear",
        description: "There are no active layers on the map.",
        variant: "destructive",
      })
      return
    }

    setIsClearing(true)
    const failures: string[] = []

    // Delete CSV-imported layers from backend
    if (layersToRemove.length > 0) {
      await Promise.all(
        layersToRemove.map(async (layerId) => {
          try {
            await deleteLayer(layerId)
          } catch (error: any) {
            console.error(`Failed to delete layer ${layerId}`, error)
            failures.push(layerId)
          }
        }),
      )
    }

    // Clear all layers (CSV and dynamic) from the map
    updateActiveLayers(() => [])
    setGeoJsonLayers({})
    setLayerStatuses({})
    setBufferZonePoints([])
    setBufferZoneCenter(null)
    await refreshLayers()

    const totalCleared = layersToRemove.length + dynamicLayers.length

    if (failures.length) {
      toast({
        title: "Some layers could not be removed",
        description: `Failed to delete: ${failures.join(", ")}. Cleared ${totalCleared - failures.length} layer${totalCleared - failures.length === 1 ? "" : "s"}.`,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Layers cleared",
        description: `Cleared ${totalCleared} layer${totalCleared === 1 ? "" : "s"} (${layersToRemove.length} CSV, ${dynamicLayers.length} dynamic).`,
      })
    }

    setIsClearing(false)
  }, [refreshLayers, toast, updateActiveLayers, geoJsonLayers])

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (!bufferMode || !activeLayers.length || isCreatingBuffer) return

      const selectedLayer = activeLayers[0]
      setIsCreatingBuffer(true)

      try {
        const bufferData = await getBufferGeoJSON(selectedLayer, lng, lat, bufferRadius)
        const color = layerColorMap[selectedLayer] ?? NEON_COLORS[0]
        const decorated: GeoJsonFeatureCollection = {
          ...bufferData,
          features: (bufferData?.features ?? []).map((feature) => ({
            ...feature,
            properties: {
              ...(feature?.properties ?? {}),
              _layerId: `${selectedLayer}_buffer`,
              _layerColor: color,
            },
          })),
        }

        setGeoJsonLayers((prev) => ({
          ...prev,
          [`${selectedLayer}_buffer`]: decorated,
        }))

        // Extract points (exclude the buffer circle polygon)
        const points = bufferData.features
          .filter((f: any) => f.properties?._kind !== "buffer")
          .map((f: any) => ({
            id: f.properties?.id || f.properties?.name || `point-${f.properties?.distance_m || Math.random()}`,
            name: f.properties?.name || `Point ${f.properties?.id || ""}`,
            distance_m: f.properties?.distance_m,
            ...f.properties,
            geometry: f.geometry,
          }))

        setBufferZonePoints(points)
        setBufferZoneCenter({ lat, lng })

        toast({
          title: "Buffer zone created",
          description: `Found ${points.length} point${points.length === 1 ? "" : "s"} within ${bufferRadius}m radius.`,
        })
      } catch (error: any) {
        console.error("Failed to create buffer", error)
        toast({
          title: "Buffer creation failed",
          description: error?.message ?? "Unable to create buffer zone.",
          variant: "destructive",
        })
      } finally {
        setIsCreatingBuffer(false)
      }
    },
    [bufferMode, activeLayers, bufferRadius, layerColorMap, toast],
  )

  const handleCompareLayers = useCallback(async () => {
    if (activeLayers.length < 2) {
      toast({
        title: "Need two layers",
        description: "Please activate at least two layers to compare.",
        variant: "destructive",
      })
      return
    }

    setIsComparing(true)
    try {
      const result = await compareLayers(activeLayers[0], activeLayers[1], 200)
      toast({
        title: "Layer comparison complete",
        description: `Found ${result.pairs.length} point pairs within 200m of each other.`,
      })
    } catch (error: any) {
      console.error("Failed to compare layers", error)
      toast({
        title: "Comparison failed",
        description: error?.message ?? "Unable to compare layers.",
        variant: "destructive",
      })
    } finally {
      setIsComparing(false)
    }
  }, [activeLayers, toast])

  const handleLoadEnvironmentalLayer = useCallback(
    async (type: "air_quality" | "weather") => {
      if (!mapInstance) {
        toast({
          title: "Map not ready",
          description: "Please wait for the map to load.",
          variant: "destructive",
        })
        return
      }

      setIsLoadingEnvironmental(true)
      try {
        const center = mapInstance.getCenter()
        const data = await getEnvironmentalLayers(type, center.lat, center.lng, 5000)
        const layerId = `env_${type}_${Date.now()}`
        const color = type === "air_quality" ? "#FF006E" : "#3A86FF"
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
        toast({
          title: `${type === "air_quality" ? "Air Quality" : "Weather"} data loaded`,
          description: `Found ${data.features.length} ${type === "air_quality" ? "stations" : "stations"} in the area.`,
        })
      } catch (error: any) {
        console.error("Failed to load environmental layer", error)
        toast({
          title: "Failed to load data",
          description: error?.message ?? "Unable to fetch environmental data.",
          variant: "destructive",
        })
      } finally {
        setIsLoadingEnvironmental(false)
      }
    },
    [mapInstance, toast],
  )

  const handleLoadTransportationLayer = useCallback(
    async (type: "transit" | "stations") => {
      if (!mapInstance) {
        toast({
          title: "Map not ready",
          description: "Please wait for the map to load.",
          variant: "destructive",
        })
        return
      }

      setIsLoadingTransportation(true)
      try {
        const center = mapInstance.getCenter()
        const data = await getTransportationLayers(type, center.lat, center.lng, 5000)
        const layerId = `trans_${type}_${Date.now()}`
        const color = "#00F5D4"
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
        toast({
          title: `${type === "transit" ? "Transit" : "Station"} data loaded`,
          description: `Found ${data.features.length} ${type === "transit" ? "stops" : "stations"} in the area.`,
        })
      } catch (error: any) {
        console.error("Failed to load transportation layer", error)
        toast({
          title: "Failed to load data",
          description: error?.message ?? "Unable to fetch transportation data.",
          variant: "destructive",
        })
      } finally {
        setIsLoadingTransportation(false)
      }
    },
    [mapInstance, toast],
  )

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
        onMapClick={handleMapClick}
        bufferMode={bufferMode}
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
        onCompareLayers={handleCompareLayers}
        onToggleBufferMode={() => {
          const newBufferMode = !bufferMode
          setBufferMode(newBufferMode)
          if (!newBufferMode) {
            // Clear buffer zone data and remove buffer zone layers when disabling buffer mode
            setBufferZonePoints([])
            setBufferZoneCenter(null)
            // Remove all buffer zone layers from the map
            setGeoJsonLayers((prev) => {
              const next = { ...prev }
              Object.keys(next).forEach((key) => {
                if (key.endsWith("_buffer")) {
                  delete next[key]
                }
              })
              return next
            })
          }
        }}
        onLoadEnvironmentalLayer={handleLoadEnvironmentalLayer}
        onLoadTransportationLayer={handleLoadTransportationLayer}
        bufferMode={bufferMode}
        bufferRadius={bufferRadius}
        onBufferRadiusChange={setBufferRadius}
        isImporting={isImporting}
        activeLayerCount={activeLayers.length + Object.keys(geoJsonLayers).filter(
          (id) => id.startsWith("env_") || id.startsWith("trans_") || id.endsWith("_buffer")
        ).length}
        isClearing={isClearing}
        isComparing={isComparing}
        isCreatingBuffer={isCreatingBuffer}
        isLoadingEnvironmental={isLoadingEnvironmental}
        isLoadingTransportation={isLoadingTransportation}
        currentLat={coordinates.lat}
        currentLng={coordinates.lng}
      />

      {bufferZonePoints.length > 0 && bufferZoneCenter && (
        <BufferZonePanel
          points={bufferZonePoints}
          radius={bufferRadius}
          onClose={() => {
            setBufferZonePoints([])
            setBufferZoneCenter(null)
          }}
          onFlyTo={handleFlyTo}
        />
      )}
    </div>
  )
}
