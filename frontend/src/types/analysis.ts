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
}

export interface ChatMessage {
  type: 'start' | 'chunk' | 'done' | 'error' | 'init' | 'question';
  text?: string;
  message?: string;
  filename?: string;
  ai_context_toon?: any;
  question?: string;
}
