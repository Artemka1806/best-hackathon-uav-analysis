import React, { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { Trajectory, GlobalPoint, EnuPoint } from "@/types/analysis";
import { BorderBeam } from "@/components/ui/border-beam";
import { MapPin, Timer, Play, Pause } from "lucide-react";
import droneModelUrl from "@/assets/drone.glb";

// Scratch variables for high-frequency callbacks to prevent GC pauses
const scratchCenter = new Cesium.Cartesian3();
const scratchOffset = new Cesium.Cartesian3();
const scratchTransform = new Cesium.Matrix4();
const scratchPosition = new Cesium.Cartesian3();
const scratchHpr = new Cesium.HeadingPitchRoll();
const scratchQuaternion = new Cesium.Quaternion();
const fixOffset = Cesium.Quaternion.fromAxisAngle(
  new Cesium.Cartesian3(1, 1, 1),
  Cesium.Math.toRadians(0),
);

interface CesiumViewerProps {
  trajectory: Trajectory | null;
  colorMode: "speed" | "time";
  currentTimeIndex: number;
  onTimeChange: (index: number) => void;
}

export function CesiumViewer({
  trajectory,
  colorMode,
  currentTimeIndex,
  onTimeChange,
}: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const pathPrimitiveRef = useRef<Cesium.Primitive | null>(null);
  const uavEntityRef = useRef<Cesium.Entity | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const speedRef = useRef(playbackSpeed);

  const timeIndexRef = useRef(currentTimeIndex);
  useEffect(() => {
    timeIndexRef.current = currentTimeIndex;
  }, [currentTimeIndex]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const onTimeChangeRef = useRef(onTimeChange);
  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  useEffect(() => {
    const globalPoints = trajectory?.global?.points;
    if (!isPlaying || !globalPoints || globalPoints.length === 0) return;

    let animationFrameId: number;
    let lastRealTime = performance.now();

    let internalIndex = timeIndexRef.current;
    let internalSimTime = Number(globalPoints[internalIndex].t) / 1e6;
    let lastSetIndex = internalIndex;

    const loop = (time: number) => {
      if (timeIndexRef.current !== lastSetIndex) {
        internalIndex = timeIndexRef.current;
        internalSimTime = Number(globalPoints[internalIndex].t) / 1e6;
        lastSetIndex = internalIndex;
        lastRealTime = time;
      }

      const deltaMs = time - lastRealTime;
      lastRealTime = time;

      const dt = (deltaMs / 1000) * speedRef.current;
      internalSimTime += dt;

      let nextIndex = internalIndex;
      while (nextIndex < globalPoints.length - 1) {
        const pointTime = Number(globalPoints[nextIndex + 1].t) / 1e6;
        if (pointTime <= internalSimTime) {
          nextIndex++;
        } else {
          break;
        }
      }

      if (nextIndex !== internalIndex) {
        internalIndex = nextIndex;
        lastSetIndex = nextIndex;
        onTimeChangeRef.current(nextIndex);
        if (viewerRef.current) {
          viewerRef.current.scene.requestRender();
        }
      }

      if (internalIndex >= globalPoints.length - 1) {
        setIsPlaying(false);
        return;
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, trajectory]);

  useEffect(() => {
    if (!containerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN ?? "";

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      selectionIndicator: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      skyAtmosphere: false,
      skyBox: false,
      creditContainer: document.createElement("div"),
      requestRenderMode: false,
    });

    // Set background to a dark color to match the theme
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#02050A");

    Cesium.createWorldTerrainAsync({
      requestWaterMask: false,
      requestVertexNormals: false,
    })
      .then((terrainProvider) => {
        if (!viewer.isDestroyed()) {
          viewer.terrainProvider = terrainProvider;
          viewer.scene.requestRender();
        }
      })
      .catch(() => {
        if (!viewer.isDestroyed()) {
          viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
          viewer.scene.requestRender();
        }
      });

    const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: new Cesium.Credit("Tiles © Esri"),
    });

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(satelliteProvider);

    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1;

    viewer.scene.globe.depthTestAgainstTerrain = true;

    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  const getMetricColor = (value: number, min: number, max: number) => {
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      max <= min
    ) {
      return Cesium.Color.fromCssColorString("#6be3ff");
    }
    const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
    const hue = (1 - normalized) * 0.62;
    return Cesium.Color.fromHsl(hue, 0.82, 0.52, 0.95);
  };

  useEffect(() => {
    const viewer = viewerRef.current;
    const globalPoints: GlobalPoint[] = trajectory?.global?.points || [];
    const enuPoints: EnuPoint[] = trajectory?.enu?.points || [];
    if (!viewer || !trajectory || !globalPoints.length) return;

    if (pathPrimitiveRef.current) {
      viewer.scene.primitives.remove(pathPrimitiveRef.current);
      pathPrimitiveRef.current = null;
    }
    if (uavEntityRef.current) {
      viewer.entities.remove(uavEntityRef.current);
      uavEntityRef.current = null;
    }

    const speedSeries = trajectory.speed_series || [];
    const speedLookup = new Map(
      speedSeries.map((item) => [Number(item.t).toFixed(3), item.value]),
    );

    const values = globalPoints.map((point, index) => {
      if (colorMode === "time") return index;
      const key = (Number(point.t) / 1e6).toFixed(3);
      return speedLookup.get(key) ?? 0;
    });

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    let minLat = 90,
      maxLat = -90,
      minLon = 180,
      maxLon = -180;

    const positions = new Array(globalPoints.length);
    const colors = new Array(globalPoints.length);

    for (let index = 0; index < globalPoints.length; index++) {
      const point = globalPoints[index];
      const lat = Number(point.lat);
      const lon = Number(point.lon);

      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;

      positions[index] = Cesium.Cartesian3.fromDegrees(
        lon,
        lat,
        Number(point.alt),
      );
      colors[index] = getMetricColor(values[index], minValue, maxValue);
    }

    // Limit the rendered globe to a ~5km radius around the flight
    // 1 degree lat is ~111km, so 5km is ~0.045 degrees
    const latBuffer = 0.045;
    // Longitude scale depends on latitude
    const lonBuffer =
      0.045 / Math.max(0.1, Math.cos(Cesium.Math.toRadians(minLat)));

    viewer.scene.globe.cartographicLimitRectangle =
      Cesium.Rectangle.fromDegrees(
        minLon - lonBuffer,
        minLat - latBuffer,
        maxLon + lonBuffer,
        maxLat + latBuffer,
      );

    const geometry = new Cesium.PolylineGeometry({
      positions: positions,
      colors: colors,
      width: 5.0,
      colorsPerVertex: true,
      arcType: Cesium.ArcType.NONE,
    });

    const instance = new Cesium.GeometryInstance({
      geometry: geometry,
    });

    const primitive = new Cesium.Primitive({
      geometryInstances: instance,
      appearance: new Cesium.PolylineColorAppearance(),
      asynchronous: true,
    });

    viewer.scene.primitives.add(primitive);
    pathPrimitiveRef.current = primitive;

    const uavEntity = viewer.entities.add({
      position: new Cesium.CallbackProperty(() => {
        const point = globalPoints[timeIndexRef.current] || globalPoints[0];
        const ePoint = enuPoints[timeIndexRef.current] || enuPoints[0];

        Cesium.Cartesian3.fromDegrees(
          Number(point.lon),
          Number(point.lat),
          Number(point.alt),
          viewer.scene.globe.ellipsoid,
          scratchCenter,
        );

        const yawRad = Cesium.Math.toRadians(Number(ePoint?.yaw || 0));

        const offsetX = -Math.sin(yawRad);
        const offsetY = -Math.cos(yawRad);

        scratchOffset.x = offsetX;
        scratchOffset.y = offsetY;
        scratchOffset.z = 0;

        Cesium.Transforms.eastNorthUpToFixedFrame(
          scratchCenter,
          viewer.scene.globe.ellipsoid,
          scratchTransform,
        );
        Cesium.Matrix4.multiplyByPoint(
          scratchTransform,
          scratchOffset,
          scratchPosition,
        );

        return scratchPosition;
      }, false) as any,
      orientation: new Cesium.CallbackProperty(() => {
        const gPoint = globalPoints[timeIndexRef.current] || globalPoints[0];
        const ePoint = enuPoints[timeIndexRef.current] || enuPoints[0];

        Cesium.Cartesian3.fromDegrees(
          Number(gPoint.lon),
          Number(gPoint.lat),
          Number(gPoint.alt),
          viewer.scene.globe.ellipsoid,
          scratchCenter,
        );

        scratchHpr.heading = Cesium.Math.toRadians(Number(ePoint?.yaw || 0));
        scratchHpr.pitch = Cesium.Math.toRadians(Number(ePoint?.pitch || 0));
        scratchHpr.roll = Cesium.Math.toRadians(Number(ePoint?.roll || 0));

        Cesium.Transforms.headingPitchRollQuaternion(
          scratchCenter,
          scratchHpr,
          viewer.scene.globe.ellipsoid,
          Cesium.Transforms.eastNorthUpToFixedFrame,
          scratchQuaternion,
        );

        return Cesium.Quaternion.multiply(
          scratchQuaternion,
          fixOffset,
          scratchQuaternion,
        );
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

    const first = globalPoints[0];
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        Number(first.lon) + 0.001, // Closer offset to the East
        Number(first.lat), // Same latitude (looking straight from the side)
        Number(first.alt) + 40, // Much lower height, closer to the drone's level
      ),
      orientation: {
        heading: Cesium.Math.toRadians(270), // Looking directly West towards the drone
        pitch: Cesium.Math.toRadians(-15), // Shallower angle, looking almost straight ahead
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

  const globalPoints = trajectory?.global?.points || [];
  const currentPoint = globalPoints[currentTimeIndex];

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

      {/* Interaction Hints */}
      <div className="absolute right-3 md:right-4 top-3 md:top-4 flex flex-col gap-1.5 z-10 pointer-events-none">
        <div className="glass-panel rounded-lg px-2.5 py-1.5 flex items-center gap-2 border-white/5 bg-[var(--uav-panel)]/80 backdrop-blur-sm">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-[var(--uav-text)] border border-white/10">
            CTRL
          </kbd>
          <span className="text-[10px] text-[var(--uav-muted)] font-bold uppercase tracking-wider">
            Rotate
          </span>
        </div>
        <div className="glass-panel rounded-lg px-2.5 py-1.5 flex items-center gap-2 border-white/5 bg-[var(--uav-panel)]/80 backdrop-blur-sm">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-[var(--uav-text)] border border-white/10">
            SHIFT
          </kbd>
          <span className="text-[10px] text-[var(--uav-muted)] font-bold uppercase tracking-wider">
            Tilt
          </span>
        </div>
      </div>

      {/* Overlay Controls */}
      <div className="absolute left-3 right-3 md:left-4 md:right-4 bottom-3 md:bottom-4 flex gap-2.5 items-end flex-wrap z-10 pointer-events-none">
        {/* Playback Control */}
        <div className="pointer-events-auto glass-panel rounded-xl p-3 flex-1 min-w-[200px] md:flex-none md:min-w-[380px] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-3 h-3 text-[var(--uav-accent)]" />
              <span className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-semibold">
                Playback
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="bg-transparent text-[10px] font-mono text-[var(--uav-text-secondary)] outline-none cursor-pointer p-0 m-0 border-none appearance-none"
                disabled={!trajectory}
              >
                <option value={0.5} className="bg-[var(--uav-panel)]">
                  0.5x
                </option>
                <option value={1} className="bg-[var(--uav-panel)]">
                  1.0x
                </option>
                <option value={2} className="bg-[var(--uav-panel)]">
                  2.0x
                </option>
                <option value={5} className="bg-[var(--uav-panel)]">
                  5.0x
                </option>
              </select>

              <button
                onClick={() => {
                  if (currentTimeIndex >= (globalPoints.length || 0) - 1) {
                    onTimeChange(0); // restart if at the end
                  }
                  setIsPlaying(!isPlaying);
                }}
                disabled={!trajectory}
                className="w-6 h-6 rounded bg-[var(--uav-primary)]/10 hover:bg-[var(--uav-primary)]/20 border border-[var(--uav-primary)]/20 flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {isPlaying ? (
                  <Pause className="w-3 h-3 text-[var(--uav-primary)]" />
                ) : (
                  <Play className="w-3 h-3 ml-0.5 text-[var(--uav-primary)]" />
                )}
              </button>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={globalPoints.length ? globalPoints.length - 1 : 0}
            value={currentTimeIndex}
            onChange={(e) => onTimeChange(Number(e.target.value))}
            className="w-full"
            disabled={globalPoints.length === 0}
          />
        </div>

        {/* Current Sample Info */}
        <div className="pointer-events-auto glass-panel rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <MapPin className="w-3 h-3 text-[var(--uav-primary)]" />
            <span className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-semibold">
              Position
            </span>
          </div>
          <div className="text-xs font-mono text-[var(--uav-text)] flex gap-3">
            {currentPoint ? (
              <>
                <span className="text-[var(--uav-text-secondary)]">
                  t:{" "}
                  <span className="text-[var(--uav-text)]">
                    {(Number(currentPoint.t) / 1e6).toFixed(2)}s
                  </span>
                </span>
                <span className="text-[var(--uav-text-secondary)]">
                  alt:{" "}
                  <span className="text-[var(--uav-primary)]">
                    {Number(currentPoint.alt).toFixed(1)}m
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[var(--uav-muted)]">No data</span>
            )}
          </div>
        </div>
      </div>

      {/* Empty state overlay */}
      {globalPoints.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center space-y-3 p-8">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mx-auto">
              <MapPin className="w-7 h-7 text-[var(--uav-muted)]/50" />
            </div>
            <div>
              <p className="text-sm text-[var(--uav-muted)] font-medium">
                No trajectory loaded
              </p>
              <p className="text-xs text-[var(--uav-muted)]/50 mt-1">
                Upload and analyze a flight log to view the 3D trajectory
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
