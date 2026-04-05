import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Line, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Trajectory, EnuPoint } from '@/types/analysis';
import { BorderBeam } from '@/components/ui/border-beam';
import { MapPin, Timer, Play, Pause, Box } from 'lucide-react';
import droneModelUrl from '@/assets/drone.glb';

interface EnuViewerProps {
  trajectory: Trajectory | null;
  colorMode: 'speed' | 'time';
  currentTimeIndex: number;
  onTimeChange: (index: number) => void;
}

function DroneModel({ enuPoint }: { enuPoint: EnuPoint | undefined }) {
  const { scene } = useGLTF(droneModelUrl);
  const droneRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!droneRef.current || !enuPoint) return;
    
    // ENU: x = East, y = North, z = Up. 
    // Three.js: x = Right, y = Up, z = Forward/Backward.
    // Let's map ENU to Three.js: x = East(e), y = Up(u), z = -North(-n).
    droneRef.current.position.set(enuPoint.e, enuPoint.u, -enuPoint.n);

    // Apply rotation. Three.js default Euler order is XYZ.
    // Assuming yaw is around UP (y), pitch is around RIGHT (x), roll is around FORWARD (-z)
    const yaw = Number(enuPoint.yaw || 0) * (Math.PI / 180);
    const pitch = Number(enuPoint.pitch || 0) * (Math.PI / 180);
    const roll = Number(enuPoint.roll || 0) * (Math.PI / 180);
    
    // We might need to adjust rotation order/signs depending on the model's forward direction.
    // Usually yaw is applied first.
    droneRef.current.rotation.set(pitch, -yaw, roll, 'YXZ');

  }, [enuPoint]);

  return <primitive ref={droneRef} object={scene} scale={2} />;
}

export function EnuViewer({ trajectory, colorMode, currentTimeIndex, onTimeChange }: EnuViewerProps) {
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

  const enuPoints = trajectory?.enu?.points || [];

  useEffect(() => {
    if (!isPlaying || !trajectory || enuPoints.length === 0) return;

    let animationFrameId: number;
    let lastRealTime = performance.now();
    
    let internalIndex = timeIndexRef.current;
    let internalSimTime = Number(enuPoints[internalIndex].t) / 1e6;
    let lastSetIndex = internalIndex;

    const loop = (time: number) => {
      if (timeIndexRef.current !== lastSetIndex) {
        internalIndex = timeIndexRef.current;
        internalSimTime = Number(enuPoints[internalIndex].t) / 1e6;
        lastSetIndex = internalIndex;
        lastRealTime = time;
      }

      const deltaMs = time - lastRealTime;
      lastRealTime = time;

      const dt = (deltaMs / 1000) * speedRef.current;
      internalSimTime += dt;

      let nextIndex = internalIndex;
      while (nextIndex < enuPoints.length - 1) {
        const pointTime = Number(enuPoints[nextIndex + 1].t) / 1e6;
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
      }

      if (internalIndex >= enuPoints.length - 1) {
        setIsPlaying(false);
        return;
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, trajectory, enuPoints]);

  const currentPoint = enuPoints[currentTimeIndex];

  const getMetricColor = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return '#6be3ff';
    }
    const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
    const hue = Math.floor((1 - normalized) * 223); // 223 is ~blue, 0 is red
    return `hsl(${hue}, 82%, 52%)`;
  };

  const { positions, colors } = useMemo(() => {
    if (!trajectory || enuPoints.length === 0) return { positions: [], colors: [] };

    const speedSeries = trajectory.speed_series || [];
    const speedLookup = new Map(speedSeries.map(item => [Number(item.t).toFixed(3), item.value]));

    const values = enuPoints.map((point, index) => {
      if (colorMode === 'time') return index;
      const key = (Number(point.t) / 1e6).toFixed(3);
      return speedLookup.get(key) ?? 0;
    });

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const pos: THREE.Vector3[] = [];
    const cols: THREE.Color[] = [];

    enuPoints.forEach((p, i) => {
      pos.push(new THREE.Vector3(p.e, p.u, -p.n));
      cols.push(new THREE.Color(getMetricColor(values[i], minValue, maxValue)));
    });

    return { positions: pos, colors: cols };
  }, [trajectory, enuPoints, colorMode]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-[var(--uav-border)] group animate-glow-pulse bg-[#02050A]">
      <BorderBeam
        size={300}
        duration={8}
        colorFrom="var(--uav-primary)"
        colorTo="var(--uav-accent)"
        delay={0}
      />

      <div className="absolute inset-0 w-full h-full cursor-move">
        <Canvas camera={{ position: [50, 50, 50], fov: 50 }}>
          <color attach="background" args={['#02050A']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={1.5} />
          <Environment preset="city" />
          
          <Grid infiniteGrid fadeDistance={200} sectionColor="#4a6d7a" cellColor="#1e3440" />

          {positions.length > 0 && (
            <Line
              points={positions}
              color="white"
              vertexColors={colors}
              lineWidth={3}
            />
          )}

          {currentPoint && <DroneModel enuPoint={currentPoint} />}

          <OrbitControls makeDefault target={[
            currentPoint?.e || 0,
            currentPoint?.u || 0,
            -(currentPoint?.n || 0)
          ]} />
        </Canvas>
      </div>

      {/* Overlay Controls */}
      <div className="absolute left-3 right-3 md:left-4 md:right-4 bottom-3 md:bottom-4 flex gap-2.5 items-end flex-wrap z-10 pointer-events-none">
        {/* Playback Control */}
        <div className="pointer-events-auto glass-panel rounded-xl p-3 flex-1 min-w-[200px] md:flex-none md:min-w-[380px] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-3 h-3 text-[var(--uav-accent)]" />
              <span className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-semibold">Playback (3D Local)</span>
            </div>
            
            <div className="flex items-center gap-2">
              <select 
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="bg-transparent text-[10px] font-mono text-[var(--uav-text-secondary)] outline-none cursor-pointer p-0 m-0 border-none appearance-none"
                disabled={!trajectory}
              >
                <option value={0.5} className="bg-[var(--uav-panel)]">0.5x</option>
                <option value={1} className="bg-[var(--uav-panel)]">1.0x</option>
                <option value={2} className="bg-[var(--uav-panel)]">2.0x</option>
                <option value={5} className="bg-[var(--uav-panel)]">5.0x</option>
              </select>
              
              <button 
                onClick={() => {
                  if (currentTimeIndex >= (enuPoints.length || 0) - 1) {
                    onTimeChange(0); // restart if at the end
                  }
                  setIsPlaying(!isPlaying);
                }}
                disabled={!trajectory}
                className="w-6 h-6 rounded bg-[var(--uav-primary)]/10 hover:bg-[var(--uav-primary)]/20 border border-[var(--uav-primary)]/20 flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {isPlaying ? <Pause className="w-3 h-3 text-[var(--uav-primary)]" /> : <Play className="w-3 h-3 ml-0.5 text-[var(--uav-primary)]" />}
              </button>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={enuPoints.length ? enuPoints.length - 1 : 0}
            value={currentTimeIndex}
            onChange={(e) => onTimeChange(Number(e.target.value))}
            className="w-full"
            disabled={!trajectory}
          />
        </div>

        {/* Current Sample Info */}
        <div className="pointer-events-auto glass-panel rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Box className="w-3 h-3 text-[var(--uav-primary)]" />
            <span className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-semibold">Local ENU Position</span>
          </div>
          <div className="text-xs font-mono text-[var(--uav-text)] flex gap-3">
            {currentPoint ? (
              <>
                <span className="text-[var(--uav-text-secondary)]">E: <span className="text-[var(--uav-text)]">{Number(currentPoint.e).toFixed(1)}m</span></span>
                <span className="text-[var(--uav-text-secondary)]">N: <span className="text-[var(--uav-text)]">{Number(currentPoint.n).toFixed(1)}m</span></span>
                <span className="text-[var(--uav-text-secondary)]">U: <span className="text-[var(--uav-primary)]">{Number(currentPoint.u).toFixed(1)}m</span></span>
              </>
            ) : (
              <span className="text-[var(--uav-muted)]">No data</span>
            )}
          </div>
        </div>
      </div>

      {!trajectory && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center space-y-3 p-8">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mx-auto">
              <Box className="w-7 h-7 text-[var(--uav-muted)]/50" />
            </div>
            <div>
              <p className="text-sm text-[var(--uav-muted)] font-medium">No trajectory loaded</p>
              <p className="text-xs text-[var(--uav-muted)]/50 mt-1">Upload and analyze a flight log to view the 3D local trajectory</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
