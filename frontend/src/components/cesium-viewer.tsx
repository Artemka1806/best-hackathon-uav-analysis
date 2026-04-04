import React, { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { Trajectory } from '@/types/analysis';
import { BorderBeam } from '@/components/ui/border-beam';
import { MapPin, Timer } from 'lucide-react';
import droneModelUrl from '@/assets/fpv_drone_cubed.glb';

interface CesiumViewerProps {
  trajectory: Trajectory | null;
  colorMode: 'speed' | 'time';
  currentTimeIndex: number;
  onTimeChange: (index: number) => void;
}

const MODEL_YAW_OFFSET_RAD = Cesium.Math.PI_OVER_TWO;

function getAbsoluteTimeSeconds(point: Trajectory['points'][number] | undefined) {
  if (!point) return 0;

  const timeSeconds = Number(point.t) / 1e6;
  return Number.isFinite(timeSeconds) ? timeSeconds : 0;
}

function getRelativeTimeSeconds(points: Trajectory['points'], index: number) {
  if (!points.length) return 0;

  const safeIndex = Math.min(Math.max(index, 0), points.length - 1);
  return Math.max(0, getAbsoluteTimeSeconds(points[safeIndex]) - getAbsoluteTimeSeconds(points[0]));
}

function getModelOrientationQuaternion(
  position: Cesium.Cartesian3,
  baseOrientation: Cesium.Quaternion | undefined
) {
  if (!baseOrientation) {
    return Cesium.Quaternion.IDENTITY;
  }

  const baseHeadingPitchRoll = Cesium.HeadingPitchRoll.fromQuaternion(baseOrientation);
  const leveledHeadingPitchRoll = new Cesium.HeadingPitchRoll(
    baseHeadingPitchRoll.heading + MODEL_YAW_OFFSET_RAD,
    0,
    0
  );

  return Cesium.Transforms.headingPitchRollQuaternion(position, leveledHeadingPitchRoll);
}

export function CesiumViewer({ trajectory, colorMode, currentTimeIndex, onTimeChange }: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const pathEntitiesRef = useRef<Cesium.Entity[]>([]);
  const uavEntityRef = useRef<Cesium.Entity | null>(null);
  const sampledPositionRef = useRef<Cesium.SampledPositionProperty | null>(null);
  const velocityOrientationRef = useRef<Cesium.VelocityOrientationProperty | null>(null);

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
    const sampledPosition = new Cesium.SampledPositionProperty();

    points.forEach((point) => {
      sampledPosition.addSample(
        Cesium.JulianDate.fromDate(new Date(getAbsoluteTimeSeconds(point) * 1000)),
        Cesium.Cartesian3.fromDegrees(Number(point.lon), Number(point.lat), Number(point.alt))
      );
    });

    sampledPositionRef.current = sampledPosition;
    velocityOrientationRef.current = new Cesium.VelocityOrientationProperty(sampledPosition);

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
        const orientationIndex = Math.min(Math.max(timeIndexRef.current, 1), points.length - 2);
        const orientationPoint = points[orientationIndex] || point;
        const pos = Cesium.Cartesian3.fromDegrees(Number(point.lon), Number(point.lat), Number(point.alt));
        const sampleTime = Cesium.JulianDate.fromDate(new Date(getAbsoluteTimeSeconds(orientationPoint) * 1000));
        const baseOrientation = velocityOrientationRef.current?.getValue(sampleTime, new Cesium.Quaternion());
        return getModelOrientationQuaternion(pos, baseOrientation);
      }, false) as any,
      model: {
        uri: droneModelUrl,
        minimumPixelSize: 64,
        maximumScale: 1000,
        scale: 5,
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
  const currentRelativeTimeSeconds = trajectory?.points.length
    ? getRelativeTimeSeconds(trajectory.points, currentTimeIndex)
    : 0;

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl shadow-black/40 group">
      {/* Border Beam Effect */}
      <BorderBeam
        size={300}
        duration={8}
        colorFrom="rgba(107, 227, 255, 0.4)"
        colorTo="rgba(244, 201, 93, 0.3)"
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
                <span className="text-[var(--uav-text-secondary)]">t: <span className="text-[var(--uav-text)]">{currentRelativeTimeSeconds.toFixed(2)}s</span></span>
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
