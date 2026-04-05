#pragma once

#include <pybind11/pybind11.h>
#include <vector>
#include <string>
#include <unordered_map>

#include "types.hpp"
#include "bin_parser.hpp" // Fix: Included this header to provide the FormatDef definition

namespace py = pybind11;

/**
 * @brief Converts the parsed binary formats map into a Python dictionary.
 * @param formats Map of parsed FormatDef structures containing column data.
 * @return py::dict A Python dictionary representing the formats and their data.
 */
py::dict formats_to_python(const std::unordered_map<uint8_t, FormatDef>& formats);

/**
 * @brief Builds a separated trajectory payload for ENU and Global visualization.
 * Converts raw GPS/Attitude samples into two separate lists:
 * 1. ENU coordinates (East, North, Up) relative to the takeoff origin.
 * 2. Global coordinates (Latitude, Longitude, Altitude).
 * Calculates speed magnitudes between points for the speed series.
 * @param gps_samples Cleaned GPS samples array.
 * @param att_samples Attitude samples for 3D orientation.
 * @return py::dict Nested dictionary with "enu", "global", and "speed_series".
 */
py::dict build_trajectory_payload(const std::vector<GpsSample>& gps_samples, const std::vector<AttSample>& att_samples);

/**
 * @brief Builds the altitude time series for visualization.
 * @param gps_samples Cleaned GPS samples array.
 * @return py::dict Dictionary containing the normalized altitude series.
 */
py::dict build_altitude_series(const std::vector<GpsSample>& gps_samples);

/**
 * @brief Extracts available message names from the parsed formats map.
 * @param formats Map of parsed FormatDef structures.
 * @return py::list Python list of available message names (e.g., "GPS", "IMU").
 */
py::list build_available_message_names(const std::unordered_map<uint8_t, FormatDef>& formats);

/**
 * @brief Detects physical anomalies in the flight based on threshold violations.
 * @param max_h_speed Maximum horizontal speed.
 * @param max_v_speed Maximum vertical speed.
 * @param max_acc Maximum acceleration.
 * @return py::list Python list of detected anomalies formatted as strings.
 */
py::list detect_anomalies(py::object max_h_speed, py::object max_v_speed, py::object max_acc);

/**
 * @brief Generates a Toon-formatted context string for LLM analysis.
 * This creates a highly compressed, token-efficient text representation of the 
 * entire flight analysis payload to be fed into an AI model.
 * @param analysis_payload The full analysis payload dictionary.
 * @return std::string Formatted string representation.
 */
std::string build_ai_context_toon(const py::dict& analysis_payload);

/**
 * @brief Extracts PARM (Parameters) data into a list of key-value pairs.
 * @param parm_fmt Pointer to the parsed PARM message format.
 * @return py::list List of parameter dictionaries.
 */
py::list build_parm_list(const FormatDef* parm_fmt);

/**
 * @brief Extracts flight mode changes over time.
 * @param mode_fmt Pointer to the parsed MODE message format.
 * @return py::list List of flight mode changes.
 */
py::list build_mode_list(const FormatDef* mode_fmt);

/**
 * @brief Extracts subsystem error codes.
 * @param err_fmt Pointer to the parsed ERR message format.
 * @return py::list List of error occurrences.
 */
py::list build_err_list(const FormatDef* err_fmt);

/**
 * @brief Extracts battery telemetry (Voltage, Current, Consumed mAh).
 * @param bat_fmt Pointer to the parsed BAT or CURR message format.
 * @return py::list List of battery telemetry samples.
 */
py::list build_bat_series(const FormatDef* bat_fmt);

/**
 * @brief Extracts GPS quality metrics (Fix type, HDOP, Satellite count).
 * @param gps_fmt Pointer to the parsed GPS message format.
 * @return py::list List of GPS quality samples.
 */
py::list build_gps_quality_series(const FormatDef* gps_fmt);

/**
 * @brief Formats raw attitude samples into a Python list.
 * @param att_samples Vector of Attitude samples.
 * @return py::list List of formatted attitude dictionaries.
 */
py::list build_att_series(const std::vector<AttSample>& att_samples);