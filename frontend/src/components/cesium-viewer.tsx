import React, { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { Trajectory } from '@/types/analysis';

interface CesiumViewerProps {
  trajectory: Trajectory | null;
  colorMode: 'speed' | 'time';
  currentTimeIndex: number;
  onTimeChange: (index: number) => void;
}

export function CesiumViewer({ trajectory, colorMode, currentTimeIndex, onTimeChange }: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const pathEntitiesRef = useRef<Cesium.Entity[]>([]);
  const uavEntityRef = useRef<Cesium.Entity | null>(null);
  
  // Use a ref for currentTimeIndex so the CallbackProperty can access it without closure stale-ness
  const timeIndexRef = useRef(currentTimeIndex);
  useEffect(() => {
    timeIndexRef.current = currentTimeIndex;
  }, [currentTimeIndex]);

  useEffect(() => {
    if (!containerRef.current) return;

    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.AAAA';

    const viewer = new Cesium.Viewer(containerRef.current, {
      imageryProvider: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      creditContainer: document.createElement('div'),
      requestRenderMode: true,
      maximumRenderTimeChange: 0.1,
    });

    const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 19,
      credit: new Cesium.Credit('Tiles © Esri'),
    });

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(satelliteProvider);
    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  const getMetricColor = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return Cesium.Color.fromCssColorString('#6be3ff');
    }
    const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
    const hue = (1 - normalized) * 0.62;
    return Cesium.Color.fromHsl(hue, 0.82, 0.52, 0.95);
  };

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !trajectory || !trajectory.points.length) return;

    pathEntitiesRef.current.forEach(entity => viewer.entities.remove(entity));
    pathEntitiesRef.current = [];
    if (uavEntityRef.current) {
      viewer.entities.remove(uavEntityRef.current);
      uavEntityRef.current = null;
    }

    const points = trajectory.points;
    const speedSeries = trajectory.speed_series || [];
    const speedLookup = new Map(speedSeries.map(item => [Number(item.t).toFixed(3), item.value]));

    const values = points.map((point, index) => {
      if (colorMode === 'time') return index;
      const key = (Number(point.t) / 1e6).toFixed(3);
      return speedLookup.get(key) ?? 0;
    });

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    for (let index = 1; index < points.length; index++) {
      const prev = points[index - 1];
      const current = points[index];
      const color = getMetricColor(values[index], minValue, maxValue);

      const entity = viewer.entities.add({
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(Number(prev.lon), Number(prev.lat), Number(prev.alt)),
            Cesium.Cartesian3.fromDegrees(Number(current.lon), Number(current.lat), Number(current.alt)),
          ],
          width: 5,
          material: color,
          clampToGround: false,
        },
      });
      pathEntitiesRef.current.push(entity);
    }

    const uavEntity = viewer.entities.add({
      position: new Cesium.CallbackProperty(() => {
        const point = points[timeIndexRef.current] || points[0];
        return Cesium.Cartesian3.fromDegrees(Number(point.lon), Number(point.lat), Number(point.alt));
      }, false) as any,
      orientation: new Cesium.CallbackProperty(() => {
        const point = points[timeIndexRef.current] || points[0];
        const pos = Cesium.Cartesian3.fromDegrees(Number(point.lon), Number(point.lat), Number(point.alt));
        const hpr = new Cesium.HeadingPitchRoll(
          Cesium.Math.toRadians(Number(point.yaw || 0)),
          Cesium.Math.toRadians(Number(point.pitch || 0)),
          Cesium.Math.toRadians(Number(point.roll || 0))
        );
        return Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
      }, false) as any,
      ellipsoid: {
        radii: new Cesium.Cartesian3(24, 9, 9), // Adjusted for better visibility
        material: Cesium.Color.fromCssColorString('#f4c95d').withAlpha(0.95),
        outline: false,
      },
    });
    uavEntityRef.current = uavEntity;

    const first = points[0];
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(Number(first.lon), Number(first.lat), Number(first.alt) + 250),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-40),
        roll: 0,
      },
      duration: 1.8,
    });
    viewer.scene.requestRender();
  }, [trajectory, colorMode]);

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.scene.requestRender();
    }
  }, [currentTimeIndex]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute left-2 right-2 md:left-4 md:right-4 bottom-2 md:bottom-4 flex gap-2 md:gap-4 items-center flex-wrap z-10 pointer-events-none">
        <div className="p-2 md:p-3 rounded-xl bg-[#081016]/75 border border-white/10 backdrop-blur-md pointer-events-auto min-w-[180px] flex-1 md:flex-none">
          <div className="text-[9px] md:text-[10px] text-[#8eb1bc] uppercase tracking-widest mb-1">Playback</div>
          <input
            type="range"
            min="0"
            max={trajectory?.points.length ? trajectory.points.length - 1 : 0}
            value={currentTimeIndex}
            onChange={(e) => onTimeChange(Number(e.target.value))}
            className="w-full md:w-[420px] accent-[#f4c95d] h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
            disabled={!trajectory}
          />
        </div>
        <div className="p-2 md:p-3 rounded-xl bg-[#081016]/75 border border-white/10 backdrop-blur-md pointer-events-auto">
          <div className="text-[9px] md:text-[10px] text-[#8eb1bc] uppercase tracking-widest mb-1">Current Sample</div>
          <div className="text-xs md:text-sm font-mono text-[#eef6f8]">
            {trajectory?.points[currentTimeIndex] ? (
              <>
                t: {(Number(trajectory.points[currentTimeIndex].t) / 1e6).toFixed(2)}s | 
                alt: {Number(trajectory.points[currentTimeIndex].alt).toFixed(1)}m
              </>
            ) : (
              't: - | alt: -'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
