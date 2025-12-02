"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { Upload, Download, MapPin, Trash2, Circle, GitCompare, Cloud, Wind, Bus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"

interface MapControlsProps {
  onFlyTo: (lng: number, lat: number, zoom?: number) => void
  mapLoaded: boolean
  onImportCSV?: (file: File) => void | Promise<void>
  onExportLayer?: () => void
  onClearLayers?: () => void | Promise<void>
  onCompareLayers?: () => void | Promise<void>
  onToggleBufferMode?: () => void
  onLoadEnvironmentalLayer?: (type: "air_quality" | "weather") => void | Promise<void>
  onLoadTransportationLayer?: (type: "transit" | "stations") => void | Promise<void>
  bufferMode?: boolean
  bufferRadius?: number
  onBufferRadiusChange?: (radius: number) => void
  isImporting?: boolean
  activeLayerCount?: number
  isClearing?: boolean
  isComparing?: boolean
  isCreatingBuffer?: boolean
  isLoadingEnvironmental?: boolean
  isLoadingTransportation?: boolean
  currentLat?: number
  currentLng?: number
}

const quickLocations = [
  { name: "New York", lng: -74.006, lat: 40.7128 },
  { name: "Los Angeles", lng: -118.2437, lat: 34.0522 },
  { name: "Chicago", lng: -87.6298, lat: 41.8781 },
  { name: "Houston", lng: -95.3698, lat: 29.7604 },
]

export function MapControls({
  onFlyTo,
  mapLoaded,
  onImportCSV,
  onExportLayer,
  onClearLayers,
  onCompareLayers,
  onToggleBufferMode,
  onLoadEnvironmentalLayer,
  onLoadTransportationLayer,
  bufferMode = false,
  bufferRadius = 500,
  onBufferRadiusChange,
  isImporting = false,
  activeLayerCount = 0,
  isClearing = false,
  isComparing = false,
  isCreatingBuffer = false,
  isLoadingEnvironmental = false,
  isLoadingTransportation = false,
  currentLat,
  currentLng,
}: MapControlsProps) {
  const [showLocations, setShowLocations] = useState(false)
  const [showBufferSettings, setShowBufferSettings] = useState(false)
  const [showEnvironmentalMenu, setShowEnvironmentalMenu] = useState(false)
  const [showTransportationMenu, setShowTransportationMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !files.length || !onImportCSV) return
    const file = files[0]
    await onImportCSV(file)
    event.target.value = ""
  }

  return (
    <div className="absolute bottom-6 left-6 z-[9999] pointer-events-auto flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!mapLoaded || !onImportCSV || isImporting}
          onClick={() => fileInputRef.current?.click()}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          <span className="text-sm">{isImporting ? "Importing..." : "Import CSV"}</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded || !onExportLayer}
          onClick={() => onExportLayer?.()}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span className="text-sm">Export Data</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded}
          onClick={() => setShowLocations((prev) => !prev)}
          className={cn(
            "h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50",
            showLocations && "bg-[oklch(0.6_0.2_250)]/10 border-[oklch(0.6_0.2_250)]",
          )}
        >
          <MapPin className="w-4 h-4" />
          <span className="text-sm">Quick Nav</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded || !activeLayerCount || !onClearLayers || isClearing}
          onClick={async () => {
            if (!onClearLayers) return
            await onClearLayers()
          }}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-sm">{isClearing ? "Clearing..." : "Clear Layers"}</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded || activeLayerCount < 1 || isCreatingBuffer}
          onClick={() => {
            onToggleBufferMode?.()
            if (!bufferMode) {
              setShowBufferSettings(true)
            } else {
              setShowBufferSettings(false)
            }
          }}
          className={cn(
            "h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50",
            bufferMode && "bg-[oklch(0.6_0.2_250)]/10 border-[oklch(0.6_0.2_250)]",
          )}
        >
          <Circle className="w-4 h-4" />
          <span className="text-sm">{bufferMode ? "Buffer Mode On" : "Buffer Zone"}</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded || activeLayerCount < 2 || isComparing}
          onClick={async () => {
            if (!onCompareLayers) return
            await onCompareLayers()
          }}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <GitCompare className="w-4 h-4" />
          <span className="text-sm">{isComparing ? "Comparing..." : "Compare Layers"}</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded || !currentLat || !currentLng || isLoadingEnvironmental}
          onClick={() => setShowEnvironmentalMenu((prev) => !prev)}
          className={cn(
            "h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50",
            showEnvironmentalMenu && "bg-[oklch(0.6_0.2_250)]/10 border-[oklch(0.6_0.2_250)]",
          )}
        >
          <Cloud className="w-4 h-4" />
          <span className="text-sm">Environmental</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded || !currentLat || !currentLng || isLoadingTransportation}
          onClick={() => setShowTransportationMenu((prev) => !prev)}
          className={cn(
            "h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50",
            showTransportationMenu && "bg-[oklch(0.6_0.2_250)]/10 border-[oklch(0.6_0.2_250)]",
          )}
        >
          <Bus className="w-4 h-4" />
          <span className="text-sm">Transportation</span>
        </Button>
      </div>

      {showEnvironmentalMenu && mapLoaded && currentLat && currentLng && (
        <div className="rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm p-2 space-y-1 min-w-[180px]">
          <button
            onClick={async () => {
              if (onLoadEnvironmentalLayer) {
                await onLoadEnvironmentalLayer("air_quality")
                setShowEnvironmentalMenu(false)
              }
            }}
            disabled={isLoadingEnvironmental}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-[oklch(0.85_0_0)] hover:bg-[oklch(0.18_0_0)] transition-colors disabled:opacity-50"
          >
            <Wind className="w-3.5 h-3.5 text-[oklch(0.6_0.2_250)]" />
            {isLoadingEnvironmental ? "Loading..." : "Air Quality"}
          </button>
          <button
            onClick={async () => {
              if (onLoadEnvironmentalLayer) {
                await onLoadEnvironmentalLayer("weather")
                setShowEnvironmentalMenu(false)
              }
            }}
            disabled={isLoadingEnvironmental}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-[oklch(0.85_0_0)] hover:bg-[oklch(0.18_0_0)] transition-colors disabled:opacity-50"
          >
            <Cloud className="w-3.5 h-3.5 text-[oklch(0.6_0.2_250)]" />
            {isLoadingEnvironmental ? "Loading..." : "Weather"}
          </button>
        </div>
      )}

      {showTransportationMenu && mapLoaded && currentLat && currentLng && (
        <div className="rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm p-2 space-y-1 min-w-[180px]">
          <button
            onClick={async () => {
              if (onLoadTransportationLayer) {
                await onLoadTransportationLayer("transit")
                setShowTransportationMenu(false)
              }
            }}
            disabled={isLoadingTransportation}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-[oklch(0.85_0_0)] hover:bg-[oklch(0.18_0_0)] transition-colors disabled:opacity-50"
          >
            <Bus className="w-3.5 h-3.5 text-[oklch(0.6_0.2_250)]" />
            {isLoadingTransportation ? "Loading..." : "Transit Stops"}
          </button>
          <button
            onClick={async () => {
              if (onLoadTransportationLayer) {
                await onLoadTransportationLayer("stations")
                setShowTransportationMenu(false)
              }
            }}
            disabled={isLoadingTransportation}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-[oklch(0.85_0_0)] hover:bg-[oklch(0.18_0_0)] transition-colors disabled:opacity-50"
          >
            <MapPin className="w-3.5 h-3.5 text-[oklch(0.6_0.2_250)]" />
            {isLoadingTransportation ? "Loading..." : "Stations"}
          </button>
        </div>
      )}

      {showBufferSettings && bufferMode && (
        <div className="rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm p-3 space-y-2 min-w-[200px]">
          <Label htmlFor="buffer-radius" className="text-xs text-[oklch(0.85_0_0)]">
            Buffer Radius (meters)
          </Label>
          <Input
            id="buffer-radius"
            type="number"
            min="50"
            max="10000"
            step="50"
            value={bufferRadius}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val > 0) {
                onBufferRadiusChange?.(val)
              }
            }}
            className="h-8 text-sm bg-[oklch(0.12_0_0)] border-[oklch(0.25_0_0)] text-[oklch(0.85_0_0)]"
          />
          <p className="text-xs text-[oklch(0.55_0_0)]">
            Click on the map to create a buffer zone around that point
          </p>
        </div>
      )}

      {showLocations && mapLoaded && (
        <div className="rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm p-2 space-y-1">
          {quickLocations.map((location) => (
            <button
              key={location.name}
              onClick={() => onFlyTo(location.lng, location.lat)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-[oklch(0.85_0_0)] hover:bg-[oklch(0.18_0_0)] transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-[oklch(0.6_0.2_250)]" />
              {location.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
