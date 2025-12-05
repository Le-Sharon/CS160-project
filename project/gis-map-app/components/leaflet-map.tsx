"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    L: any
  }
}

interface LeafletMapProps {
  onMapReady: (map: any) => void
  onMove: (coords: { lng: number; lat: number; zoom: number }) => void
  onMapClick?: (lat: number, lng: number) => void
  bufferMode?: boolean
  geoJson?: any
  fitToBounds?: boolean
}

export default function LeafletMap({
  onMapReady,
  onMove,
  onMapClick,
  bufferMode = false,
  geoJson,
  fitToBounds = true,
}: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const geoJsonLayerRef = useRef<any>(null)

  // Store click handler in ref so we can remove it later
  const clickHandlerRef = useRef<((e: any) => void) | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const initMap = () => {
      if (typeof window === "undefined" || !window.L) {
        setTimeout(initMap, 100)
        return
      }

      const L = window.L

      const map = L.map(mapRef.current, {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: true,
        attributionControl: true,
      })

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map)

      map.on("move", () => {
        const center = map.getCenter()
        const zoom = map.getZoom()
        onMove({
          lng: Number(center.lng.toFixed(4)),
          lat: Number(center.lat.toFixed(4)),
          zoom: Number(zoom.toFixed(2)),
        })
      })

      mapInstanceRef.current = map
      onMapReady(map)
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [onMapReady, onMove])

  // Update click handler and cursor when onMapClick or bufferMode changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Remove old click handler if it exists
    if (clickHandlerRef.current) {
      map.off("click", clickHandlerRef.current)
      clickHandlerRef.current = null
    }

    // Add new click handler if onMapClick is provided
    if (onMapClick) {
      const handler = (e: any) => {
        onMapClick(e.latlng.lat, e.latlng.lng)
      }
      map.on("click", handler)
      clickHandlerRef.current = handler
    }

    // Update cursor style based on buffer mode
    if (bufferMode) {
      map.getContainer().style.cursor = "crosshair"
    } else {
      map.getContainer().style.cursor = ""
    }

    return () => {
      if (map && clickHandlerRef.current) {
        map.off("click", clickHandlerRef.current)
        clickHandlerRef.current = null
      }
    }
  }, [onMapClick, bufferMode])

  // Watch for geoJson prop changes and add/remove layer accordingly
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // remove existing geojson layer
    if (geoJsonLayerRef.current) {
      try {
        map.removeLayer(geoJsonLayerRef.current)
      } catch (e) {
        /* ignore */
      }
      geoJsonLayerRef.current = null
    }

    if (!geoJson) return
    if (typeof window === "undefined" || !window.L) return
    const L = window.L

    const createTooltipContent = (feature: any) => {
      const props = feature?.properties ?? {}
      const entries = Object.entries(props).filter(
        ([key, value]) => !key.startsWith("_") && value !== null && value !== undefined && value !== "",
      )
      if (!entries.length) {
        return "<div class='neon-tooltip__body'>No properties</div>"
      }
      const rows = entries
        .map(([key, value]) => {
          const label = key.replace(/[_-]/g, " ")
          return `<div class="neon-tooltip__row"><span class="neon-tooltip__key">${label}</span><span class="neon-tooltip__value">${value}</span></div>`
        })
        .join("")
      return `<div class='neon-tooltip__body'>${rows}</div>`
    }

    const getFeatureColor = (feature: any) => {
      const color = feature?.properties?._layerColor
      return typeof color === "string" && color.length ? color : "#4CC9F0"
    }

    try {
      const layer = L.geoJSON(geoJson, {
        pointToLayer: (feature: any, latlng: any) => {
          const color = getFeatureColor(feature)
          const marker = L.circleMarker(latlng, {
            radius: 10,
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.85,
            className: "neon-marker",
          })
          marker.bindTooltip(createTooltipContent(feature), {
            direction: "top",
            offset: [0, -12],
            opacity: 0.95,
            className: "neon-tooltip",
            sticky: true,
          })
          return marker
        },
        onEachFeature: (feature: any, layerInner: any) => {
          const color = getFeatureColor(feature)
          const isBuffer = feature?.properties?._kind === "buffer"
          const isComparison = feature?.properties?._kind === "comparison"
          
          if (layerInner.setStyle) {
            if (isComparison) {
              // Red neon dashed square for comparison markers
              layerInner.setStyle({
                color: "#FF006E", // Hot Pink/Red neon
                weight: 3,
                fillColor: "#FF006E",
                fillOpacity: 0.15,
                dashArray: "8 4",
                opacity: 0.95,
              })
            } else if (isBuffer) {
              layerInner.setStyle({
                color,
                weight: 4,
                fillOpacity: 0.25,
                dashArray: "10 5",
                opacity: 0.9,
              })
            } else {
              layerInner.setStyle({
                color,
                weight: 1.5,
                fillOpacity: 0.2,
                opacity: 1,
              })
            }
          }
          if (feature?.geometry?.type !== "Point") {
            layerInner.bindTooltip(createTooltipContent(feature), {
              direction: "center",
              offset: [0, 0],
              opacity: 0.95,
              className: "neon-tooltip",
              sticky: true,
            })
          }
        },
      }).addTo(map)

      geoJsonLayerRef.current = layer

      // Optionally fit map to the layer bounds
      try {
        if (fitToBounds !== false && layer.getBounds && typeof layer.getBounds === "function") {
          const bounds = layer.getBounds()
          if (bounds && typeof bounds.isValid === "function" ? bounds.isValid() : true) {
            map.fitBounds(bounds)
          }
        }
      } catch (e) {
        // ignore fit errors
      }
    } catch (e) {
      console.error("Failed to add GeoJSON layer:", e)
    }
  }, [geoJson, fitToBounds])

  return <div ref={mapRef} className="h-full w-full" />
}
