"use client"

import { useState } from "react"
import { Upload, Download, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { importCSVFile, exportLayerUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"

interface MapControlsProps {
  onFlyTo: (lng: number, lat: number, zoom?: number) => void
  mapLoaded: boolean
  onPlotGeoJson?: () => void
  onClearGeoJson?: () => void
}

const quickLocations = [
  { name: "New York", lng: -74.006, lat: 40.7128 },
  { name: "Los Angeles", lng: -118.2437, lat: 34.0522 },
  { name: "Chicago", lng: -87.6298, lat: 41.8781 },
  { name: "Houston", lng: -95.3698, lat: 29.7604 },
]

export function MapControls({ onFlyTo, mapLoaded, onPlotGeoJson, onClearGeoJson }: MapControlsProps) {
  const [showLocations, setShowLocations] = useState(false)
  const fileRef = typeof document !== 'undefined' ? (null as unknown as HTMLInputElement | null) : null

  const onImportClick = () => {
    const el = document.getElementById("csv-import-input") as HTMLInputElement | null
    el?.click()
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const f = e.target.files && e.target.files[0]
      if (!f) return
      const resp = await importCSVFile(f)
      // basic success notification
      alert(`Imported layer ${resp.layer} (${resp.rows} rows)`)
    } catch (err: any) {
      console.error(err)
      alert(`Import failed: ${err?.message ?? err}`)
    }
  }

  const onExportClick = () => {
    // fallback: export the first layer name if known; otherwise open export dialog to pick
    const url = exportLayerUrl("app.demo")
    window.open(url, "_blank")
  }

  return (
  <div className="absolute bottom-6 left-6 z-[9999] pointer-events-auto flex flex-col gap-2">
      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!mapLoaded}
          onClick={onImportClick}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          <span className="text-sm">Import CSV</span>
        </Button>

        <input id="csv-import-input" type="file" accept=".csv" style={{ display: "none" }} onChange={onFileSelected} />

        <Button
          size="sm"
          disabled={!mapLoaded}
          onClick={onExportClick}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span className="text-sm">Export Data</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded}
          onClick={() => setShowLocations(!showLocations)}
          className={cn(
            "h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50",
            showLocations && "bg-[oklch(0.6_0.2_250)]/10 border-[oklch(0.6_0.2_250)]",
          )}
        >
          <MapPin className="w-4 h-4" />
          <span className="text-sm">Quick Nav</span>
        </Button>

        {/* GeoJSON controls */}
        <Button
          size="sm"
          disabled={!mapLoaded}
          onClick={() => onPlotGeoJson && onPlotGeoJson()}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <span className="text-sm">Plot GeoJSON</span>
        </Button>

        <Button
          size="sm"
          disabled={!mapLoaded}
          onClick={() => onClearGeoJson && onClearGeoJson()}
          className="h-10 gap-2 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 text-[oklch(0.85_0_0)] backdrop-blur-sm hover:bg-[oklch(0.18_0_0)] disabled:opacity-50"
        >
          <span className="text-sm">Clear GeoJSON</span>
        </Button>
      </div>

      {/* Quick Locations */}
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
