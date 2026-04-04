import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CesiumViewer } from '@/components/cesium-viewer';
import { TelemetryCharts } from '@/components/telemetry-charts';
import { AiDebrief } from '@/components/ai-debrief';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { FlightAnalysis } from '@/types/analysis';
import {
  Loader2, Upload, AlertTriangle, Info, Gauge, Menu,
  Plane, Clock, Route, Mountain, Zap, Activity, Radio,
  ChevronRight, Sparkles, BarChart3, MessageSquare,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

function MetricCard({ icon: Icon, label, value, color, glowClass, delay = 0 }: {
  icon: any; label: string; value: string; color: string; glowClass?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.3, ease: 'easeOut' }}
      className={cn(
        "group relative overflow-hidden rounded-lg glass-panel transition-all duration-200 border-white/5",
        glowClass,
      )}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--uav-muted)] font-bold">{label}</span>
          <div className={cn("p-1 rounded", color)}>
            <Icon size={12} />
          </div>
        </div>
        <div className="text-xl font-black tracking-tighter text-[var(--uav-text)] font-mono">{value}</div>
      </div>
    </motion.div>
  );
}

function StatusIndicator({ isAnalyzing, hasAnalysis }: { isAnalyzing: boolean; hasAnalysis: boolean }) {
  return (
    <motion.div
      layout
      className={cn(
        "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-all duration-300",
        isAnalyzing && "bg-[var(--uav-primary)]/5 border-[var(--uav-primary)]/20 text-[var(--uav-primary)]",
        !isAnalyzing && hasAnalysis && "bg-[var(--uav-success)]/5 border-[var(--uav-success)]/20 text-[var(--uav-success)]",
        !isAnalyzing && !hasAnalysis && "bg-white/[0.02] border-white/5 text-[var(--uav-muted)]",
      )}
    >
      <div className={cn(
        "w-1.5 h-1.5 rounded-full shrink-0",
        isAnalyzing && "bg-[var(--uav-primary)] animate-pulse shadow-[0_0_6px_rgba(107,227,255,0.5)]",
        !isAnalyzing && hasAnalysis && "bg-[var(--uav-success)] shadow-[0_0_6px_rgba(105,210,157,0.5)]",
        !isAnalyzing && !hasAnalysis && "bg-[var(--uav-muted)]/40",
      )} />
      {isAnalyzing ? 'Parsing telemetry & computing metrics...' : (hasAnalysis ? 'Analysis complete — data ready' : 'Upload a .BIN log file to begin')}
    </motion.div>
  );
}

function SidebarContent({
  file, setFile, colorMode, setColorMode, isAnalyzing, analysis, handleAnalyze, formatValue,
}: any) {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[var(--uav-accent)]/10 border border-[var(--uav-accent)]/20 glow-gold">
            <Plane className="w-4.5 h-4.5 text-[var(--uav-accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--uav-text)]">UAV Analysis</h1>
            <p className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest">Telemetry & AI Debrief</p>
          </div>
        </div>
      </div>

      <Separator className="bg-white/5" />

      {/* Upload Card */}
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] text-[var(--uav-text-secondary)] uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Upload className="w-3 h-3" /> Flight Log
          </label>
          <Input
            type="file"
            accept=".bin,.BIN"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (e.target.files?.[0]) setFile(e.target.files[0]);
            }}
            className="bg-[var(--uav-bg-subtle)] border-white/5 text-xs h-10 file:text-[var(--uav-text-secondary)] file:text-[10px] file:font-medium file:bg-transparent file:border-0 hover:border-white/10 transition-colors cursor-pointer"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] text-[var(--uav-text-secondary)] uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Color Mode
            </label>
            <Select value={colorMode} onValueChange={setColorMode}>
              <SelectTrigger className="bg-[var(--uav-bg-subtle)] border-white/5 h-10 text-xs hover:border-white/10 transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--uav-panel)] border-white/10 text-[var(--uav-text)]">
                <SelectItem value="speed">Speed</SelectItem>
                <SelectItem value="time">Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !file}
              className="h-10 px-5 bg-gradient-to-r from-[var(--uav-accent)] to-[#e0b840] hover:from-[var(--uav-accent-hover)] hover:to-[#f0c850] text-[#152028] font-bold text-xs glow-gold-strong hover:glow-gold-strong transition-all duration-300 disabled:opacity-40 disabled:shadow-none"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Analyze</>}
            </Button>
          </div>
        </div>

        <StatusIndicator isAnalyzing={isAnalyzing} hasAnalysis={!!analysis} />
      </div>

      <Separator className="bg-white/5" />

      {/* Tabbed content: AI / Metrics */}
      <Tabs defaultValue="ai" className="flex-1 flex flex-col min-h-0">
        <TabsList className="bg-[var(--uav-bg-subtle)] border border-white/5 p-1 h-auto shrink-0">
          <TabsTrigger value="ai" className="text-xs data-[state=active]:bg-[var(--uav-panel)] data-[state=active]:text-[var(--uav-primary)] data-[state=active]:shadow-[0_0_12px_rgba(107,227,255,0.15)] gap-1.5 px-3 py-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> AI Debrief
          </TabsTrigger>
          <TabsTrigger value="metrics" className="text-xs data-[state=active]:bg-[var(--uav-panel)] data-[state=active]:text-[var(--uav-accent)] data-[state=active]:shadow-[0_0_12px_rgba(244,201,93,0.15)] gap-1.5 px-3 py-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent forceMount value="ai" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden">
          <div className="h-full rounded-xl glass-panel overflow-hidden">
            <AiDebrief analysis={analysis} />
          </div>
        </TabsContent>

        <TabsContent forceMount value="metrics" className="flex-1 min-h-0 mt-3 overflow-y-auto no-scrollbar data-[state=inactive]:hidden">
          <div className="space-y-4">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard icon={Clock} label="Duration" value={formatValue(analysis?.metrics.flight_duration_s, 1, 's')} color="bg-[var(--uav-primary)]/10 text-[var(--uav-primary)]" glowClass="hover:glow-cyan" delay={0} />
              <MetricCard icon={Route} label="Distance" value={formatValue(analysis?.metrics.total_distance_m, 1, 'm')} color="bg-[var(--uav-success)]/10 text-[var(--uav-success)]" glowClass="hover:shadow-[0_0_30px_rgba(105,210,157,0.15)]" delay={0.05} />
              <MetricCard icon={Mountain} label="Max Alt" value={formatValue(analysis?.metrics.max_altitude_gain_m, 1, 'm')} color="bg-[var(--uav-accent)]/10 text-[var(--uav-accent)]" glowClass="hover:glow-gold" delay={0.1} />
              <MetricCard icon={Zap} label="Max Speed" value={formatValue(analysis?.metrics.max_horizontal_speed_mps, 2, 'm/s')} color="bg-[var(--uav-danger)]/10 text-[var(--uav-danger)]" glowClass="hover:shadow-[0_0_30px_rgba(255,123,114,0.15)]" delay={0.15} />
            </div>

            {/* Warnings */}
            <div className="space-y-2">
              <h3 className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Warnings & Anomalies
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {analysis?.summary.warnings.length || analysis?.summary.anomalies.length ? (
                  <>
                    {analysis?.summary.warnings.map((w: string, i: number) => (
                      <Badge key={`w-${i}`} variant="outline" className="bg-[var(--uav-danger)]/5 border-[var(--uav-danger)]/15 text-red-300 text-[10px] py-0.5 font-medium gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> {w}
                      </Badge>
                    ))}
                    {analysis?.summary.anomalies.map((a: string, i: number) => (
                      <Badge key={`a-${i}`} variant="outline" className="bg-[var(--uav-accent)]/5 border-[var(--uav-accent)]/15 text-orange-300 text-[10px] py-0.5 font-medium gap-1">
                        <Info className="w-2.5 h-2.5" /> {a}
                      </Badge>
                    ))}
                  </>
                ) : (
                  <span className="text-[11px] text-[var(--uav-muted)] italic">No warnings detected</span>
                )}
              </div>
            </div>

            {/* Messages & Sampling */}
            <div className="space-y-2">
              <h3 className="text-[10px] text-[var(--uav-muted)] uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Radio className="w-3 h-3" /> Telemetry Data
              </h3>
              <div className="flex flex-wrap gap-1">
                {analysis?.raw_preview.available_messages.slice(0, 15).map((m: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/5 text-[10px] text-[var(--uav-text-secondary)] font-mono">
                    {m}
                  </span>
                ))}
              </div>
              {analysis && (
                <div className="text-[10px] font-mono text-[var(--uav-muted)] flex items-center gap-4 mt-1.5">
                  <span className="flex items-center gap-1"><Gauge className="w-3 h-3 text-[var(--uav-primary)]" /> GPS: {formatValue(analysis.sampling.gps_hz, 1, 'Hz')}</span>
                  <span className="flex items-center gap-1"><Gauge className="w-3 h-3 text-[var(--uav-accent)]" /> IMU: {formatValue(analysis.sampling.imu_hz, 1, 'Hz')}</span>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function FlightAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(null);
  const [colorMode, setColorMode] = useState<'speed' | 'time'>('speed');
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);

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
    <div className="flex flex-col lg:flex-row h-screen w-full overflow-hidden relative">
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-32 right-1/4 w-[700px] h-[700px] rounded-full blur-[180px] animate-glow-pulse" style={{ background: 'radial-gradient(circle, var(--uav-primary) 0%, transparent 70%)', opacity: 0.08 }} />
        <div className="absolute -bottom-32 left-1/6 w-[600px] h-[600px] rounded-full blur-[180px] animate-glow-pulse-gold" style={{ background: 'radial-gradient(circle, var(--uav-accent) 0%, transparent 70%)', opacity: 0.06 }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[200px]" style={{ background: 'radial-gradient(circle, var(--uav-primary) 0%, transparent 70%)', opacity: 0.03 }} />
      </div>

      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-3 glass-panel z-50 relative">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[var(--uav-accent)]/10 border border-[var(--uav-accent)]/20 glow-gold">
            <Plane className="w-4 h-4 text-[var(--uav-accent)]" />
          </div>
          <h1 className="text-base font-bold tracking-tight">UAV Analysis</h1>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-white/5">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[360px] bg-[var(--uav-bg)] border-r border-white/5 p-4 overflow-y-auto" aria-describedby={undefined}>
            <VisuallyHidden.Root><SheetTitle>UAV Analysis Controls</SheetTitle></VisuallyHidden.Root>
            <SidebarContent
              file={file} setFile={setFile}
              colorMode={colorMode} setColorMode={setColorMode}
              isAnalyzing={isAnalyzing} analysis={analysis}
              handleAnalyze={handleAnalyze} formatValue={formatValue}
            />
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[380px] shrink-0 flex-col p-4 overflow-y-auto no-scrollbar relative z-10 border-r border-white/5">
        <SidebarContent
          file={file} setFile={setFile}
          colorMode={colorMode} setColorMode={setColorMode}
          isAnalyzing={isAnalyzing} analysis={analysis}
          handleAnalyze={handleAnalyze} formatValue={formatValue}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-3 min-w-0 p-3 lg:p-4 overflow-y-auto lg:overflow-hidden relative z-10">
        {/* Cesium Viewer */}
        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn(
            "flex-1 min-h-[360px] lg:min-h-0 relative rounded-2xl transition-all duration-1000",
            isAnalyzing && "glow-cyan-border animate-glow-pulse"
          )}
        >
          <CesiumViewer
            trajectory={analysis?.trajectory || null}
            colorMode={colorMode}
            currentTimeIndex={currentTimeIndex}
            onTimeChange={setCurrentTimeIndex}
          />
        </motion.section>

        {/* Telemetry Charts */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
          className="lg:h-[260px] shrink-0"
        >
          <TelemetryCharts series={analysis?.series || { altitude: [], imu_speed: [], imu_acceleration: [] }} />
        </motion.section>
      </main>
    </div>
  );
}
