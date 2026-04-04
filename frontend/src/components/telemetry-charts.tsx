import React from 'react';
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
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/card';
import { FlightAnalysis } from '@/types/analysis';

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
}

function sampleSeries<T>(series: T[], maxPoints = 240): T[] {
  if (!series || series.length <= maxPoints) {
    return series || [];
  }
  const step = Math.ceil(series.length / maxPoints);
  return series.filter((_, index) => index % step === 0 || index === series.length - 1);
}

export function TelemetryCharts({ series }: TelemetryChartsProps) {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { labels: { color: '#eef6f8' } },
    },
    scales: {
      x: {
        ticks: { color: '#8eb1bc', maxTicksLimit: 10 },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
      y: {
        ticks: { color: '#8eb1bc' },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
    },
  };

  const altitudeData = sampleSeries(series.altitude || []);
  const speedData = sampleSeries(series.imu_speed || []);
  const accelerationData = sampleSeries(series.imu_acceleration || []);

  const altitudeChartData = {
    labels: altitudeData.map((item) => Number(item.t).toFixed(1)),
    datasets: [
      {
        label: 'Altitude (m)',
        data: altitudeData.map((item) => item.value),
        borderColor: '#6be3ff',
        backgroundColor: 'rgba(107, 227, 255, 0.18)',
        tension: 0.28,
        pointRadius: 0,
        fill: true,
      },
    ],
  };

  const speedChartData = {
    labels: speedData.map((item) => Number(item.t).toFixed(1)),
    datasets: [
      {
        label: 'Horizontal (m/s)',
        data: speedData.map((item) => item.horizontal),
        borderColor: '#f4c95d',
        backgroundColor: 'rgba(244, 201, 93, 0.18)',
        tension: 0.24,
        pointRadius: 0,
        fill: true,
      },
      {
        label: 'Vertical (m/s)',
        data: speedData.map((item) => item.vertical),
        borderColor: '#69d29d',
        backgroundColor: 'rgba(105, 210, 157, 0.16)',
        tension: 0.24,
        pointRadius: 0,
        fill: true,
      },
    ],
  };

  const accelerationChartData = {
    labels: accelerationData.map((item) => Number(item.t).toFixed(1)),
    datasets: [
      {
        label: 'Acceleration (m/s²)',
        data: accelerationData.map((item) => item.value),
        borderColor: '#ff7b72',
        backgroundColor: 'rgba(255, 123, 114, 0.18)',
        tension: 0.18,
        pointRadius: 0,
        fill: true,
      },
    ],
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
      <Card className="p-4 bg-[#10212b]/90 border-white/10 flex flex-col h-[300px]">
        <h3 className="text-xs font-bold text-[#8eb1bc] uppercase tracking-widest mb-2">Altitude vs Time</h3>
        <div className="flex-1 min-h-0">
          <Line data={altitudeChartData} options={commonOptions} />
        </div>
      </Card>
      <Card className="p-4 bg-[#10212b]/90 border-white/10 flex flex-col h-[300px]">
        <h3 className="text-xs font-bold text-[#8eb1bc] uppercase tracking-widest mb-2">Integrated Speed</h3>
        <div className="flex-1 min-h-0">
          <Line data={speedChartData} options={commonOptions} />
        </div>
      </Card>
      <Card className="p-4 bg-[#10212b]/90 border-white/10 flex flex-col h-[300px]">
        <h3 className="text-xs font-bold text-[#8eb1bc] uppercase tracking-widest mb-2">Acceleration</h3>
        <div className="flex-1 min-h-0">
          <Line data={accelerationChartData} options={commonOptions} />
        </div>
      </Card>
    </div>
  );
}
