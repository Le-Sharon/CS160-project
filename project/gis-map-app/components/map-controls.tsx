"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { Upload, Download, MapPin, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"

interface MapControlsProps {
  onFlyTo: (lng: number, lat: number, zoom?: number) => void
  mapLoaded: boolean
  onImportCSV?: (file: File) => void | Promise<void>
  onExportLayer?: () => void
  onClearLayers?: () => void
  isImporting?: boolean
  activeLayerCount?: number
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
  isImporting = false,
  activeLayerCount = 0,
}: MapControlsProps) {
  const [showLocations, setShowLocations] = useState(false)
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
          disabled={!mapLoaded || !activeLayerCount || !onClearLayers}
          onClick={() => onClearLayers?.()}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-sm">Clear Layers</span>
        </Button>
      </div>

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
