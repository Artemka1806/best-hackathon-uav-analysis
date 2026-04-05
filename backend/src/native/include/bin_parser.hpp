#pragma once

#include <pybind11/pybind11.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <optional>
#include <set>
#include <string_view>

#include "types.hpp"

namespace py = pybind11;

/**
 * @brief Structure to hold ArduPilot binary log format definitions and their parsed data.
 */
struct FormatDef {
    uint8_t type{};
    uint8_t length{};
    std::string name;
    std::string format;
    std::vector<std::string> columns;
    std::vector<py::list> columns_data; // Pybind list used temporarily for rapid Python dict export
};

/**
 * @brief Parses the raw binary buffer and extracts messages based on the filter.
 * @param buf Raw binary data view.
 * @param filter Optional set of message names to collect. If nullopt, collects all.
 * @return Map of message types to their format definitions and parsed columns.
 */
std::unordered_map<uint8_t, FormatDef> collect_formats(
    std::string_view buf,
    const std::optional<std::set<std::string>>& filter = std::nullopt
);

/**
 * @brief Finds a specific message format by checking candidate names.
 * @param formats Map of parsed formats.
 * @param candidates List of acceptable message names (e.g. {"GPS", "GPS2"}).
 * @return Pointer to the found FormatDef, or nullptr if not found.
 */
const FormatDef* find_message(const std::unordered_map<uint8_t, FormatDef>& formats, const std::vector<std::string>& candidates);

/**
 * @brief Finds the index of a specific column by its name.
 * @param fmt Format definition object.
 * @param name Target column name.
 * @return Index of the column, or -1 if not found.
 */
int find_column_index(const FormatDef& fmt, const std::string& name);

/**
 * @brief Extracts the time series in seconds from a message format.
 * Checks for "TimeUS" or "TimeMS" automatically.
 * @param fmt Format definition object.
 * @return Vector of timestamps in seconds.
 */
std::vector<double> extract_time_series_seconds(const FormatDef& fmt);

/**
 * @brief Builds an array of GPS samples from the parsed GPS format data.
 * @param gps_fmt Parsed GPS format definition.
 * @return Vector of GpsSample.
 */
std::vector<GpsSample> build_gps_samples(const FormatDef& gps_fmt);

/**
 * @brief Builds an array of Attitude samples from the parsed ATT format data.
 * @param att_fmt Pointer to parsed ATT format definition.
 * @return Vector of AttSample.
 */
std::vector<AttSample> build_att_samples(const FormatDef* att_fmt);

/**
 * @brief Builds an array of IMU samples from the parsed IMU format data.
 * Translates body accelerations into ENU frame using attitude data.
 * @param imu_fmt Parsed IMU format definition.
 * @param att_samples Vector of attitude samples for 3D rotation.
 * @return Vector of ImuSample.
 */
std::vector<ImuSample> build_imu_samples(const FormatDef& imu_fmt, const std::vector<AttSample>& att_samples);