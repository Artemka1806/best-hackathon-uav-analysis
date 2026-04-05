#pragma once

#include <vector>
#include <string>

/**
 * @brief Represents a point in Earth-Centered, Earth-Fixed (ECEF) coordinates.
 * Computed from WGS-84 latitude, longitude, and altitude.
 */
struct EcefPoint {
    double x{};
    double y{};
    double z{};
};

/**
 * @brief Represents a single GPS measurement in global coordinates.
 */
struct GpsSample {
    double time_s{};
    double lat_deg{};
    double lon_deg{};
    double alt_m{};
};

/**
 * @brief Contains cleaned GPS data after filtering multipath/teleportation anomalies.
 * @warning The warnings are stored as standard strings to keep this struct free 
 * of Python dependencies, allowing for pure C++ multithreading and testing.
 */
struct CleanGpsData {
    std::vector<GpsSample> samples;
    std::vector<std::string> warnings; 
    double total_distance_m{};
};

/**
 * @brief Represents a single Attitude (3D orientation) measurement.
 */
struct AttSample {
    double time_s{};
    double roll_deg{};
    double pitch_deg{};
    double yaw_deg{};
};

/**
 * @brief Represents a single IMU (accelerometer) measurement.
 */
struct ImuSample {
    double time_s{};
    double acc_e{};
    double acc_n{};
    double acc_u{};
};

/**
 * @brief Represents battery telemetry at a specific timestamp.
 */
struct BatSample {
    double time_s{};
    double volt{};
    double curr{};
    double consumed_mah{};
};