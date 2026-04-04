import React, { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { Trajectory } from '@/types/analysis';
import { BorderBeam } from '@/components/ui/border-beam';
import { MapPin, Timer } from 'lucide-react';
import droneModelUrl from '@/assets/drone.glb';

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

  const timeIndexRef = useRef(currentTimeIndex);
  useEffect(() => {
    timeIndexRef.current = currentTimeIndex;
  }, [currentTimeIndex]);

  useEffect(() => {
    if (!containerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN ?? '';

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      creditContainer: document.createElement('div'),
    });

    Cesium.createWorldTerrainAsync({ requestWaterMask: false, requestVertexNormals: true })
      .then((terrainProvider) => {
        if (!viewer.isDestroyed()) {
          viewer.terrainProvider = terrainProvider;
        }
      })
      .catch(() => {
        if (!viewer.isDestroyed()) {
          viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        }
      });

    const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 19,
      credit: new Cesium.Credit('Tiles © Esri'),
    });

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(satelliteProvider);

    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1;

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
        const orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
        // Model is oriented with its top as "forward" — rotate -90° pitch to align with Cesium's ENU frame
        const fixOffset = Cesium.Quaternion.fromAxisAngle(
          new Cesium.Cartesian3(0, 1, 0),
          Cesium.Math.toRadians(90)
        );
        return Cesium.Quaternion.multiply(orientation, fixOffset, new Cesium.Quaternion());
      }, false) as any,
      model: {
        uri: droneModelUrl,
        minimumPixelSize: 48,
        maximumScale: 200,
        scale: 1,
        runAnimations: true,
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

  const currentPoint = trajectory?.points[currentTimeIndex];

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-[var(--uav-border)] group animate-glow-pulse">
      {/* Border Beam Effect */}
      <BorderBeam
        size={300}
        duration={8}
        colorFrom="var(--uav-primary)"
        colorTo="var(--uav-accent)"
        delay={0}
      />

      {/* Cesium Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Overlay Controls */}
      <div className="absolute left-3 right-3 md:left-4 md:right-4 bottom-3 md:bottom-4 flex gap-2.5 items-end flex-wrap z-10 pointer-events-none">
        {/* Playback Control */}
        <div className="pointer-events-auto glass-panel rounded-xl p-3 flex-1 min-w-[200px] md:flex-none md:min-w-[380px]">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="w-3 h-3 text-[var(--uav-accent)]" />
            <span className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-semibold">Playback</span>
          </div>
          <input
            type="range"
            min="0"
            max={trajectory?.points.length ? trajectory.points.length - 1 : 0}
            value={currentTimeIndex}
            onChange={(e) => onTimeChange(Number(e.target.value))}
            className="w-full"
            disabled={!trajectory}
          />
        </div>

        {/* Current Sample Info */}
        <div className="pointer-events-auto glass-panel rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <MapPin className="w-3 h-3 text-[var(--uav-primary)]" />
            <span className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-semibold">Position</span>
          </div>
          <div className="text-xs font-mono text-[var(--uav-text)] flex gap-3">
            {currentPoint ? (
              <>
                <span className="text-[var(--uav-text-secondary)]">t: <span className="text-[var(--uav-text)]">{(Number(currentPoint.t) / 1e6).toFixed(2)}s</span></span>
                <span className="text-[var(--uav-text-secondary)]">alt: <span className="text-[var(--uav-primary)]">{Number(currentPoint.alt).toFixed(1)}m</span></span>
              </>
            ) : (
              <span className="text-[var(--uav-muted)]">No data</span>
            )}
          </div>
        </div>
      </div>

      {/* Empty state overlay */}
      {!trajectory && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center space-y-3 p-8">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mx-auto">
              <MapPin className="w-7 h-7 text-[var(--uav-muted)]/50" />
            </div>
            <div>
              <p className="text-sm text-[var(--uav-muted)] font-medium">No trajectory loaded</p>
              <p className="text-xs text-[var(--uav-muted)]/50 mt-1">Upload and analyze a flight log to view the 3D trajectory</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
