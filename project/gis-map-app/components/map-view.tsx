"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { MapControls } from "./map-controls"
import { LayerPanel } from "./layer-panel"
import { MapHeader } from "./map-header"
import { BufferZonePanel } from "./buffer-zone-panel"
import { ComparisonPanel } from "./comparison-panel"
import {
  exportLayerUrl,
  exportMergedLayersUrl,
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
  "#FB5607", // Orange Red
  "#FF006E", // Hot Pink
  "#8338EC", // Purple
  "#3A86FF", // Blue
  "#00F5D4", // Cyan
  "#F15BB5", // Pink
  "#FEE440", // Yellow
  "#4CC9F0", // Sky Blue
  "#8AFF80", // Green
  "#FFBE0B", // Gold
  "#FF6B35", // Orange
  "#06FFA5", // Mint Green
  "#A8E6CF", // Light Green
  "#FFD93D", // Bright Yellow
  "#6BCF7F", // Emerald
  "#4ECDC4", // Turquoise
  "#45B7D1", // Light Blue
  "#96CEB4", // Sea Green
  "#FFEAA7", // Pale Yellow
  "#DDA0DD", // Plum
  "#98D8C8", // Aqua
  "#F7DC6F", // Light Yellow
  "#BB8FCE", // Lavender
  "#85C1E2", // Powder Blue
  "#F8B739", // Amber
] as const

export default function MapView() {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [coordinates, setCoordinates] = useState({ lng: -98.5795, lat: 39.8283, zoom: 4 })
  const [activeLayers, setActiveLayers] = useState<string[]>([])
  const [mapInstance, setMapInstance] = useState<any>(null)
  const mapInstanceRef = useRef<any>(null)
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
  const [comparisonMode, setComparisonMode] = useState(false)
  const [comparisonPairs, setComparisonPairs] = useState<Array<{
    idA: number
    idB: number
    distance_m: number
    pointA?: any
    pointB?: any
  }>>([])
  const [comparisonLayerA, setComparisonLayerA] = useState<string>("")
  const [comparisonLayerB, setComparisonLayerB] = useState<string>("")
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

  // Shared hash function to ensure consistent color calculation
  const hashId = useCallback((value: string) => {
    let hash = 0
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash)
  }, [])

  const layerColorMap = useMemo(() => {
    const colors: Record<string, string> = {}
    layerSummaries.forEach((layer) => {
      const hash = hashId(layer.id)
      colors[layer.id] = NEON_COLORS[hash % NEON_COLORS.length]
    })
    return colors
  }, [layerSummaries, hashId])

  useEffect(() => {
    setGeoJsonLayers((prev) => {
      const updated: Record<string, GeoJsonFeatureCollection> = {}
      for (const [layerId, collection] of Object.entries(prev)) {
        // Use the same color calculation logic to ensure consistency
        const color = layerColorMap[layerId] ?? NEON_COLORS[hashId(layerId) % NEON_COLORS.length]
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
  }, [layerColorMap, hashId])

  const fetchLayerGeoJson = useCallback(
    async (layerId: string) => {
      setLayerStatuses((prev) => ({ ...prev, [layerId]: "loading" }))
      try {
        const data = await getLayerGeoJSON(layerId)
        if (!activeLayersRef.current.includes(layerId)) {
          setLayerStatuses((prev) => ({ ...prev, [layerId]: "idle" }))
          return
        }
        // Get color - use layerColorMap if available, otherwise calculate it consistently using shared hash function
        const color = layerColorMap[layerId] ?? NEON_COLORS[hashId(layerId) % NEON_COLORS.length]
        
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
    [layerColorMap, hashId, toast],
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

  const handleFlyTo = useCallback((lng: number, lat: number, zoom = 12) => {
    const map = mapInstanceRef.current || mapInstance
    if (map) {
      map.flyTo([lat, lng], zoom, {
        duration: 2,
      })
    } else {
      console.warn("Map instance not available for flyTo")
    }
  }, [mapInstance])

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
    // Get all CSV layers from layerSummaries (exclude environmental/transportation layers)
    const csvLayers = layerSummaries
      .filter((layer) => layer.id && typeof layer.id === "string")
      .filter((layer) => !layer.id.startsWith("env_") && !layer.id.startsWith("trans_"))
      .map((layer) => layer.id)

    if (csvLayers.length === 0) {
      toast({
        title: "No CSV layers to export",
        description: "Import at least one CSV layer before exporting.",
        variant: "destructive",
      })
      return
    }

    // Export all CSV layers merged together
    const url = exportMergedLayersUrl(csvLayers)
    window.open(url, "_blank", "noopener,noreferrer")
    
    toast({
      title: "Export started",
      description: `Exporting ${csvLayers.length} layer${csvLayers.length === 1 ? "" : "s"} merged into one CSV file.`,
    })
  }

  const handleClearLayers = useCallback(async () => {
    // Get all CSV layer IDs from layerSummaries (exclude environmental/transportation layers)
    const allCsvLayers = layerSummaries
      .filter((layer) => layer.id && typeof layer.id === "string")
      .filter((layer) => !layer.id.startsWith("env_") && !layer.id.startsWith("trans_"))
      .map((layer) => layer.id)
    
    // CSV layers that are toggled OFF (in layerSummaries but NOT in activeLayers)
    const toggledOffCsvLayers = allCsvLayers.filter((layerId) => !activeLayersRef.current.includes(layerId))
    
    // Environmental and Transportation layers that are toggled ON (in geoJsonLayers)
    const toggledOnDynamicLayers = Object.keys(geoJsonLayers).filter(
      (id) => id.startsWith("env_") || id.startsWith("trans_")
    )
    
    // Check if there are any layers to clear
    if (!toggledOffCsvLayers.length && !toggledOnDynamicLayers.length) {
      toast({
        title: "No layers to clear",
        description: "There are no toggled-off CSV layers or toggled-on Environmental/Transportation layers to clear.",
        variant: "destructive",
      })
      return
    }

    setIsClearing(true)
    const failures: string[] = []

    // Delete toggled-off CSV layers from backend
    if (toggledOffCsvLayers.length > 0) {
      await Promise.all(
        toggledOffCsvLayers.map(async (layerId) => {
          try {
            await deleteLayer(layerId)
          } catch (error: any) {
            console.error(`Failed to delete layer ${layerId}`, error)
            failures.push(layerId)
          }
        }),
      )
    }

    // Remove toggled-on Environmental/Transportation layers from the map
    if (toggledOnDynamicLayers.length > 0) {
      setGeoJsonLayers((prev) => {
        const next = { ...prev }
        toggledOnDynamicLayers.forEach((layerId) => {
          delete next[layerId]
        })
        return next
      })
      
      // Also remove their statuses
      setLayerStatuses((prev) => {
        const next = { ...prev }
        toggledOnDynamicLayers.forEach((layerId) => {
          delete next[layerId]
        })
        return next
      })
    }

    await refreshLayers()

    const totalCleared = toggledOffCsvLayers.length + toggledOnDynamicLayers.length

    if (failures.length) {
      toast({
        title: "Some layers could not be removed",
        description: `Failed to delete: ${failures.join(", ")}. Cleared ${totalCleared - failures.length} layer${totalCleared - failures.length === 1 ? "" : "s"}.`,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Layers cleared",
        description: `Cleared ${totalCleared} layer${totalCleared === 1 ? "" : "s"} (${toggledOffCsvLayers.length} toggled-off CSV, ${toggledOnDynamicLayers.length} toggled-on Environmental/Transportation).`,
      })
    }

    setIsClearing(false)
  }, [refreshLayers, toast, layerSummaries, geoJsonLayers])

  // Helper function to calculate haversine distance in meters
  const haversineDistance = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
    const R = 6371000.0 // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // Helper function to create a circle polygon
  const createCirclePolygon = (lon: number, lat: number, radius_m: number, steps = 64): any => {
    const R = 6371000.0
    const lat0 = (lat * Math.PI) / 180
    const lon0 = (lon * Math.PI) / 180
    const angDist = radius_m / R
    const coords: number[][] = []

    for (let i = 0; i <= steps; i++) {
      const brg = (2 * Math.PI * i) / steps
      const latp = Math.asin(
        Math.sin(lat0) * Math.cos(angDist) + Math.cos(lat0) * Math.sin(angDist) * Math.cos(brg),
      )
      const lonp =
        lon0 +
        Math.atan2(
          Math.sin(brg) * Math.sin(angDist) * Math.cos(lat0),
          Math.cos(angDist) - Math.sin(lat0) * Math.sin(latp),
        )
      coords.push([(lonp * 180) / Math.PI, (latp * 180) / Math.PI])
    }

    return {
      type: "Polygon",
      coordinates: [coords],
    }
  }

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (!bufferMode || isCreatingBuffer) return

      // Find available layers (CSV layers from activeLayers, or frontend-only layers from geoJsonLayers)
      const availableLayers: string[] = []
      
      // Add CSV layers from activeLayers
      availableLayers.push(...activeLayers)
      
      // Add frontend-only layers (env_ and trans_) from geoJsonLayers
      Object.keys(geoJsonLayers).forEach((layerId) => {
        if ((layerId.startsWith("env_") || layerId.startsWith("trans_")) && !availableLayers.includes(layerId)) {
          availableLayers.push(layerId)
        }
      })

      if (!availableLayers.length) {
        toast({
          title: "No layer available",
          description: "Please load or activate at least one layer to create a buffer zone.",
          variant: "destructive",
        })
        return
      }

      const selectedLayer = availableLayers[0]
      setIsCreatingBuffer(true)

      try {
        let bufferData: GeoJsonFeatureCollection

        // Check if it's a frontend-only layer (env_ or trans_)
        if (selectedLayer.startsWith("env_") || selectedLayer.startsWith("trans_")) {
          // Calculate buffer zone on frontend
          const layerData = geoJsonLayers[selectedLayer]
          if (!layerData || !layerData.features) {
            throw new Error("Layer data not found")
          }

          const pointsWithinRadius: any[] = []
          layerData.features.forEach((feature: any) => {
            if (feature.geometry?.type === "Point" && feature.geometry.coordinates) {
              const [featureLon, featureLat] = feature.geometry.coordinates
              const distance = haversineDistance(lng, lat, featureLon, featureLat)
              if (distance <= bufferRadius) {
                pointsWithinRadius.push({
                  ...feature,
                  properties: {
                    ...feature.properties,
                    distance_m: distance,
                  },
                })
              }
            }
          })

          // Sort by distance
          pointsWithinRadius.sort((a, b) => (a.properties.distance_m || 0) - (b.properties.distance_m || 0))

          // Create buffer circle polygon
          const circlePolygon = createCirclePolygon(lng, lat, bufferRadius)

          bufferData = {
            type: "FeatureCollection",
            features: [
              ...pointsWithinRadius,
              {
                type: "Feature",
                geometry: circlePolygon,
                properties: {
                  _kind: "buffer",
                  radius_m: bufferRadius,
                },
              },
            ],
          }
        } else {
          // Use backend API for CSV-imported layers
          bufferData = await getBufferGeoJSON(selectedLayer, lng, lat, bufferRadius)
        }

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
    [bufferMode, activeLayers, bufferRadius, layerColorMap, toast, geoJsonLayers],
  )

  const handleCompareLayers = useCallback(async () => {
    // Get available layers (CSV from activeLayers, or frontend-only from geoJsonLayers)
    const availableLayers: string[] = []
    availableLayers.push(...activeLayers)
    Object.keys(geoJsonLayers).forEach((layerId) => {
      if ((layerId.startsWith("env_") || layerId.startsWith("trans_")) && !availableLayers.includes(layerId)) {
        availableLayers.push(layerId)
      }
    })

    if (availableLayers.length < 2) {
      toast({
        title: "Need two layers",
        description: "Please activate or load at least two layers to compare.",
        variant: "destructive",
      })
      return
    }

    const layerA = availableLayers[0]
    const layerB = availableLayers[1]

    // Toggle comparison mode if already active
    if (comparisonMode && comparisonLayerA === layerA && comparisonLayerB === layerB) {
      setComparisonMode(false)
      setComparisonPairs([])
      setComparisonLayerA("")
      setComparisonLayerB("")
      // Remove comparison markers
      setGeoJsonLayers((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((key) => {
          if (key.startsWith("comparison_")) {
            delete next[key]
          }
        })
        return next
      })
      return
    }

    setIsComparing(true)
    try {
      let result: { pairs: Array<{ idA: number; idB: number; distance_m: number }> }
      
      // Check if both layers are frontend-only or if we need backend comparison
      const layerAIsFrontend = layerA.startsWith("env_") || layerA.startsWith("trans_")
      const layerBIsFrontend = layerB.startsWith("env_") || layerB.startsWith("trans_")
      
      if (layerAIsFrontend || layerBIsFrontend) {
        // Frontend comparison
        const layerAData = geoJsonLayers[layerA]
        const layerBData = geoJsonLayers[layerB]
        
        if (!layerAData || !layerBData) {
          throw new Error("Layer data not found")
        }

        const pairs: Array<{ idA: number; idB: number; distance_m: number }> = []
        
        layerAData.features?.forEach((featureA: any, indexA: number) => {
          if (featureA.geometry?.type === "Point" && featureA.geometry.coordinates) {
            const [lonA, latA] = featureA.geometry.coordinates
            const idA = featureA.properties?.id ?? indexA + 1
            
            layerBData.features?.forEach((featureB: any, indexB: number) => {
              if (featureB.geometry?.type === "Point" && featureB.geometry.coordinates) {
                const [lonB, latB] = featureB.geometry.coordinates
                const idB = featureB.properties?.id ?? indexB + 1
                const distance = haversineDistance(lonA, latA, lonB, latB)
                
                if (distance <= 200) {
                  pairs.push({ idA: Number(idA), idB: Number(idB), distance_m: distance })
                }
              }
            })
          }
        })
        
        result = { pairs }
      } else {
        // Backend comparison for CSV layers
        result = await compareLayers(layerA, layerB, 200)
      }
      
      // Fetch full point data for both layers
      let layerAData = geoJsonLayers[layerA]
      let layerBData = geoJsonLayers[layerB]
      
      if (!layerAData && !layerAIsFrontend) {
        layerAData = await getLayerGeoJSON(layerA)
      }
      if (!layerBData && !layerBIsFrontend) {
        layerBData = await getLayerGeoJSON(layerB)
      }

      if (!layerAData || !layerBData) {
        throw new Error("Layer data not found")
      }

      // Create a map of id -> feature for quick lookup
      const layerAMap = new Map<number, any>()
      const layerBMap = new Map<number, any>()

      layerAData.features?.forEach((feature: any) => {
        const id = feature.properties?.id
        if (id !== undefined) {
          layerAMap.set(Number(id), feature)
        }
      })

      layerBData.features?.forEach((feature: any) => {
        const id = feature.properties?.id
        if (id !== undefined) {
          layerBMap.set(Number(id), feature)
        }
      })

      // Enrich pairs with full point data
      const enrichedPairs = result.pairs.map((pair) => ({
        ...pair,
        pointA: layerAMap.get(pair.idA),
        pointB: layerBMap.get(pair.idB),
      }))

      // Create comparison markers (red dashed squares)
      const comparisonFeatures: any[] = []
      enrichedPairs.forEach((pair) => {
        if (pair.pointA?.geometry?.type === "Point") {
          const [lon, lat] = pair.pointA.geometry.coordinates
          // Create a square around the point
          const size = 0.0005 // Approximate size in degrees
          const square = {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[
                [lon - size, lat - size],
                [lon + size, lat - size],
                [lon + size, lat + size],
                [lon - size, lat + size],
                [lon - size, lat - size],
              ]],
            },
            properties: {
              _kind: "comparison",
              _pairIndex: enrichedPairs.indexOf(pair),
              _layer: "A",
              _id: pair.idA,
            },
          }
          comparisonFeatures.push(square)
        }
        if (pair.pointB?.geometry?.type === "Point") {
          const [lon, lat] = pair.pointB.geometry.coordinates
          const size = 0.0005
          const square = {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[
                [lon - size, lat - size],
                [lon + size, lat - size],
                [lon + size, lat + size],
                [lon - size, lat + size],
                [lon - size, lat - size],
              ]],
            },
            properties: {
              _kind: "comparison",
              _pairIndex: enrichedPairs.indexOf(pair),
              _layer: "B",
              _id: pair.idB,
            },
          }
          comparisonFeatures.push(square)
        }
      })

      const comparisonGeoJson: GeoJsonFeatureCollection = {
        type: "FeatureCollection",
        features: comparisonFeatures,
      }

      setGeoJsonLayers((prev) => ({
        ...prev,
        [`comparison_${layerA}_${layerB}`]: comparisonGeoJson,
      }))

      setComparisonPairs(enrichedPairs)
      setComparisonLayerA(layerA)
      setComparisonLayerB(layerB)
      setComparisonMode(true)

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
  }, [activeLayers, toast, geoJsonLayers, comparisonMode, comparisonLayerA, comparisonLayerB, haversineDistance])

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
          mapInstanceRef.current = map
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
        comparisonMode={comparisonMode}
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
            setGeoJsonLayers((prev) => {
              const next = { ...prev }
              Object.keys(next).forEach((key) => {
                if (key.endsWith("_buffer")) {
                  delete next[key]
                }
              })
              return next
            })
          }}
          onFlyTo={handleFlyTo}
        />
      )}
      {comparisonMode && comparisonPairs.length > 0 && (
        <ComparisonPanel
          pairs={comparisonPairs}
          layerAName={comparisonLayerA}
          layerBName={comparisonLayerB}
          onClose={() => {
            setComparisonMode(false)
            setComparisonPairs([])
            setComparisonLayerA("")
            setComparisonLayerB("")
            setGeoJsonLayers((prev) => {
              const next = { ...prev }
              Object.keys(next).forEach((key) => {
                if (key.startsWith("comparison_")) {
                  delete next[key]
                }
              })
              return next
            })
          }}
          onFlyTo={handleFlyTo}
        />
      )}
    </div>
  )
}
