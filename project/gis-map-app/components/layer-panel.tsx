"use client"

import { useMemo, useState } from "react"
import { Layers, ChevronRight, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { LayerSummary } from "@/lib/api"

type LayerStatus = "idle" | "loading" | "error"

interface LayerPanelProps {
  activeLayers: string[]
  onLayerToggle: (layerId: string) => void
  mapLoaded: boolean
  layers: LayerSummary[]
  loadingLayers: boolean
  onRefreshLayers?: () => void
  layerStatuses?: Record<string, LayerStatus>
  layerColors?: Record<string, string>
}

export function LayerPanel({
  activeLayers,
  onLayerToggle,
  mapLoaded,
  layers,
  loadingLayers,
  onRefreshLayers,
  layerStatuses = {},
  layerColors = {},
}: LayerPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const sortedLayers = useMemo(() => {
    return [...layers].sort((a, b) => a.name.localeCompare(b.name))
  }, [layers])

  const renderStatusIcon = (layerId: string) => {
    const status = layerStatuses[layerId] ?? "idle"
    if (status === "loading") {
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-[oklch(0.6_0.2_250)]" />
    }
    if (status === "error") {
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    }
    if (activeLayers.includes(layerId)) {
      const color = layerColors[layerId] ?? "rgb(76, 201, 240)"
      return <CheckCircle2 className="w-3.5 h-3.5" style={{ color }} />
    }
    return null
  }

  return (
    <div
      className={cn(
        "absolute top-20 left-6 z-[9999] pointer-events-auto w-80 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm shadow-2xl transition-transform duration-300",
        !isExpanded && "-translate-x-[calc(100%-3rem)]",
      )}
    >
      <div className="flex items-center justify-between border-b border-[oklch(0.25_0_0)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[oklch(0.6_0.2_250)]" />
          <h2 className="text-sm font-semibold text-[oklch(0.85_0_0)]">Map Layers</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={loadingLayers}
            onClick={() => onRefreshLayers?.()}
            className="h-7 w-7 p-0 hover:bg-[oklch(0.18_0_0)]"
            title="Refresh layers"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loadingLayers && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 hover:bg-[oklch(0.18_0_0)]"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={cn("w-4 h-4 text-[oklch(0.55_0_0)] transition-transform", isExpanded && "rotate-180")}
            />
          </Button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-2">
        {!mapLoaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-[oklch(0.6_0.2_250)] animate-spin" />
          </div>
        ) : loadingLayers ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-[oklch(0.6_0.2_250)]">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs uppercase tracking-wide">Loading layers…</span>
          </div>
        ) : sortedLayers.length ? (
          <div className="space-y-2">
            {sortedLayers.map((layer) => {
              const isActive = activeLayers.includes(layer.id)
              const layerColor = layerColors[layer.id]
              return (
                <button
                  key={layer.id}
                  onClick={() => onLayerToggle(layer.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)]/60 px-3 py-2 text-left transition-colors",
                    isActive ? "border-[oklch(0.6_0.2_250)]/40 bg-[oklch(0.6_0.2_250)]/10" : "hover:bg-[oklch(0.18_0_0)]",
                  )}
                  style={
                    isActive && layerColor
                      ? {
                          borderColor: layerColor,
                          boxShadow: `0 0 12px ${layerColor}55`,
                        }
                      : undefined
                  }
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/80"
                    style={
                      layerColor
                        ? {
                            borderColor: layerColor,
                            boxShadow: `0 0 8px ${layerColor}55`,
                          }
                        : undefined
                    }
                  >
                    {renderStatusIcon(layer.id)}
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isActive ? "text-[oklch(0.85_0_0)]" : "text-[oklch(0.7_0_0)]",
                      )}
                    >
                      {layer.name}
                    </span>
                    <span className="text-xs text-[oklch(0.55_0_0)]">
                      {layer.rows} rows · {layer.columns.slice(0, 3).join(", ")}
                      {layer.columns.length > 3 ? "…" : ""}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[oklch(0.25_0_0)] px-4 py-6 text-center">
            <UploadHint />
          </div>
        )}
      </div>

      <div className="border-t border-[oklch(0.25_0_0)] px-4 py-2">
        <p className="text-xs text-[oklch(0.55_0_0)]">
          {activeLayers.length} {activeLayers.length === 1 ? "layer" : "layers"} active
        </p>
      </div>
    </div>
  )
}

function UploadHint() {
  return (
    <div className="text-xs text-[oklch(0.6_0_0)]">
      <p className="font-medium text-[oklch(0.85_0_0)]">No layers available yet</p>
      <p className="text-[oklch(0.55_0_0)]">Import a CSV from the controls below to start exploring your data.</p>
    </div>
  )
}
