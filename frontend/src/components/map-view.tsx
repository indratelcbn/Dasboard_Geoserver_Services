'use client';

import { useEffect, useRef } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import TileWMS from 'ol/source/TileWMS';
import { fromLonLat } from 'ol/proj';
import { ScaleLine, defaults as defaultControls } from 'ol/control';

interface MapViewProps {
  /** GeoServer WMS endpoint, e.g. http://host/geoserver/wms */
  wmsUrl?: string;
  /** Fully-qualified layer name workspace:layer */
  layerName?: string;
  className?: string;
  center?: [number, number];
  zoom?: number;
}

/**
 * OpenLayers map that renders an OSM base map and (optionally) a GeoServer
 * WMS layer on top. Re-renders the WMS overlay whenever the target layer changes.
 */
export function MapView({
  wmsUrl,
  layerName,
  className,
  center = [117.0, -2.5], // Indonesia
  zoom = 5,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const wmsLayerRef = useRef<TileLayer<TileWMS> | null>(null);

  // Initialise map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new Map({
      target: containerRef.current,
      controls: defaultControls().extend([new ScaleLine()]),
      layers: [new TileLayer({ source: new OSM() })],
      view: new View({
        center: fromLonLat(center),
        zoom,
      }),
    });

    return () => {
      mapRef.current?.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add / update the WMS overlay when inputs change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (wmsLayerRef.current) {
      map.removeLayer(wmsLayerRef.current);
      wmsLayerRef.current = null;
    }

    if (wmsUrl && layerName) {
      const layer = new TileLayer({
        source: new TileWMS({
          url: wmsUrl,
          params: { LAYERS: layerName, TILED: true },
          serverType: 'geoserver',
          transition: 0,
        }),
      });
      map.addLayer(layer);
      wmsLayerRef.current = layer;
    }
  }, [wmsUrl, layerName]);

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-full w-full'}
      style={{ minHeight: 400 }}
    />
  );
}
