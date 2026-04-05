import React, { useMemo, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  Plugin,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { FlightAnalysis, Trajectory } from '@/types/analysis';
import { Mountain, Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TelemetryChartsProps {
  series: FlightAnalysis['series'];
  currentTimeIndex?: number;
  trajectory?: Trajectory | null;
}

function sampleSeries<T>(series: T[], maxPoints = 240): T[] {
  if (!series || series.length <= maxPoints) return series || [];
  const step = Math.ceil(series.length / maxPoints);
  return series.filter((_, index) => index % step === 0 || index === series.length - 1);
}

function ChartPanel({ icon: Icon, title, color, glowClass, children }: {
  icon: any; title: string; color: string; glowClass?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("glass-panel rounded-xl p-4 flex flex-col h-[240px] lg:h-full transition-all duration-300 hover:border-white/[0.12]", glowClass)}>
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className={`p-1 rounded-md ${color}`}>
          <Icon className="w-3 h-3" />
        </div>
        <h3 className="text-[10px] font-bold text-[var(--uav-text-secondary)] uppercase tracking-widest">{title}</h3>
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

function findClosestIndex<T extends { t: number | string }>(data: T[], targetT: number | null): number | null {
  if (targetT === null || data.length === 0) return null;
  let closest = 0;
  let minDiff = Math.abs(Number(data[0].t) - targetT);
  for (let i = 1; i < data.length; i++) {
    const diff = Math.abs(Number(data[i].t) - targetT);
    if (diff < minDiff) { minDiff = diff; closest = i; }
  }
  return closest;
}

// Plugin that reads current index from a ref — no re-registration needed
function makeVerticalLinePlugin(indexRef: React.MutableRefObject<number | null>): Plugin<'line'> {
  return {
    id: 'verticalLine',
    afterDraw(chart) {
      const labelIndex = indexRef.current;
      if (labelIndex === null || labelIndex < 0) return;
      const { ctx, chartArea, scales } = chart;
      const xScale = scales['x'];
      if (!xScale) return;
      const x = xScale.getPixelForValue(labelIndex);
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(107, 227, 255, 0.85)';
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    },
  };
}

// Wrapper that manages chart ref and triggers update when index changes
function TrackedLine({ data, options, lineIndex }: {
  data: any;
  options: any;
  lineIndex: number | null;
}) {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const indexRef = useRef<number | null>(lineIndex);
  const pluginRef = useRef(makeVerticalLinePlugin(indexRef));

  useEffect(() => {
    indexRef.current = lineIndex;
    if (chartRef.current) {
      chartRef.current.update('none');
    }
  }, [lineIndex]);

  return <Line ref={chartRef} data={data} options={options} plugins={[pluginRef.current]} />;
}

export function TelemetryCharts({ series, currentTimeIndex, trajectory }: TelemetryChartsProps) {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: {
        labels: {
          color: 'rgba(156, 188, 200, 0.8)',
          font: { size: 10, family: 'inherit' },
          boxWidth: 8,
          boxHeight: 8,
          borderRadius: 2,
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(13, 25, 38, 0.95)',
        titleColor: '#e0f2f7',
        bodyColor: 'rgba(139, 184, 194, 0.9)',
        borderColor: 'rgba(107, 227, 255, 0.2)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        titleFont: { size: 11, weight: 'bold' as const },
        bodyFont: { size: 10 },
        displayColors: true,
        boxWidth: 6,
        boxHeight: 6,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        ticks: { color: 'rgba(90, 138, 154, 0.6)', maxTicksLimit: 8, font: { size: 9 } },
        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
        border: { display: false },
      },
      y: {
        ticks: { color: 'rgba(90, 138, 154, 0.6)', font: { size: 9 }, padding: 8 },
        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
        border: { display: false },
      },
    },
  };

  const altitudeData = sampleSeries(series.altitude || []);
  const speedData = sampleSeries(series.imu_speed || []);
  const accelerationData = sampleSeries(series.imu_acceleration || []);

  // Get current time in seconds from trajectory
  const currentT = useMemo(() => {
    if (currentTimeIndex == null || !trajectory) return null;
    const pts = trajectory.enu?.points ?? trajectory.global?.points;
    if (!pts || pts.length === 0) return null;
    const idx = Math.min(currentTimeIndex, pts.length - 1);
    return Number(pts[idx].t) / 1e6; // microseconds → seconds
  }, [currentTimeIndex, trajectory]);

  const altitudeLineIndex = useMemo(() => findClosestIndex(altitudeData, currentT), [altitudeData, currentT]);
  const speedLineIndex = useMemo(() => findClosestIndex(speedData, currentT), [speedData, currentT]);
  const accelLineIndex = useMemo(() => findClosestIndex(accelerationData, currentT), [accelerationData, currentT]);

  const altitudeChartData = {
    labels: altitudeData.map((item) => Number(item.t).toFixed(1)),
    datasets: [{
      label: 'Altitude (m)',
      data: altitudeData.map((item) => item.value),
      borderColor: '#6be3ff',
      backgroundColor: 'rgba(107, 227, 255, 0.08)',
      tension: 0.35,
      pointRadius: 0,
      fill: true,
      borderWidth: 1.5,
    }],
  };

  const speedChartData = {
    labels: speedData.map((item) => Number(item.t).toFixed(1)),
    datasets: [
      {
        label: 'Horizontal (m/s)',
        data: speedData.map((item) => item.horizontal),
        borderColor: '#f4c95d',
        backgroundColor: 'rgba(244, 201, 93, 0.06)',
        tension: 0.3,
        pointRadius: 0,
        fill: true,
        borderWidth: 1.5,
      },
      {
        label: 'Vertical (m/s)',
        data: speedData.map((item) => item.vertical),
        borderColor: '#69d29d',
        backgroundColor: 'rgba(105, 210, 157, 0.06)',
        tension: 0.3,
        pointRadius: 0,
        fill: true,
        borderWidth: 1.5,
      },
    ],
  };

  const accelerationChartData = {
    labels: accelerationData.map((item) => Number(item.t).toFixed(1)),
    datasets: [{
      label: 'Acceleration (m/s²)',
      data: accelerationData.map((item) => item.value),
      borderColor: '#ff7b72',
      backgroundColor: 'rgba(255, 123, 114, 0.06)',
      tension: 0.25,
      pointRadius: 0,
      fill: true,
      borderWidth: 1.5,
    }],
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full">
      <ChartPanel icon={Mountain} title="Altitude vs Time" color="bg-[#6be3ff]/10 text-[var(--uav-primary)]" glowClass="hover:glow-cyan">
        <TrackedLine data={altitudeChartData} options={commonOptions} lineIndex={altitudeLineIndex} />
      </ChartPanel>
      <ChartPanel icon={TrendingUp} title="Integrated Speed" color="bg-[#6be3ff]/10 text-[var(--uav-accent)]" glowClass="hover:glow-gold">
        <TrackedLine data={speedChartData} options={commonOptions} lineIndex={speedLineIndex} />
      </ChartPanel>
      <ChartPanel icon={Zap} title="Acceleration" color="bg-[#f87171]/10 text-[var(--uav-danger)]" glowClass="hover:shadow-[0_0_30px_rgba(255,123,114,0.12)]">
        <TrackedLine data={accelerationChartData} options={commonOptions} lineIndex={accelLineIndex} />
      </ChartPanel>
    </div>
  );
}
