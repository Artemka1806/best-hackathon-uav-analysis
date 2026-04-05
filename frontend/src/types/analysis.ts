export interface Point {
  t: number | string;
  lat: number | string;
  lon: number | string;
  alt: number | string;
  yaw?: number | string;
  pitch?: number | string;
  roll?: number | string;
}

export interface Trajectory {
  points: Point[];
  speed_series?: { t: number | string; value: number }[];
}

export interface Metric {
  flight_duration_s: number;
  total_distance_m: number;
  max_altitude_gain_m: number;
  max_horizontal_speed_mps: number;
  max_vertical_speed_mps: number;
  max_acceleration_mps2: number;
}

export interface Sampling {
  gps_hz: number;
  imu_hz: number;
}

export interface FlightAnalysis {
  filename: string;
  ai_context_toon: any;
  metrics: Metric;
  sampling: Sampling;
  summary: {
    warnings: string[];
    anomalies: string[];
  };
  raw_preview: {
    available_messages: string[];
  };
  series: {
    altitude: { t: number | string; value: number }[];
    imu_speed: { t: number | string; horizontal: number; vertical: number }[];
    imu_acceleration: { t: number | string; value: number }[];
  };
  trajectory: Trajectory;
  parameters?: { name: string; value: number | string }[];
  flight_modes?: { t_s: number; mode: string; mode_num?: number }[];
  errors?: { t_s: number; subsys: number; ecode: number }[];
  battery?: { t_s: number; volt?: number; curr?: number; consumed_mah?: number }[];
  gps_quality?: { t_s: number; fix?: number; hdop?: number; sats?: number }[];
  attitude?: { t_s: number; roll_deg: number; pitch_deg: number; yaw_deg: number }[];
}

export interface ChatMessage {
  type: 'start' | 'chunk' | 'done' | 'error' | 'init' | 'question';
  text?: string;
  message?: string;
  filename?: string;
  ai_context_toon?: any;
  question?: string;
}
