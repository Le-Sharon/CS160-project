"use client"
// TODO: Reimplement CSV import/export API (importCSVFile, exportLayerUrl, getLayerGeoJSON).
// implement API under `lib/api.ts` and server routes for storage/conversion.
import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { MapControls } from "./map-controls"
import { LayerPanel } from "./layer-panel"
import { MapHeader } from "./map-header"

const MapContainer = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="text-muted-foreground">Loading map...</div>
    </div>
  ),
})

export default function MapView() {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [coordinates, setCoordinates] = useState({ lng: -98.5795, lat: 39.8283, zoom: 4 })
  const [activeLayers, setActiveLayers] = useState<string[]>([])
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [geoJson, setGeoJson] = useState<any>(null)

  const handleLayerToggle = (layerId: string) => {
    setActiveLayers((prev) => (prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId]))
  }

  const handleFlyTo = (lng: number, lat: number, zoom = 12) => {
    if (mapInstance) {
      mapInstance.flyTo([lat, lng], zoom, {
        duration: 2,
      })
    }
  }

  const sampleGeoJson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Sample Point", popup: "Hello GeoJSON" },
        geometry: { type: "Point", coordinates: [-98.5795, 39.8283] },
      },
    ],
  }

  const handlePlotGeoJson = () => setGeoJson(sampleGeoJson)
  const handleClearGeoJson = () => setGeoJson(null)

  return (
    <div className="relative h-full w-full">
      {/* Header */}
      <MapHeader coordinates={coordinates} />

      {/* Map Container */}
      <MapContainer
        onMapReady={useCallback((map: any) => {
          setMapInstance(map)
          setMapLoaded(true)
        }, [])}
        onMove={useCallback((coords: { lng: number; lat: number; zoom: number }) => {
          setCoordinates(coords)
        }, [])}
        geoJson={geoJson}
        fitToBounds={true}
      />

      {/* Layer Panel */}
      <LayerPanel activeLayers={activeLayers} onLayerToggle={handleLayerToggle} mapLoaded={mapLoaded} />

      {/* Map Controls */}
  <MapControls onFlyTo={handleFlyTo} mapLoaded={mapLoaded} onPlotGeoJson={handlePlotGeoJson} onClearGeoJson={handleClearGeoJson} />
    </div>
  )
}
