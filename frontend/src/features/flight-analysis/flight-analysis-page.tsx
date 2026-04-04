import React, { useState } from 'react';
import { CesiumViewer } from '@/components/cesium-viewer';
import { TelemetryCharts } from '@/components/telemetry-charts';
import { AiDebrief } from '@/components/ai-debrief';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FlightAnalysis } from '@/types/analysis';
import { Loader2, Upload, AlertTriangle, Info, Gauge, Menu, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

export function FlightAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(null);
  const [colorMode, setColorMode] = useState<'speed' | 'time'>('speed');
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast.error('Please select a .BIN flight log file');
      return;
    }

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data);
      setCurrentTimeIndex(0);
      toast.success('Analysis complete');
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatValue = (value: number | undefined, digits = 2, unit = '') => {
    if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
    return `${value.toFixed(digits)} ${unit}`;
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#09131a] text-[#eef6f8] overflow-hidden">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-3 bg-[#10212b] border-b border-white/10 z-50">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold tracking-tight">UAV Analysis</h1>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </Button>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-0 lg:relative lg:inset-auto z-40 lg:z-auto w-full lg:w-[360px] bg-[#09131a] lg:bg-transparent flex flex-col transition-transform duration-300 ease-in-out p-3 gap-3 overflow-y-auto shrink-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="hidden lg:block mb-1">
          <h1 className="text-2xl font-bold tracking-tight leading-tight">UAV Mission Analysis</h1>
          <p className="text-[11px] text-[#8eb1bc] uppercase tracking-wider opacity-80">Real-time telemetry & AI debriefing</p>
        </div>

        <Card className="p-3 bg-[#10212b]/90 border-white/10 flex flex-col gap-3 shadow-xl">
          <div className="space-y-1.5">
            <label className="text-[9px] text-[#8eb1bc] uppercase tracking-widest font-semibold">Flight Log (.BIN)</label>
            <Input 
              type="file" 
              accept=".bin,.BIN" 
              onChange={handleFileChange}
              className="bg-[#0b171f] border-white/10 text-xs h-9 file:text-[#eef6f8] file:text-[10px]"
            />
          </div>
          
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-[9px] text-[#8eb1bc] uppercase tracking-widest font-semibold">Color Mode</label>
              <Select value={colorMode} onValueChange={(v: any) => setColorMode(v)}>
                <SelectTrigger className="bg-[#0b171f] border-white/10 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#10212b] border-white/10 text-[#eef6f8]">
                  <SelectItem value="speed">Speed</SelectItem>
                  <SelectItem value="time">Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleAnalyze} 
              disabled={isAnalyzing || !file}
              className="mt-auto h-9 bg-[#f4c95d] hover:bg-[#da8f3b] text-[#152028] font-bold text-xs"
            >
              {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              Analyze
            </Button>
          </div>

          <div className={cn(
            "p-2 rounded-lg text-[10px] font-medium border transition-colors",
            analysis ? "bg-[#69d29d]/10 border-[#69d29d]/20 text-[#d9ffeb]" : "bg-[#6be3ff]/10 border-[#6be3ff]/20 text-[#d3f7ff]"
          )}>
            {isAnalyzing ? 'Parsing telemetry & computing metrics...' : (analysis ? 'Analysis ready' : 'Select a .BIN file to start analysis')}
          </div>
        </Card>

        {/* AI Debrief */}
        <Card className="p-3 bg-[#10212b]/90 border-white/10 shrink-0 h-[480px] overflow-hidden shadow-xl">
          <AiDebrief analysis={analysis} />
        </Card>

        {/* Metrics */}
        <section className="space-y-2">
          <h3 className="text-[9px] text-[#8eb1bc] uppercase tracking-widest font-bold px-1">Mission Metrics</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Duration', value: formatValue(analysis?.metrics.flight_duration_s, 1, 's') },
              { label: 'Distance', value: formatValue(analysis?.metrics.total_distance_m, 1, 'm') },
              { label: 'Max Alt', value: formatValue(analysis?.metrics.max_altitude_gain_m, 1, 'm') },
              { label: 'Max Speed', value: formatValue(analysis?.metrics.max_horizontal_speed_mps, 2, 'm/s') },
            ].map((m, i) => (
              <Card key={i} className="p-2.5 bg-gradient-to-b from-[#163241]/90 to-[#0b171f]/98 border-white/10 shadow-lg">
                <div className="text-[9px] text-[#8eb1bc] uppercase tracking-tighter font-semibold">{m.label}</div>
                <div className="text-base font-bold mt-0.5 leading-none">{m.value}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* Warnings */}
        <section className="space-y-2">
          <h3 className="text-[9px] text-[#8eb1bc] uppercase tracking-widest font-bold px-1">Warnings & Anomalies</h3>
          <div className="flex flex-wrap gap-1.5 px-0.5">
            {analysis?.summary.warnings.length || analysis?.summary.anomalies.length ? (
              <>
                {analysis?.summary.warnings.map((w, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-200 text-[9px] flex items-center gap-1 font-medium">
                    <AlertTriangle size={10} /> {w}
                  </span>
                ))}
                {analysis?.summary.anomalies.map((a, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-200 text-[9px] flex items-center gap-1 font-medium">
                    <Info size={10} /> {a}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-[10px] text-[#8eb1bc] italic px-1 opacity-70">No warnings detected</span>
            )}
          </div>
        </section>

        {/* Messages */}
        <section className="space-y-2 pb-2">
          <h3 className="text-[9px] text-[#8eb1bc] uppercase tracking-widest font-bold px-1">Messages & Sampling</h3>
          <div className="flex flex-wrap gap-1 px-0.5">
            {analysis?.raw_preview.available_messages.slice(0, 15).map((m, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] text-[#8eb1bc] font-medium">
                {m}
              </span>
            ))}
          </div>
          <div className="text-[9px] font-mono text-[#8eb1bc] flex items-center gap-3 px-1 mt-1 opacity-80">
            <span className="flex items-center gap-1"><Gauge size={10} /> GPS: {formatValue(analysis?.sampling.gps_hz, 1, 'Hz')}</span>
            <span className="flex items-center gap-1"><Gauge size={10} /> IMU: {formatValue(analysis?.sampling.imu_hz, 1, 'Hz')}</span>
          </div>
        </section>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-3 min-w-0 p-2 lg:p-3 overflow-y-auto lg:overflow-hidden">
        <section className="flex-1 min-h-[360px] lg:min-h-0 relative">
          <CesiumViewer 
            trajectory={analysis?.trajectory || null} 
            colorMode={colorMode}
            currentTimeIndex={currentTimeIndex}
            onTimeChange={setCurrentTimeIndex}
          />
        </section>
        <section className="lg:h-[280px] shrink-0">
          <TelemetryCharts series={analysis?.series || { altitude: [], imu_speed: [], imu_acceleration: [] }} />
        </section>
      </main>
    </div>
  );
}
