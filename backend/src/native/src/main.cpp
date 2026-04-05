/**
 * @file main.cpp
 * @brief Python binding entry point for the ArduPilot log parser.
 * Orchestrates the parsing, pure C++ business logic, and Python serialization.
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <string_view>
#include <stdexcept>
#include <algorithm>
#include <set>
#include <vector>

#include "types.hpp"
#include "math_utils.hpp"
#include "bin_parser.hpp"
#include "flight_analysis.hpp"
#include "pybind_formatters.hpp"

namespace py = pybind11;
using namespace pybind11::literals;

namespace {

/**
 * @brief Helper function to compute GPS sampling rate.
 */
py::object compute_gps_sampling_hz(const std::vector<GpsSample>& gps_samples) {
    std::vector<double> times;
    times.reserve(gps_samples.size());
    for (const auto& sample : gps_samples) {
        times.push_back(sample.time_s);
    }
    
    std::vector<double> deltas = monotonic_deltas(times);
    double dt = median_of(deltas);
    
    if (dt > 0.0 && !std::isnan(dt)) {
        return py::float_(1.0 / dt);
    }
    return py::none();
}

} // namespace

/**
 * @brief Parses an ArduPilot Dataflash .bin log from raw bytes into a Python dictionary.
 * @param data Raw binary bytes of the .bin file.
 * @return py::dict A Python dictionary representing all parsed messages.
 */
py::dict parse_ardupilot_bin(py::bytes data) {
    std::string_view buf = data;
    auto formats = collect_formats(buf, std::nullopt);
    return formats_to_python(formats);
}

/**
 * @brief Runs full flight analysis, sensor fusion, and trajectory building in a single pass.
 * @param data Raw binary bytes of the .bin file.
 * @return py::dict A complex Python dictionary with analysis results for the frontend.
 */
py::dict analyze_flight_log(py::bytes data) {
    std::string_view buf = data;
    auto formats = collect_formats(buf, std::set<std::string>{
        "GPS", "GPS2", "ATT", "AHR2", "IMU", "IMU2", "IMU3",
        "PARM", "MODE", "ERR", "BAT", "CURR"
    });

    const FormatDef* gps_fmt  = find_message(formats, {"GPS", "GPS2"});
    if (!gps_fmt) {
        throw std::runtime_error("No GPS message found in log");
    }

    const FormatDef* att_fmt  = find_message(formats, {"ATT", "AHR2"});
    const FormatDef* imu_fmt  = find_message(formats, {"IMU", "IMU2", "IMU3"});
    const FormatDef* parm_fmt = find_message(formats, {"PARM"});
    const FormatDef* mode_fmt = find_message(formats, {"MODE"});
    const FormatDef* err_fmt  = find_message(formats, {"ERR"});
    const FormatDef* bat_fmt  = find_message(formats, {"BAT", "CURR"});

    // 1. Process GPS with self-healing anomaly filter
    std::vector<GpsSample> raw_gps = build_gps_samples(*gps_fmt);
    CleanGpsData clean_gps = clean_gps_anomalies(raw_gps);
    const std::vector<GpsSample>& gps_samples = clean_gps.samples;

    if (gps_samples.empty()) {
        throw std::runtime_error("No valid GPS samples left after filtering anomalies");
    }

    // 2. Process Attitude and Trajectory
    std::vector<AttSample> att_samples = build_att_samples(att_fmt);
    py::dict trajectory = build_trajectory_payload(gps_samples, att_samples);

    double altitude_gain_m = 0.0;
    double start_alt_m = gps_samples.front().alt_m;
    for (const auto& sample : gps_samples) {
        altitude_gain_m = std::max(altitude_gain_m, sample.alt_m - start_alt_m);
    }

    // 3. Process IMU and run Sensor Fusion (Kalman Filter)
    py::list warnings;
    py::object imu_sampling = py::none();
    py::object max_h_speed = py::none();
    py::object max_v_speed = py::none();
    py::object max_acc = py::none();
    
    py::list imu_speed_series;
    py::list imu_acc_series;
    py::object kf_altitude_series = py::none();

    py::object imu_message_name = py::none();
    
    // Pure C++ values for anomaly detection
    double c_max_h = 0.0;
    double c_max_v = 0.0;
    double c_max_acc = 0.0;

    if (imu_fmt) {
        imu_message_name = py::str(imu_fmt->name);
        try {
            std::vector<ImuSample> imu_samples = build_imu_samples(*imu_fmt, att_samples);
            
            // Execute Pure C++ Kalman Filter Analysis
            ImuAnalysisResult imu_analysis = analyze_imu_series(imu_samples, gps_samples);
            
            if (imu_analysis.has_sampling_hz) {
                imu_sampling = py::float_(imu_analysis.sampling_hz);
            }
            
            c_max_h = round3(imu_analysis.max_h_speed);
            c_max_v = round3(imu_analysis.max_v_speed);
            c_max_acc = round3(imu_analysis.max_acc);
            
            max_h_speed = py::float_(c_max_h);
            max_v_speed = py::float_(c_max_v);
            max_acc = py::float_(c_max_acc);
            
            altitude_gain_m = std::max(altitude_gain_m, imu_analysis.max_alt);

            // Serialize C++ structs to Python lists
            py::list alt_list;
            for (size_t i = 0; i < imu_analysis.times_s.size(); ++i) {
                imu_speed_series.append(py::dict(
                    "t"_a = round3(imu_analysis.times_s[i]),
                    "horizontal"_a = round3(imu_analysis.h_speeds[i]),
                    "vertical"_a = round3(imu_analysis.v_speeds[i])
                ));
                imu_acc_series.append(py::dict(
                    "t"_a = round3(imu_analysis.times_s[i]),
                    "value"_a = round3(imu_analysis.accelerations[i])
                ));
                alt_list.append(py::dict(
                    "t"_a = round3(imu_analysis.times_s[i]),
                    "value"_a = round3(imu_analysis.altitudes[i])
                ));
            }
            kf_altitude_series = alt_list;
        } catch (const std::exception& exc) {
            warnings.append(exc.what());
        }
    } else {
        warnings.append("No IMU message found; IMU-derived metrics are unavailable");
    }

    for (const auto& warning : clean_gps.warnings) {
        warnings.append(warning);
    }

    // 4. Build final analytical metrics
    py::dict metrics;
    metrics["total_distance_m"] = round3(clean_gps.total_distance_m);
    metrics["flight_duration_s"] = round3(gps_samples.back().time_s - gps_samples.front().time_s);
    metrics["max_altitude_gain_m"] = round3(altitude_gain_m);
    metrics["max_horizontal_speed_mps"] = max_h_speed;
    metrics["max_vertical_speed_mps"] = max_v_speed;
    metrics["max_acceleration_mps2"] = max_acc;

    py::dict sampling;
    sampling["gps_hz"] = compute_gps_sampling_hz(gps_samples);
    sampling["imu_hz"] = imu_sampling;

    py::dict units;
    units["distance"] = "m";
    units["duration"] = "s";
    units["speed"] = "m/s";
    units["acceleration"] = "m/s^2";
    units["altitude"] = "m";
    units["trajectory"] = "ENU meters relative to takeoff";
    units["gps_lat_lon"] = "degrees";

    py::dict summary;
    summary["gps_message"] = py::str(gps_fmt->name);
    summary["imu_message"] = imu_message_name;
    summary["point_count"] = py::int_(gps_samples.size());
    summary["warnings"] = warnings;
    
    // Detect anomalies using pure C++ values
    std::vector<std::string> cpp_anomalies = detect_anomalies(c_max_h, c_max_v, c_max_acc);
    py::list anomalies;
    for (const auto& anomaly : cpp_anomalies) {
        anomalies.append(anomaly);
    }
    summary["anomalies"] = anomalies;

    py::dict series;
    if (!kf_altitude_series.is_none()) {
        series["altitude"] = kf_altitude_series;
    } else {
        series["altitude"] = build_altitude_series(gps_samples)["altitude"];
    }
    series["imu_speed"] = imu_speed_series;
    series["imu_acceleration"] = imu_acc_series;

    py::dict raw_preview;
    raw_preview["available_messages"] = build_available_message_names(formats);

    // 5. Extract extra telemetry
    py::list parm_list   = build_parm_list(parm_fmt);
    py::list mode_list   = build_mode_list(mode_fmt);
    py::list err_list    = build_err_list(err_fmt);
    py::list bat_series  = build_bat_series(bat_fmt);
    py::list gps_quality = build_gps_quality_series(gps_fmt);
    py::list att_series  = build_att_series(att_samples);

    // 6. Assemble the final payload
    py::dict result;
    result["summary"]     = summary;
    result["sampling"]    = sampling;
    result["units"]       = units;
    result["metrics"]     = metrics;
    result["trajectory"]  = trajectory; 
    result["series"]      = series;
    result["raw_preview"] = raw_preview;
    result["parameters"]  = parm_list;
    result["flight_modes"] = mode_list;
    result["errors"]      = err_list;
    result["battery"]     = bat_series;
    result["gps_quality"] = gps_quality;
    result["attitude"]    = att_series;
    result["ai_context_toon"] = build_ai_context_toon(result);
    return result;
}

PYBIND11_MODULE(flight_parser, m) {
    m.doc() = "pybind11 ArduPilot BIN parser and flight analysis module (Refactored Architecture)";

    m.def("parse_ardupilot_bin", &parse_ardupilot_bin, "Parses an Ardupilot Dataflash .bin log from raw bytes");
    m.def("analyze_flight_log", &analyze_flight_log, "Runs full flight analysis and builds separated global/enu trajectories in a single pass");
}