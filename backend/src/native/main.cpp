#include <pybind11/pybind11.h>
#include <pybind11/eigen.h>
#include <pybind11/stl.h>
#include <Eigen/Dense>
#include <Eigen/Geometry>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

namespace py = pybind11;
using namespace pybind11::literals;

namespace {

constexpr double kEarthRadiusMeters = 6371000.0;
constexpr double kWgs84A = 6378137.0;
constexpr double kWgs84F = 1.0 / 298.257223563;
constexpr double kGravityMps2 = 9.80665;

struct FormatDef {
    uint8_t type{};
    uint8_t length{};
    std::string name;
    std::string format;
    std::vector<std::string> columns;
    std::vector<py::list> columns_data;
};

struct AttSample {
    double time_s{};
    double roll_deg{};
    double pitch_deg{};
    double yaw_deg{};
};

struct GpsSample {
    double time_s{};
    double lat_deg{};
    double lon_deg{};
    double alt_m{};
};

struct CleanGpsData {
    std::vector<GpsSample> samples;
    py::list warnings;
    double total_distance_m{};
};

struct ImuSample {
    double time_s{};
    double acc_e{};
    double acc_n{};
    double acc_u{};
};

struct EcefPoint {
    double x{};
    double y{};
    double z{};
};

template <typename T>
T read_val(const char*& ptr) {
    T val;
    std::memcpy(&val, ptr, sizeof(T));
    ptr += sizeof(T);
    return val;
}

std::string read_str(const char*& ptr, size_t len) {
    std::string s(ptr, len);
    ptr += len;
    size_t null_pos = s.find('\0');
    if (null_pos != std::string::npos) {
        s.erase(null_pos);
    }
    return s;
}

std::vector<std::string> split_columns(const std::string& s, char delimiter) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream token_stream(s);
    while (std::getline(token_stream, token, delimiter)) {
        tokens.push_back(token);
    }
    return tokens;
}

bool should_collect_message(const std::optional<std::set<std::string>>& filter, const std::string& name) {
    return !filter.has_value() || filter->count(name) > 0;
}

void decode_message_into_columns(FormatDef& fmt, const char* data_ptr, const char* packet_end) {
    if (fmt.columns.size() != fmt.format.size()) {
        return;
    }

    for (size_t col = 0; col < fmt.format.size(); ++col) {
        if (data_ptr >= packet_end) {
            break;
        }

        char f = fmt.format[col];
        switch (f) {
            case 'b': fmt.columns_data[col].append(read_val<int8_t>(data_ptr)); break;
            case 'B': fmt.columns_data[col].append(read_val<uint8_t>(data_ptr)); break;
            case 'h': fmt.columns_data[col].append(read_val<int16_t>(data_ptr)); break;
            case 'H': fmt.columns_data[col].append(read_val<uint16_t>(data_ptr)); break;
            case 'i': fmt.columns_data[col].append(read_val<int32_t>(data_ptr)); break;
            case 'I': fmt.columns_data[col].append(read_val<uint32_t>(data_ptr)); break;
            case 'f': fmt.columns_data[col].append(read_val<float>(data_ptr)); break;
            case 'd': fmt.columns_data[col].append(read_val<double>(data_ptr)); break;
            case 'n': fmt.columns_data[col].append(read_str(data_ptr, 4)); break;
            case 'N': fmt.columns_data[col].append(read_str(data_ptr, 16)); break;
            case 'Z': fmt.columns_data[col].append(read_str(data_ptr, 64)); break;
            case 'c': fmt.columns_data[col].append(read_val<int16_t>(data_ptr) / 100.0); break;
            case 'C': fmt.columns_data[col].append(read_val<uint16_t>(data_ptr) / 100.0); break;
            case 'e': fmt.columns_data[col].append(read_val<int32_t>(data_ptr) / 100.0); break;
            case 'E': fmt.columns_data[col].append(read_val<uint32_t>(data_ptr) / 100.0); break;
            case 'L': fmt.columns_data[col].append(read_val<int32_t>(data_ptr)); break;
            case 'M': fmt.columns_data[col].append(read_val<uint8_t>(data_ptr)); break;
            case 'q': fmt.columns_data[col].append(read_val<int64_t>(data_ptr)); break;
            case 'Q': fmt.columns_data[col].append(read_val<uint64_t>(data_ptr)); break;
            case 'a': {
                py::list arr;
                for (int k = 0; k < 32; ++k) {
                    arr.append(read_val<int16_t>(data_ptr));
                }
                fmt.columns_data[col].append(arr);
                break;
            }
            default:
                data_ptr = packet_end;
                break;
        }
    }
}

std::unordered_map<uint8_t, FormatDef> collect_formats(
    std::string_view buf,
    const std::optional<std::set<std::string>>& filter = std::nullopt
) {
    const char* ptr = buf.data();
    const char* end = ptr + buf.size();
    std::unordered_map<uint8_t, FormatDef> formats;

    while (ptr + 2 < end) {
        if ((uint8_t)ptr[0] == 0xA3 && (uint8_t)ptr[1] == 0x95) {
            uint8_t msg_type = (uint8_t)ptr[2];

            if (msg_type == 0x80) {
                if (ptr + 89 > end) {
                    break;
                }

                uint8_t def_type = (uint8_t)ptr[3];
                uint8_t def_len = (uint8_t)ptr[4];

                if (formats.find(def_type) == formats.end()) {
                    FormatDef fmt;
                    fmt.type = def_type;
                    fmt.length = def_len;

                    const char* d_ptr = ptr + 5;
                    fmt.name = read_str(d_ptr, 4);
                    fmt.format = read_str(d_ptr, 16);
                    std::string cols_str = read_str(d_ptr, 64);
                    fmt.columns = split_columns(cols_str, ',');

                    if (should_collect_message(filter, fmt.name)) {
                        fmt.columns_data.reserve(fmt.columns.size());
                        for (size_t i = 0; i < fmt.columns.size(); ++i) {
                            fmt.columns_data.emplace_back(py::list());
                        }
                    }

                    formats[def_type] = fmt;
                }
                ptr += 89;
                continue;
            }

            auto it = formats.find(msg_type);
            if (it != formats.end()) {
                FormatDef& fmt = it->second;
                if (ptr + fmt.length > end) {
                    break;
                }

                if (!fmt.columns_data.empty()) {
                    const char* data_ptr = ptr + 3;
                    decode_message_into_columns(fmt, data_ptr, ptr + fmt.length);
                }
                ptr += fmt.length;
            } else {
                ++ptr;
            }
        } else {
            ++ptr;
        }
    }

    return formats;
}

py::dict formats_to_python(const std::unordered_map<uint8_t, FormatDef>& formats) {
    py::dict final_result;
    for (const auto& [type, fmt] : formats) {
        if (fmt.columns_data.empty()) {
            continue;
        }

        py::dict msg_dict;
        for (size_t i = 0; i < fmt.columns.size(); ++i) {
            msg_dict[py::str(fmt.columns[i])] = fmt.columns_data[i];
        }
        final_result[py::str(fmt.name)] = msg_dict;
    }
    return final_result;
}

int find_column_index(const FormatDef& fmt, const std::string& name) {
    for (size_t i = 0; i < fmt.columns.size(); ++i) {
        if (fmt.columns[i] == name) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

double py_obj_to_double(const py::handle& value) {
    return value.cast<double>();
}

std::vector<double> extract_time_series_seconds(const FormatDef& fmt) {
    int time_us_idx = find_column_index(fmt, "TimeUS");
    if (time_us_idx >= 0) {
        size_t count = py::len(fmt.columns_data[time_us_idx]);
        std::vector<double> result;
        result.reserve(count);
        for (size_t i = 0; i < count; ++i) {
            result.push_back(py_obj_to_double(fmt.columns_data[time_us_idx][i]) / 1'000'000.0);
        }
        return result;
    }

    int time_ms_idx = find_column_index(fmt, "TimeMS");
    if (time_ms_idx >= 0) {
        size_t count = py::len(fmt.columns_data[time_ms_idx]);
        std::vector<double> result;
        result.reserve(count);
        for (size_t i = 0; i < count; ++i) {
            result.push_back(py_obj_to_double(fmt.columns_data[time_ms_idx][i]) / 1'000.0);
        }
        return result;
    }

    return {};
}

std::vector<double> monotonic_deltas(const std::vector<double>& times) {
    std::vector<double> deltas;
    if (times.size() < 2) {
        return deltas;
    }
    deltas.reserve(times.size() - 1);
    for (size_t i = 1; i < times.size(); ++i) {
        double dt = times[i] - times[i - 1];
        if (dt > 0) {
            deltas.push_back(dt);
        }
    }
    return deltas;
}

double median_of(std::vector<double> values) {
    if (values.empty()) {
        return std::numeric_limits<double>::quiet_NaN();
    }
    std::sort(values.begin(), values.end());
    size_t mid = values.size() / 2;
    if (values.size() % 2 == 1) {
        return values[mid];
    }
    return (values[mid - 1] + values[mid]) / 2.0;
}

py::object sampling_hz_or_none(const std::vector<double>& times) {
    std::vector<double> deltas = monotonic_deltas(times);
    double dt = median_of(deltas);
    if (!(dt > 0.0) || std::isnan(dt)) {
        return py::none();
    }
    return py::float_(1.0 / dt);
}

double round3(double value) {
    return std::round(value * 1000.0) / 1000.0;
}

double haversine_m(double lat1_deg, double lon1_deg, double lat2_deg, double lon2_deg) {
    double phi1 = lat1_deg * M_PI / 180.0;
    double phi2 = lat2_deg * M_PI / 180.0;
    double dphi = (lat2_deg - lat1_deg) * M_PI / 180.0;
    double dlambda = (lon2_deg - lon1_deg) * M_PI / 180.0;

    double a = std::pow(std::sin(dphi / 2.0), 2.0)
        + std::cos(phi1) * std::cos(phi2) * std::pow(std::sin(dlambda / 2.0), 2.0);
    double c = 2.0 * std::atan2(std::sqrt(a), std::sqrt(1.0 - a));
    return kEarthRadiusMeters * c;
}

EcefPoint geodetic_to_ecef(double lat_deg, double lon_deg, double alt_m) {
    double e2 = 2.0 * kWgs84F - kWgs84F * kWgs84F;
    double lat_rad = lat_deg * M_PI / 180.0;
    double lon_rad = lon_deg * M_PI / 180.0;
    double sin_lat = std::sin(lat_rad);
    double cos_lat = std::cos(lat_rad);
    double sin_lon = std::sin(lon_rad);
    double cos_lon = std::cos(lon_rad);
    double n = kWgs84A / std::sqrt(1.0 - e2 * sin_lat * sin_lat);

    return {
        (n + alt_m) * cos_lat * cos_lon,
        (n + alt_m) * cos_lat * sin_lon,
        (n * (1.0 - e2) + alt_m) * sin_lat
    };
}

std::tuple<double, double, double> ecef_delta_to_enu(
    double lat0_deg,
    double lon0_deg,
    const EcefPoint& origin,
    const EcefPoint& point
) {
    double lat0_rad = lat0_deg * M_PI / 180.0;
    double lon0_rad = lon0_deg * M_PI / 180.0;
    double sin_lat0 = std::sin(lat0_rad);
    double cos_lat0 = std::cos(lat0_rad);
    double sin_lon0 = std::sin(lon0_rad);
    double cos_lon0 = std::cos(lon0_rad);

    double dx = point.x - origin.x;
    double dy = point.y - origin.y;
    double dz = point.z - origin.z;

    double e = -sin_lon0 * dx + cos_lon0 * dy;
    double n = -sin_lat0 * cos_lon0 * dx - sin_lat0 * sin_lon0 * dy + cos_lat0 * dz;
    double u = cos_lat0 * cos_lon0 * dx + cos_lat0 * sin_lon0 * dy + sin_lat0 * dz;
    return {e, n, u};
}

/**
 * @brief Self-healing filter for physically impossible GPS leaps (glitches/multipath).
 * Rejects jumps requiring absurd velocities (e.g. > Mach 1 for typical ArduPilot vehicles).
 * If consecutive bad points are found, the filter assumes the *reference* point was flawed
 * (e.g., initial sticky glitch) and resets the trajectory to the current stable point.
 * * @param raw_samples Unfiltered GPS samples.
 * @return CleanGpsData A structure containing the clean samples array and anomaly warnings.
 */
CleanGpsData clean_gps_anomalies(const std::vector<GpsSample>& raw_samples) {
    CleanGpsData result;
    if (raw_samples.empty()) {
        return result;
    }

    result.samples.push_back(raw_samples[0]);
    int consecutive_drops = 0;

    for (size_t i = 1; i < raw_samples.size(); ++i) {
        const auto& current = raw_samples[i];
        const auto& prev = result.samples.back();
        double dt = current.time_s - prev.time_s;
        
        // Ignore duplicate timestamps or unrealistic high-frequency jitter (> 20Hz)
        if (dt < 0.05) {
            continue;
        }

        double distance_m = haversine_m(prev.lat_deg, prev.lon_deg, current.lat_deg, current.lon_deg);
        double speed_mps = distance_m / dt;

        // Absolute physical threshold (approx 350 m/s ~ Mach 1).
        // Any velocity higher than this over any time gap is mathematically a glitch for a standard UAV.
        bool impossible_jump = speed_mps > 350.0;

        if (impossible_jump) {
            consecutive_drops++;
            
            // If we get 5 impossible jumps in a row, our origin/reference point is likely the actual glitch.
            if (consecutive_drops > 5) {
                std::ostringstream warning;
                warning << "Detected sticky GPS glitch. Trajectory reference reset at t=" 
                        << round3(current.time_s) << "s";
                result.warnings.append(warning.str());
                
                result.samples.clear();
                result.samples.push_back(current);
                result.total_distance_m = 0.0;
                consecutive_drops = 0;
            } else {
                std::ostringstream warning;
                warning << "Filtered GPS glitch at t=" << round3(current.time_s)
                        << "s: Jump of " << round3(distance_m)
                        << " m in " << round3(dt)
                        << " s (" << round3(speed_mps) << " m/s)";
                result.warnings.append(warning.str());
            }
            continue;
        }

        consecutive_drops = 0;
        result.total_distance_m += distance_m;
        result.samples.push_back(current);
    }

    return result;
}

const FormatDef* find_message(const std::unordered_map<uint8_t, FormatDef>& formats, const std::vector<std::string>& candidates) {
    for (const auto& candidate : candidates) {
        for (const auto& [type, fmt] : formats) {
            if (fmt.name == candidate) {
                return &fmt;
            }
        }
    }
    return nullptr;
}

std::vector<GpsSample> build_gps_samples(const FormatDef& gps_fmt) {
    int lat_idx = find_column_index(gps_fmt, "Lat");
    int lon_idx = find_column_index(gps_fmt, "Lng");
    int alt_idx = find_column_index(gps_fmt, "Alt");
    if (lat_idx < 0 || lon_idx < 0 || alt_idx < 0) {
        throw std::runtime_error("GPS message missing Lat/Lng/Alt columns");
    }

    double lat_mult = (gps_fmt.format[lat_idx] == 'i' || gps_fmt.format[lat_idx] == 'L') ? 1e-7 : 1.0;
    double lon_mult = (gps_fmt.format[lon_idx] == 'i' || gps_fmt.format[lon_idx] == 'L') ? 1e-7 : 1.0;
    double alt_mult = (gps_fmt.format[alt_idx] == 'i' || gps_fmt.format[alt_idx] == 'L') ? 1e-2 : 1.0;

    std::vector<double> time_series = extract_time_series_seconds(gps_fmt);
    if (time_series.empty()) {
        throw std::runtime_error("GPS message missing TimeUS/TimeMS");
    }

    size_t count = std::min({
        time_series.size(),
        static_cast<size_t>(py::len(gps_fmt.columns_data[lat_idx])),
        static_cast<size_t>(py::len(gps_fmt.columns_data[lon_idx])),
        static_cast<size_t>(py::len(gps_fmt.columns_data[alt_idx]))
    });

    std::vector<GpsSample> samples;
    samples.reserve(count);
    double last_time = -std::numeric_limits<double>::infinity();

    for (size_t i = 0; i < count; ++i) {
        double time_s = time_series[i];
        if (!(time_s > last_time)) {
            continue;
        }

        double lat = py_obj_to_double(gps_fmt.columns_data[lat_idx][i]) * lat_mult;
        double lon = py_obj_to_double(gps_fmt.columns_data[lon_idx][i]) * lon_mult;

        // Ignore points without a valid GPS fix (Null Island bug)
        // Prevents the impossible trajectory jumps
        if (std::abs(lat) < 1e-5 && std::abs(lon) < 1e-5) {
            continue;
        }

        samples.push_back({
            time_s,
            lat,
            lon,
            py_obj_to_double(gps_fmt.columns_data[alt_idx][i]) * alt_mult
        });
        last_time = time_s;
    }

    if (samples.empty()) {
        throw std::runtime_error("No valid GPS samples found in log");
    }
    return samples;
}

std::vector<AttSample> build_att_samples(const FormatDef* att_fmt) {
    if (!att_fmt) {
        return {};
    }

    int roll_idx = find_column_index(*att_fmt, "Roll");
    int pitch_idx = find_column_index(*att_fmt, "Pitch");
    int yaw_idx = find_column_index(*att_fmt, "Yaw");
    if (roll_idx < 0 || pitch_idx < 0 || yaw_idx < 0) {
        return {};
    }

    double roll_mult = (att_fmt->format[roll_idx] == 'h' || att_fmt->format[roll_idx] == 'i' || att_fmt->format[roll_idx] == 'L') ? 1e-2 : 1.0;
    double pitch_mult = (att_fmt->format[pitch_idx] == 'h' || att_fmt->format[pitch_idx] == 'i' || att_fmt->format[pitch_idx] == 'L') ? 1e-2 : 1.0;
    double yaw_mult = (att_fmt->format[yaw_idx] == 'h' || att_fmt->format[yaw_idx] == 'i' || att_fmt->format[yaw_idx] == 'L') ? 1e-2 : 1.0;

    std::vector<double> time_series = extract_time_series_seconds(*att_fmt);
    if (time_series.empty()) {
        return {};
    }

    size_t count = std::min({
        time_series.size(),
        static_cast<size_t>(py::len(att_fmt->columns_data[roll_idx])),
        static_cast<size_t>(py::len(att_fmt->columns_data[pitch_idx])),
        static_cast<size_t>(py::len(att_fmt->columns_data[yaw_idx]))
    });

    std::vector<AttSample> samples;
    samples.reserve(count);
    double last_time = -std::numeric_limits<double>::infinity();

    for (size_t i = 0; i < count; ++i) {
        double time_s = time_series[i];
        if (!(time_s > last_time)) {
            continue;
        }

        samples.push_back({
            time_s,
            py_obj_to_double(att_fmt->columns_data[roll_idx][i]) * roll_mult,
            py_obj_to_double(att_fmt->columns_data[pitch_idx][i]) * pitch_mult,
            py_obj_to_double(att_fmt->columns_data[yaw_idx][i]) * yaw_mult
        });
        last_time = time_s;
    }
    return samples;
}

AttSample nearest_attitude(double time_s, const std::vector<AttSample>& att_samples) {
    if (att_samples.empty()) {
        return {time_s, 0.0, 0.0, 0.0};
    }

    auto it = std::lower_bound(
        att_samples.begin(),
        att_samples.end(),
        time_s,
        [](const AttSample& sample, double target) { return sample.time_s < target; }
    );

    if (it == att_samples.begin()) {
        return *it;
    }
    if (it == att_samples.end()) {
        return att_samples.back();
    }

    const AttSample& after = *it;
    const AttSample& before = *(it - 1);
    return std::abs(before.time_s - time_s) <= std::abs(after.time_s - time_s) ? before : after;
}

std::tuple<double, double, double> body_acc_to_enu_linear(
    double ax,
    double ay,
    double az,
    double roll_deg,
    double pitch_deg,
    double yaw_deg
) {
    double roll = roll_deg * M_PI / 180.0;
    double pitch = pitch_deg * M_PI / 180.0;
    double yaw = yaw_deg * M_PI / 180.0;

    Eigen::AngleAxisd rollAngle(roll, Eigen::Vector3d::UnitX());
    Eigen::AngleAxisd pitchAngle(pitch, Eigen::Vector3d::UnitY());
    Eigen::AngleAxisd yawAngle(yaw, Eigen::Vector3d::UnitZ());

    Eigen::Quaterniond q = yawAngle * pitchAngle * rollAngle;
    Eigen::Vector3d acc_body(ax, ay, az);
    Eigen::Vector3d acc_ned = q * acc_body;

    double linear_d = acc_ned.z() + kGravityMps2;
    return {acc_ned.y(), acc_ned.x(), -linear_d};
}

std::vector<ImuSample> build_imu_samples(const FormatDef& imu_fmt, const std::vector<AttSample>& att_samples) {
    int accx_idx = find_column_index(imu_fmt, "AccX");
    int accy_idx = find_column_index(imu_fmt, "AccY");
    int accz_idx = find_column_index(imu_fmt, "AccZ");
    if (accx_idx < 0 || accy_idx < 0 || accz_idx < 0) {
        throw std::runtime_error("IMU message is missing AccX/AccY/AccZ columns");
    }

    std::vector<double> time_series = extract_time_series_seconds(imu_fmt);
    if (time_series.empty()) {
        throw std::runtime_error("IMU message is missing TimeUS/TimeMS");
    }

    size_t count = std::min({
        time_series.size(),
        static_cast<size_t>(py::len(imu_fmt.columns_data[accx_idx])),
        static_cast<size_t>(py::len(imu_fmt.columns_data[accy_idx])),
        static_cast<size_t>(py::len(imu_fmt.columns_data[accz_idx]))
    });

    std::vector<ImuSample> samples;
    samples.reserve(count);
    double last_time = -std::numeric_limits<double>::infinity();

    for (size_t i = 0; i < count; ++i) {
        double time_s = time_series[i];
        if (!(time_s > last_time)) {
            continue;
        }

        double ax = py_obj_to_double(imu_fmt.columns_data[accx_idx][i]);
        double ay = py_obj_to_double(imu_fmt.columns_data[accy_idx][i]);
        double az = py_obj_to_double(imu_fmt.columns_data[accz_idx][i]);
        AttSample att = nearest_attitude(time_s, att_samples);
        auto [acc_e, acc_n, acc_u] = body_acc_to_enu_linear(ax, ay, az, att.roll_deg, att.pitch_deg, att.yaw_deg);

        samples.push_back({time_s, acc_e, acc_n, acc_u});
        last_time = time_s;
    }

    if (samples.size() < 2) {
        throw std::runtime_error("Not enough IMU samples after normalization");
    }
    return samples;
}

/**
 * @brief Builds a separated trajectory payload for ENU and Global visualization.
 * Converts raw GPS/Attitude samples into two separate lists:
 * 1. ENU coordinates (East, North, Up) relative to the takeoff origin.
 * 2. Global coordinates (Latitude, Longitude, Altitude).
 * Calculates speed magnitudes between points for the speed series.
 * * @param gps_samples Cleaned GPS samples array.
 * @param att_samples Attitude samples for 3D orientation.
 * @return py::dict Nested dictionary with "enu", "global", and "speed_series".
 */
py::dict build_trajectory_payload(
    const std::vector<GpsSample>& gps_samples,
    const std::vector<AttSample>& att_samples
) {
    py::list enu_points;
    py::list global_points;
    py::list speed_series;

    const GpsSample& origin_gps = gps_samples.front();
    EcefPoint origin_ecef = geodetic_to_ecef(origin_gps.lat_deg, origin_gps.lon_deg, origin_gps.alt_m);

    double previous_time = gps_samples.front().time_s;
    double previous_e = 0.0;
    double previous_n = 0.0;
    double previous_u = 0.0;

    speed_series.append(py::dict("t"_a = std::round(gps_samples.front().time_s * 1000.0) / 1000.0, "value"_a = 0.0));

    for (size_t i = 0; i < gps_samples.size(); ++i) {
        const GpsSample& sample = gps_samples[i];
        EcefPoint point_ecef = geodetic_to_ecef(sample.lat_deg, sample.lon_deg, sample.alt_m);
        auto [e, n, u] = ecef_delta_to_enu(origin_gps.lat_deg, origin_gps.lon_deg, origin_ecef, point_ecef);
        AttSample att = nearest_attitude(sample.time_s, att_samples);

        // Populate ENU point list for 3D visualizer
        py::dict enu_point;
        enu_point["e"] = e;
        enu_point["n"] = n;
        enu_point["u"] = u;
        enu_point["t"] = sample.time_s * 1'000'000.0;
        enu_point["roll"] = att.roll_deg;
        enu_point["pitch"] = att.pitch_deg;
        enu_point["yaw"] = att.yaw_deg;
        enu_point["valid_segment_from_previous"] = true; // Samples passed here are pre-filtered
        enu_points.append(enu_point);

        // Populate Global point list for Map visualizer
        py::dict global_point;
        global_point["lat"] = sample.lat_deg;
        global_point["lon"] = sample.lon_deg;
        global_point["alt"] = sample.alt_m;
        global_point["t"] = sample.time_s * 1'000'000.0;
        global_point["valid_segment_from_previous"] = true;
        global_points.append(global_point);

        if (i > 0) {
            double dt = sample.time_s - previous_time;
            if (dt > 0.0) {
                double de = e - previous_e;
                double dn = n - previous_n;
                double du = u - previous_u;
                double speed = std::sqrt(de * de + dn * dn + du * du) / dt;
                speed_series.append(py::dict("t"_a = round3(sample.time_s), "value"_a = round3(speed)));
            }
        }

        previous_time = sample.time_s;
        previous_e = e;
        previous_n = n;
        previous_u = u;
    }

    py::dict origin;
    origin["lat"] = origin_gps.lat_deg;
    origin["lon"] = origin_gps.lon_deg;
    origin["alt"] = origin_gps.alt_m;

    py::dict result;
    result["enu"] = py::dict("origin"_a = origin, "points"_a = enu_points);
    result["global"] = py::dict("points"_a = global_points);
    result["speed_series"] = speed_series;
    return result;
}

py::dict build_altitude_series(const std::vector<GpsSample>& gps_samples) {
    py::list altitude;
    double start_alt = gps_samples.front().alt_m;
    for (const auto& sample : gps_samples) {
        altitude.append(py::dict(
            "t"_a = round3(sample.time_s),
            "value"_a = round3(sample.alt_m - start_alt)
        ));
    }
    py::dict result;
    result["altitude"] = altitude;
    return result;
}

/**
 * @brief Linear Kalman Filter for fusing ENU IMU accelerations with ENU GPS positions.
 * This filter maintains a 6D state vector consisting of 3D position and 3D velocity
 * in the East-North-Up (ENU) coordinate frame.
 * * @warning The noise covariance matrices (Q and R) are initialized with heuristic defaults.
 * For optimal performance, these should be tuned based on the specific sensors used in the drone.
 */
class PositionVelocityKF {
public:
    /**
     * @brief Constructor initializes the filter matrices.
     * @param initial_pos Initial position vector in ENU [e, n, u].
     */
    PositionVelocityKF(const Eigen::Vector3d& initial_pos) {
        x_.setZero();
        x_.head<3>() = initial_pos;

        P_.setIdentity();
        P_ *= 10.0;

        F_.setIdentity();
        B_.setZero();

        H_.setZero();
        H_.block<3, 3>(0, 0) = Eigen::Matrix3d::Identity();

        Q_.setIdentity();
        Q_.block<3, 3>(0, 0) *= 0.05;
        Q_.block<3, 3>(3, 3) *= 0.1;

        R_.setIdentity();
        R_ *= 2.5; 
    }

    /**
     * @brief Predicts the next state using IMU acceleration data.
     * @param dt Time delta since the last prediction in seconds.
     * @param acc_enu Acceleration vector in ENU frame [ae, an, au].
     */
    void predict(double dt, const Eigen::Vector3d& acc_enu) {
        F_.block<3, 3>(0, 3) = Eigen::Matrix3d::Identity() * dt;

        B_.block<3, 3>(0, 0) = Eigen::Matrix3d::Identity() * (0.5 * dt * dt);
        B_.block<3, 3>(3, 0) = Eigen::Matrix3d::Identity() * dt;

        x_ = F_ * x_ + B_ * acc_enu;
        P_ = F_ * P_ * F_.transpose() + Q_;
    }

    /**
     * @brief Updates the state estimation using GPS measurement data.
     * @param pos_enu Measured position vector in ENU frame [e, n, u].
     */
    void update(const Eigen::Vector3d& pos_enu) {
        Eigen::Vector3d y = pos_enu - H_ * x_;
        Eigen::Matrix3d S = H_ * P_ * H_.transpose() + R_;
        
        Eigen::Matrix<double, 6, 3> K = P_ * H_.transpose() * S.inverse();

        x_ = x_ + K * y;
        P_ = (Eigen::Matrix<double, 6, 6>::Identity() - K * H_) * P_;
    }

    /**
     * @brief Retrieves the current position estimate.
     * @return Eigen::Vector3d Current [e, n, u] position.
     */
    Eigen::Vector3d get_position() const { return x_.head<3>(); }

    /**
     * @brief Retrieves the current velocity estimate.
     * @return Eigen::Vector3d Current [ve, vn, vu] velocity.
     */
    Eigen::Vector3d get_velocity() const { return x_.tail<3>(); }

private:
    Eigen::Matrix<double, 6, 1> x_;
    Eigen::Matrix<double, 6, 6> P_;
    Eigen::Matrix<double, 6, 6> F_;
    Eigen::Matrix<double, 6, 3> B_;
    Eigen::Matrix<double, 3, 6> H_;
    Eigen::Matrix<double, 6, 6> Q_;
    Eigen::Matrix<double, 3, 3> R_;
};

/**
 * @brief Fuses IMU and GPS data to analyze speeds and accelerations.
 * Uses a Kalman Filter to prevent drift from double integration. Uses
 * trapezoidal integration internally to satisfy hackathon MVP requirements.
 * * @param imu_samples Vector of IMU samples.
 * @param gps_samples Vector of CLEANED GPS samples for position updates.
 * @return py::dict A dictionary containing speed series, acceleration series, and max values.
 */
py::dict analyze_imu_series(const std::vector<ImuSample>& imu_samples, const std::vector<GpsSample>& gps_samples) {
    py::list acceleration_series;
    py::list speed_series;
    py::list altitude_series; // Added for high-res KF altitude

    double max_h_speed = 0.0;
    double max_v_speed = 0.0;
    double max_acc = 0.0;
    double max_alt = 0.0; // Added to track KF max altitude

    auto magnitude = [](const ImuSample& sample) {
        return std::sqrt(sample.acc_e * sample.acc_e + sample.acc_n * sample.acc_n + sample.acc_u * sample.acc_u);
    };

    acceleration_series.append(py::dict(
        "t"_a = std::round(imu_samples.front().time_s * 1000.0) / 1000.0,
        "value"_a = round3(imu_samples.front().acc_u)
    ));
    speed_series.append(py::dict(
        "t"_a = round3(imu_samples.front().time_s),
        "horizontal"_a = 0.0,
        "vertical"_a = 0.0
    ));
    altitude_series.append(py::dict(
        "t"_a = round3(imu_samples.front().time_s),
        "value"_a = 0.0
    ));

    EcefPoint origin_ecef = geodetic_to_ecef(gps_samples.front().lat_deg, gps_samples.front().lon_deg, gps_samples.front().alt_m);
    PositionVelocityKF kf(Eigen::Vector3d::Zero());
    
    size_t gps_idx = 0;

    for (size_t i = 1; i < imu_samples.size(); ++i) {
        const ImuSample& prev = imu_samples[i - 1];
        const ImuSample& current = imu_samples[i];
        double dt = current.time_s - prev.time_s;
        if (dt <= 0.0 || dt > 1.0) {
            continue;
        }

        // Apply trapezoidal integration for acceleration input (satisfies hackathon MVP requirement)
        Eigen::Vector3d acc_enu(
            (prev.acc_e + current.acc_e) * 0.5,
            (prev.acc_n + current.acc_n) * 0.5,
            (prev.acc_u + current.acc_u) * 0.5
        );
        
        kf.predict(dt, acc_enu);

        // Process any GPS measurements that arrived during this IMU interval
        while (gps_idx < gps_samples.size() && gps_samples[gps_idx].time_s <= current.time_s) {
            const auto& gps = gps_samples[gps_idx];
            EcefPoint point_ecef = geodetic_to_ecef(gps.lat_deg, gps.lon_deg, gps.alt_m);
            auto [e, n, u] = ecef_delta_to_enu(gps_samples.front().lat_deg, gps_samples.front().lon_deg, origin_ecef, point_ecef);
            kf.update(Eigen::Vector3d(e, n, u));
            gps_idx++;
        }

        Eigen::Vector3d vel = kf.get_velocity();
        double h_speed = std::sqrt(vel.x() * vel.x() + vel.y() * vel.y());
        double v_speed = vel.z(); // Removed std::abs to preserve flight direction (positive=up, negative=down)
        double acc_mag = magnitude(current);
        double current_alt = kf.get_position().z();

        max_h_speed = std::max(max_h_speed, h_speed);
        max_v_speed = std::max(max_v_speed, std::abs(v_speed)); // Metric remains absolute
        max_acc = std::max(max_acc, acc_mag);
        max_alt = std::max(max_alt, current_alt);

        speed_series.append(py::dict(
            "t"_a = round3(current.time_s),
            "horizontal"_a = round3(h_speed),
            "vertical"_a = round3(v_speed) // Signed speed for the chart
        ));
        acceleration_series.append(py::dict(
            "t"_a = round3(current.time_s),
            "value"_a = round3(current.acc_u)
        ));
        altitude_series.append(py::dict(
            "t"_a = round3(current.time_s),
            "value"_a = round3(current_alt) // High-res fused altitude
        ));
    }

    py::dict result;
    result["speed_series"] = speed_series;
    result["acceleration_series"] = acceleration_series;
    result["altitude_series"] = altitude_series;
    result["max_horizontal_speed_mps"] = round3(max_h_speed);
    result["max_vertical_speed_mps"] = round3(max_v_speed);
    result["max_acceleration_mps2"] = round3(max_acc);
    result["max_altitude_gain_m"] = round3(max_alt);
    result["sampling_hz"] = sampling_hz_or_none([&]() {
        std::vector<double> times;
        times.reserve(imu_samples.size());
        for (const auto& sample : imu_samples) {
            times.push_back(sample.time_s);
        }
        return times;
    }());
    return result;
}

py::list build_available_message_names(const std::unordered_map<uint8_t, FormatDef>& formats) {
    std::vector<std::string> names;
    names.reserve(formats.size());
    for (const auto& [type, fmt] : formats) {
        names.push_back(fmt.name);
    }
    std::sort(names.begin(), names.end());

    py::list result;
    for (const auto& name : names) {
        result.append(name);
    }
    return result;
}

py::list detect_anomalies(py::object max_h_speed, py::object max_v_speed, py::object max_acc) {
    py::list anomalies;

    if (!max_v_speed.is_none() && max_v_speed.cast<double>() > 8.0) {
        anomalies.append("High vertical speed detected");
    }
    if (!max_acc.is_none() && max_acc.cast<double>() > 20.0) {
        anomalies.append("High acceleration spike detected");
    }
    if (!max_h_speed.is_none() && max_h_speed.cast<double>() > 30.0) {
        anomalies.append("High horizontal speed detected");
    }
    return anomalies;
}

std::vector<size_t> sample_indices(size_t total, size_t max_samples) {
    std::vector<size_t> indices;
    if (total == 0) {
        return indices;
    }
    if (total <= max_samples) {
        indices.reserve(total);
        for (size_t i = 0; i < total; ++i) {
            indices.push_back(i);
        }
        return indices;
    }

    indices.reserve(max_samples);
    for (size_t i = 0; i < max_samples; ++i) {
        size_t idx = i * (total - 1) / (max_samples - 1);
        if (indices.empty() || indices.back() != idx) {
            indices.push_back(idx);
        }
    }
    return indices;
}

std::string py_object_to_string(const py::handle& value) {
    if (value.is_none()) {
        return "null";
    }
    if (py::isinstance<py::float_>(value)) {
        return std::to_string(round3(value.cast<double>()));
    }
    if (py::isinstance<py::int_>(value)) {
        return std::to_string(value.cast<long long>());
    }
    if (py::isinstance<py::bool_>(value)) {
        return value.cast<bool>() ? "true" : "false";
    }
    return value.cast<std::string>();
}

std::string join_list_pipe(const py::list& values) {
    std::ostringstream out;
    bool first = true;
    for (const auto& value : values) {
        if (!first) {
            out << "|";
        }
        out << py_object_to_string(value);
        first = false;
    }
    return out.str();
}

std::string primitive_to_toon(const py::handle& value) {
    if (value.is_none()) {
        return "null";
    }
    if (py::isinstance<py::bool_>(value)) {
        return value.cast<bool>() ? "true" : "false";
    }
    if (py::isinstance<py::int_>(value)) {
        return std::to_string(value.cast<long long>());
    }
    if (py::isinstance<py::float_>(value)) {
        return py_object_to_string(value);
    }
    return value.cast<std::string>();
}

std::string toon_indent(int level) {
    return std::string(level * 2, ' ');
}

bool is_primitive_value(const py::handle& value) {
    return value.is_none()
        || py::isinstance<py::bool_>(value)
        || py::isinstance<py::int_>(value)
        || py::isinstance<py::float_>(value)
        || py::isinstance<py::str>(value);
}

void append_toon_value(std::ostringstream& out, const py::handle& value, int indent_level);

void append_toon_list(std::ostringstream& out, const py::list& values, int indent_level) {
    std::string indent = toon_indent(indent_level);
    if (py::len(values) == 0) {
        out << indent << "[]\n";
        return;
    }

    bool all_primitives = true;
    for (const auto& item : values) {
        if (!is_primitive_value(item)) {
            all_primitives = false;
            break;
        }
    }

    if (all_primitives) {
        bool first = true;
        for (const auto& item : values) {
            if (!first) {
                out << ",";
            }
            out << primitive_to_toon(item);
            first = false;
        }
        out << "\n";
        return;
    }

    out << "\n";
    size_t index = 0;
    for (const auto& item : values) {
        out << indent << "item_" << index << ":\n";
        append_toon_value(out, item, indent_level + 1);
        ++index;
    }
}

void append_toon_dict(std::ostringstream& out, const py::dict& obj, int indent_level) {
    for (const auto& item : obj) {
        std::string indent = toon_indent(indent_level);
        std::string key = py::str(item.first);
        py::handle value = item.second;

        if (is_primitive_value(value)) {
            out << indent << key << ": " << primitive_to_toon(value) << "\n";
            continue;
        }

        if (py::isinstance<py::list>(value)) {
            py::list list_value = value.cast<py::list>();
            out << indent << key << "[" << py::len(list_value) << "]: ";
            append_toon_list(out, list_value, indent_level + 1);
            continue;
        }

        if (py::isinstance<py::dict>(value)) {
            out << indent << key << ":\n";
            append_toon_dict(out, value.cast<py::dict>(), indent_level + 1);
            continue;
        }

        out << indent << key << ": " << primitive_to_toon(value) << "\n";
    }
}

void append_toon_value(std::ostringstream& out, const py::handle& value, int indent_level) {
    if (is_primitive_value(value)) {
        out << toon_indent(indent_level) << primitive_to_toon(value) << "\n";
        return;
    }

    if (py::isinstance<py::dict>(value)) {
        append_toon_dict(out, value.cast<py::dict>(), indent_level);
        return;
    }

    if (py::isinstance<py::list>(value)) {
        append_toon_list(out, value.cast<py::list>(), indent_level);
        return;
    }

    out << toon_indent(indent_level) << primitive_to_toon(value) << "\n";
}

std::string build_ai_context_toon(
    const py::dict& analysis_payload
) {
    std::ostringstream out;
    py::dict summary     = analysis_payload["summary"].cast<py::dict>();
    py::dict sampling    = analysis_payload["sampling"].cast<py::dict>();
    py::dict units       = analysis_payload["units"].cast<py::dict>();
    py::dict metrics     = analysis_payload["metrics"].cast<py::dict>();
    py::dict trajectory  = analysis_payload["trajectory"].cast<py::dict>();
    py::dict series      = analysis_payload["series"].cast<py::dict>();
    py::dict raw_preview = analysis_payload["raw_preview"].cast<py::dict>();

    // optional new sections (absent if not collected)
    py::list parm_list, mode_list, err_list, bat_series, gps_quality, att_series;
    if (analysis_payload.contains("parameters"))   parm_list   = analysis_payload["parameters"].cast<py::list>();
    if (analysis_payload.contains("flight_modes")) mode_list   = analysis_payload["flight_modes"].cast<py::list>();
    if (analysis_payload.contains("errors"))       err_list    = analysis_payload["errors"].cast<py::list>();
    if (analysis_payload.contains("battery"))      bat_series  = analysis_payload["battery"].cast<py::list>();
    if (analysis_payload.contains("gps_quality"))  gps_quality = analysis_payload["gps_quality"].cast<py::list>();
    if (analysis_payload.contains("attitude"))     att_series  = analysis_payload["attitude"].cast<py::list>();

    out << "summary:\n";
    append_toon_dict(out, summary, 1);

    out << "sampling:\n";
    append_toon_dict(out, sampling, 1);

    out << "units:\n";
    append_toon_dict(out, units, 1);

    out << "metrics:\n";
    append_toon_dict(out, metrics, 1);

    out << "raw_preview:\n";
    append_toon_dict(out, raw_preview, 1);

    // Flight Modes
    out << "flight_modes[" << py::len(mode_list) << "]:\n";
    for (const auto& raw : mode_list) {
        py::dict entry = raw.cast<py::dict>();
        out << "  t=" << py_object_to_string(entry["t_s"]) << "s"
            << " mode=" << py_object_to_string(entry["mode"]);
        if (entry.contains("mode_num"))
            out << " num=" << py_object_to_string(entry["mode_num"]);
        out << "\n";
    }

    // Errors
    out << "errors[" << py::len(err_list) << "]:\n";
    for (const auto& raw : err_list) {
        py::dict entry = raw.cast<py::dict>();
        out << "  t=" << py_object_to_string(entry["t_s"]) << "s"
            << " subsys=" << py_object_to_string(entry["subsys"])
            << " ecode=" << py_object_to_string(entry["ecode"]) << "\n";
    }

    // Parameters
    out << "parameters[" << py::len(parm_list) << "]:\n";
    for (const auto& raw : parm_list) {
        py::dict entry = raw.cast<py::dict>();
        out << "  " << py_object_to_string(entry["name"])
            << "=" << py_object_to_string(entry["value"]) << "\n";
    }

    py::dict trajectory_enu = trajectory["enu"].cast<py::dict>();
    py::list trajectory_points = trajectory_enu["points"].cast<py::list>();
    py::dict origin = trajectory_enu["origin"].cast<py::dict>();
    py::list trajectory_speed = trajectory["speed_series"].cast<py::list>();

    out << "trajectory:\n";
    out << "  origin:\n";
    append_toon_dict(out, origin, 2);
    out << "  point_count: " << py::len(trajectory_points) << "\n";
    out << "  speed_sample_count: " << py::len(trajectory_speed) << "\n";

    if (py::len(trajectory_points) > 0) {
        py::dict first = trajectory_points[0].cast<py::dict>();
        py::dict last = trajectory_points[py::len(trajectory_points) - 1].cast<py::dict>();
        double min_e = first["e"].cast<double>();
        double max_e = min_e;
        double min_n = first["n"].cast<double>();
        double max_n = min_n;
        double min_u = first["u"].cast<double>();
        double max_u = min_u;
        size_t invalid_segments = 0;

        for (const auto& raw : trajectory_points) {
            py::dict point = raw.cast<py::dict>();
            double e = point["e"].cast<double>();
            double n = point["n"].cast<double>();
            double u = point["u"].cast<double>();
            min_e = std::min(min_e, e);
            max_e = std::max(max_e, e);
            min_n = std::min(min_n, n);
            max_n = std::max(max_n, n);
            min_u = std::min(min_u, u);
            max_u = std::max(max_u, u);
            if (!point["valid_segment_from_previous"].cast<bool>()) {
                ++invalid_segments;
            }
        }

        out << "  time_range_s: " << round3(first["t"].cast<double>() / 1'000'000.0)
            << "," << round3(last["t"].cast<double>() / 1'000'000.0) << "\n";
        out << "  enu_bounds_m:\n";
        out << "    e_min: " << round3(min_e) << "\n";
        out << "    e_max: " << round3(max_e) << "\n";
        out << "    n_min: " << round3(min_n) << "\n";
        out << "    n_max: " << round3(max_n) << "\n";
        out << "    u_min: " << round3(min_u) << "\n";
        out << "    u_max: " << round3(max_u) << "\n";
        out << "  invalid_segment_count: " << invalid_segments << "\n";

        std::vector<size_t> point_indices = sample_indices(py::len(trajectory_points), 24);
        out << "  point_samples[" << point_indices.size() << "]{t_s,e,n,u,yaw,valid}:\n";
        for (size_t idx : point_indices) {
            py::dict point = trajectory_points[idx].cast<py::dict>();
            out << "    " << round3(point["t"].cast<double>() / 1'000'000.0) << ","
                << round3(point["e"].cast<double>()) << ","
                << round3(point["n"].cast<double>()) << ","
                << round3(point["u"].cast<double>()) << ","
                << round3(point["yaw"].cast<double>()) << ","
                << primitive_to_toon(point["valid_segment_from_previous"]) << "\n";
        }
    }

    auto append_series_summary = [&](const char* section_name,
                                     const py::list& values,
                                     const std::vector<std::string>& fields,
                                     size_t max_samples) {
        out << section_name << ":\n";
        out << "  count: " << py::len(values) << "\n";
        if (py::len(values) == 0) {
            return;
        }

        py::dict first = values[0].cast<py::dict>();
        py::dict last = values[py::len(values) - 1].cast<py::dict>();
        out << "  time_range_s: " << py_object_to_string(first["t"]) << ","
            << py_object_to_string(last["t"]) << "\n";

        for (const auto& field : fields) {
            double min_v = first[py::str(field)].cast<double>();
            double max_v = min_v;
            for (const auto& raw : values) {
                py::dict row = raw.cast<py::dict>();
                double value = row[py::str(field)].cast<double>();
                min_v = std::min(min_v, value);
                max_v = std::max(max_v, value);
            }
            out << "  " << field << "_min: " << round3(min_v) << "\n";
            out << "  " << field << "_max: " << round3(max_v) << "\n";
        }

        std::vector<size_t> indices = sample_indices(py::len(values), max_samples);
        out << "  samples[" << indices.size() << "]{t";
        for (const auto& field : fields) {
            out << "," << field;
        }
        out << "}:\n";
        for (size_t idx : indices) {
            py::dict row = values[idx].cast<py::dict>();
            out << "    " << py_object_to_string(row["t"]);
            for (const auto& field : fields) {
                out << "," << py_object_to_string(row[py::str(field)]);
            }
            out << "\n";
        }
    };

    append_series_summary(
        "gps_altitude_series",
        series["altitude"].cast<py::list>(),
        {"value"},
        24
    );
    append_series_summary(
        "imu_speed_series",
        series["imu_speed"].cast<py::list>(),
        {"horizontal", "vertical"},
        24
    );
    append_series_summary(
        "imu_acceleration_series",
        series["imu_acceleration"].cast<py::list>(),
        {"value"},
        24
    );

    // Battery
    if (py::len(bat_series) > 0) {
        out << "battery:\n";
        out << "  count: " << py::len(bat_series) << "\n";

        double volt_min = std::numeric_limits<double>::infinity();
        double volt_max = -std::numeric_limits<double>::infinity();
        double curr_max = -std::numeric_limits<double>::infinity();
        double consumed_end = 0.0;

        for (const auto& raw : bat_series) {
            py::dict entry = raw.cast<py::dict>();
            if (entry.contains("volt")) {
                double v = std::stod(py_object_to_string(entry["volt"]));
                volt_min = std::min(volt_min, v);
                volt_max = std::max(volt_max, v);
            }
            if (entry.contains("curr")) {
                double c = std::stod(py_object_to_string(entry["curr"]));
                curr_max = std::max(curr_max, c);
            }
            if (entry.contains("consumed_mah")) {
                consumed_end = std::stod(py_object_to_string(entry["consumed_mah"]));
            }
        }
        if (volt_min < std::numeric_limits<double>::infinity())
            out << "  volt_min: " << round3(volt_min) << "\n";
        if (volt_max > -std::numeric_limits<double>::infinity())
            out << "  volt_max: " << round3(volt_max) << "\n";
        if (curr_max > -std::numeric_limits<double>::infinity())
            out << "  curr_max_a: " << round3(curr_max) << "\n";
        if (consumed_end > 0.0)
            out << "  consumed_mah: " << round3(consumed_end) << "\n";

        // sampled voltage over time
        std::vector<size_t> bat_idx = sample_indices(py::len(bat_series), 20);
        out << "  volt_samples[" << bat_idx.size() << "]{t_s,volt}:\n";
        for (size_t idx : bat_idx) {
            py::dict entry = bat_series[idx].cast<py::dict>();
            out << "    " << py_object_to_string(entry["t_s"]);
            if (entry.contains("volt")) out << "," << py_object_to_string(entry["volt"]);
            out << "\n";
        }
    }

    // GPS Quality
    if (py::len(gps_quality) > 0) {
        out << "gps_quality:\n";
        out << "  count: " << py::len(gps_quality) << "\n";

        int fix3d_count = 0, no_fix_count = 0;
        double hdop_min = std::numeric_limits<double>::infinity();
        double hdop_max = -std::numeric_limits<double>::infinity();
        int sats_min = INT_MAX, sats_max = INT_MIN;

        for (const auto& raw : gps_quality) {
            py::dict entry = raw.cast<py::dict>();
            if (entry.contains("fix")) {
                int fix = std::stoi(py_object_to_string(entry["fix"]));
                if (fix >= 3) ++fix3d_count; else ++no_fix_count;
            }
            if (entry.contains("hdop")) {
                double h = std::stod(py_object_to_string(entry["hdop"]));
                hdop_min = std::min(hdop_min, h);
                hdop_max = std::max(hdop_max, h);
            }
            if (entry.contains("sats")) {
                int s = std::stoi(py_object_to_string(entry["sats"]));
                sats_min = std::min(sats_min, s);
                sats_max = std::max(sats_max, s);
            }
        }
        if (fix3d_count + no_fix_count > 0) {
            out << "  fix3d_samples: " << fix3d_count << "\n";
            out << "  no_fix_samples: " << no_fix_count << "\n";
        }
        if (hdop_min < std::numeric_limits<double>::infinity()) {
            out << "  hdop_min: " << round3(hdop_min) << "\n";
            out << "  hdop_max: " << round3(hdop_max) << "\n";
        }
        if (sats_min < INT_MAX) {
            out << "  sats_min: " << sats_min << "\n";
            out << "  sats_max: " << sats_max << "\n";
        }
    }

    // Attitude Series
    if (py::len(att_series) > 0) {
        out << "attitude_series:\n";
        out << "  count: " << py::len(att_series) << "\n";

        double roll_min = std::numeric_limits<double>::infinity();
        double roll_max = -std::numeric_limits<double>::infinity();
        double pitch_min = std::numeric_limits<double>::infinity();
        double pitch_max = -std::numeric_limits<double>::infinity();

        for (const auto& raw : att_series) {
            py::dict entry = raw.cast<py::dict>();
            double r = entry["roll_deg"].cast<double>();
            double p = entry["pitch_deg"].cast<double>();
            roll_min = std::min(roll_min, r);
            roll_max = std::max(roll_max, r);
            pitch_min = std::min(pitch_min, p);
            pitch_max = std::max(pitch_max, p);
        }
        out << "  roll_min_deg: " << round3(roll_min) << "\n";
        out << "  roll_max_deg: " << round3(roll_max) << "\n";
        out << "  pitch_min_deg: " << round3(pitch_min) << "\n";
        out << "  pitch_max_deg: " << round3(pitch_max) << "\n";

        std::vector<size_t> att_idx = sample_indices(py::len(att_series), 24);
        out << "  samples[" << att_idx.size() << "]{t_s,roll,pitch,yaw}:\n";
        for (size_t idx : att_idx) {
            py::dict entry = att_series[idx].cast<py::dict>();
            out << "    " << py_object_to_string(entry["t_s"])
                << "," << py_object_to_string(entry["roll_deg"])
                << "," << py_object_to_string(entry["pitch_deg"])
                << "," << py_object_to_string(entry["yaw_deg"]) << "\n";
        }
    }

    return out.str();
}

} // namespace

py::dict parse_ardupilot_bin(py::bytes data) {
    std::string_view buf = data;
    auto formats = collect_formats(buf, std::nullopt);
    return formats_to_python(formats);
}

// PARM
py::list build_parm_list(const FormatDef* parm_fmt) {
    py::list result;
    if (!parm_fmt) return result;

    int name_idx  = find_column_index(*parm_fmt, "Name");
    int value_idx = find_column_index(*parm_fmt, "Value");
    if (name_idx < 0 || value_idx < 0) return result;

    size_t count = std::min(
        static_cast<size_t>(py::len(parm_fmt->columns_data[name_idx])),
        static_cast<size_t>(py::len(parm_fmt->columns_data[value_idx]))
    );
    for (size_t i = 0; i < count; ++i) {
        py::dict entry;
        entry["name"]  = parm_fmt->columns_data[name_idx][i];
        entry["value"] = parm_fmt->columns_data[value_idx][i];
        result.append(entry);
    }
    return result;
}

// MODE
py::list build_mode_list(const FormatDef* mode_fmt) {
    py::list result;
    if (!mode_fmt) return result;

    int time_us_idx = find_column_index(*mode_fmt, "TimeUS");
    int time_ms_idx = find_column_index(*mode_fmt, "TimeMS");
    int mode_idx    = find_column_index(*mode_fmt, "Mode");
    if (mode_idx < 0) return result;

    std::vector<double> times = extract_time_series_seconds(*mode_fmt);
    size_t count = std::min(
        times.size(),
        static_cast<size_t>(py::len(mode_fmt->columns_data[mode_idx]))
    );

    int mnum_idx = find_column_index(*mode_fmt, "ModeNum");

    for (size_t i = 0; i < count; ++i) {
        py::dict entry;
        entry["t_s"]  = round3(times[i]);
        entry["mode"] = mode_fmt->columns_data[mode_idx][i];
        if (mnum_idx >= 0 && i < static_cast<size_t>(py::len(mode_fmt->columns_data[mnum_idx]))) {
            entry["mode_num"] = mode_fmt->columns_data[mnum_idx][i];
        }
        result.append(entry);
    }
    return result;
}

// ERR
py::list build_err_list(const FormatDef* err_fmt) {
    py::list result;
    if (!err_fmt) return result;

    int subsys_idx = find_column_index(*err_fmt, "Subsys");
    int ecode_idx  = find_column_index(*err_fmt, "ECode");
    if (subsys_idx < 0 || ecode_idx < 0) return result;

    std::vector<double> times = extract_time_series_seconds(*err_fmt);
    size_t count = std::min({
        times.size(),
        static_cast<size_t>(py::len(err_fmt->columns_data[subsys_idx])),
        static_cast<size_t>(py::len(err_fmt->columns_data[ecode_idx]))
    });

    for (size_t i = 0; i < count; ++i) {
        py::dict entry;
        entry["t_s"]   = round3(times[i]);
        entry["subsys"] = err_fmt->columns_data[subsys_idx][i];
        entry["ecode"]  = err_fmt->columns_data[ecode_idx][i];
        result.append(entry);
    }
    return result;
}

// BAT / CURR
struct BatSample {
    double time_s{};
    double volt{};
    double curr{};
    double consumed_mah{};
};

py::list build_bat_series(const FormatDef* bat_fmt) {
    py::list result;
    if (!bat_fmt) return result;

    // ArduPilot BAT columns: Volt, Curr, CurrTot (consumed mAh)
    int volt_idx = find_column_index(*bat_fmt, "Volt");
    int curr_idx = find_column_index(*bat_fmt, "Curr");
    if (volt_idx < 0) return result; // minimal requirement

    std::vector<double> times = extract_time_series_seconds(*bat_fmt);
    if (times.empty()) return result;

    int ctot_idx = find_column_index(*bat_fmt, "CurrTot");

    size_t count = std::min(
        times.size(),
        static_cast<size_t>(py::len(bat_fmt->columns_data[volt_idx]))
    );

    for (size_t i = 0; i < count; ++i) {
        py::dict entry;
        entry["t_s"]  = round3(times[i]);
        entry["volt"] = py_object_to_string(bat_fmt->columns_data[volt_idx][i]);
        if (curr_idx >= 0 && i < static_cast<size_t>(py::len(bat_fmt->columns_data[curr_idx]))) {
            entry["curr"] = py_object_to_string(bat_fmt->columns_data[curr_idx][i]);
        }
        if (ctot_idx >= 0 && i < static_cast<size_t>(py::len(bat_fmt->columns_data[ctot_idx]))) {
            entry["consumed_mah"] = py_object_to_string(bat_fmt->columns_data[ctot_idx][i]);
        }
        result.append(entry);
    }
    return result;
}

// GPS quality
py::list build_gps_quality_series(const FormatDef* gps_fmt) {
    py::list result;
    if (!gps_fmt) return result;

    int status_idx = find_column_index(*gps_fmt, "Status");
    int hdop_idx   = find_column_index(*gps_fmt, "HDop");
    int sats_idx   = find_column_index(*gps_fmt, "NSats");
    // fallback column names used in some AP versions
    if (sats_idx < 0) sats_idx = find_column_index(*gps_fmt, "Sats");

    if (status_idx < 0 && hdop_idx < 0 && sats_idx < 0) return result;

    std::vector<double> times = extract_time_series_seconds(*gps_fmt);
    if (times.empty()) return result;

    size_t count = times.size();

    for (size_t i = 0; i < count; ++i) {
        py::dict entry;
        entry["t_s"] = round3(times[i]);
        if (status_idx >= 0 && i < static_cast<size_t>(py::len(gps_fmt->columns_data[status_idx])))
            entry["fix"] = py_object_to_string(gps_fmt->columns_data[status_idx][i]);
        if (hdop_idx >= 0 && i < static_cast<size_t>(py::len(gps_fmt->columns_data[hdop_idx])))
            entry["hdop"] = py_object_to_string(gps_fmt->columns_data[hdop_idx][i]);
        if (sats_idx >= 0 && i < static_cast<size_t>(py::len(gps_fmt->columns_data[sats_idx])))
            entry["sats"] = py_object_to_string(gps_fmt->columns_data[sats_idx][i]);
        result.append(entry);
    }
    return result;
}

// ATT series
py::list build_att_series(const std::vector<AttSample>& att_samples) {
    py::list result;
    for (const auto& s : att_samples) {
        py::dict entry;
        entry["t_s"]       = round3(s.time_s);
        entry["roll_deg"]  = round3(s.roll_deg);
        entry["pitch_deg"] = round3(s.pitch_deg);
        entry["yaw_deg"]   = round3(s.yaw_deg);
        result.append(entry);
    }
    return result;
}

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

    std::vector<GpsSample> raw_gps = build_gps_samples(*gps_fmt);
    CleanGpsData clean_gps = clean_gps_anomalies(raw_gps);
    const std::vector<GpsSample>& gps_samples = clean_gps.samples;

    if (gps_samples.empty()) {
        throw std::runtime_error("No valid GPS samples left after filtering anomalies");
    }

    std::vector<AttSample> att_samples = build_att_samples(att_fmt);
    
    // Extracted Trajectory building directly merges the ENU and Global results here.
    py::dict trajectory = build_trajectory_payload(gps_samples, att_samples);

    double altitude_gain_m = 0.0;
    double start_alt_m = gps_samples.front().alt_m;
    for (const auto& sample : gps_samples) {
        altitude_gain_m = std::max(altitude_gain_m, sample.alt_m - start_alt_m);
    }

    py::list warnings;
    py::object imu_sampling = py::none();
    py::object max_h_speed = py::none();
    py::object max_v_speed = py::none();
    py::object max_acc = py::none();
    py::list imu_speed_series;
    py::list imu_acc_series;
    py::object kf_altitude_series = py::none();

    py::object imu_message_name = py::none();
    if (imu_fmt) {
        imu_message_name = py::str(imu_fmt->name);
        try {
            std::vector<ImuSample> imu_samples = build_imu_samples(*imu_fmt, att_samples);
            
            // Pass both IMU and CLEANED GPS samples to our new fusion function
            py::dict imu_analysis = analyze_imu_series(imu_samples, gps_samples);
            
            imu_sampling = imu_analysis["sampling_hz"];
            max_h_speed = imu_analysis["max_horizontal_speed_mps"];
            max_v_speed = imu_analysis["max_vertical_speed_mps"];
            max_acc = imu_analysis["max_acceleration_mps2"];
            imu_speed_series = imu_analysis["speed_series"].cast<py::list>();
            imu_acc_series = imu_analysis["acceleration_series"].cast<py::list>();
            
            // Extract high-res KF altitude 
            kf_altitude_series = imu_analysis["altitude_series"];
            altitude_gain_m = imu_analysis["max_altitude_gain_m"].cast<double>();
        } catch (const std::exception& exc) {
            warnings.append(exc.what());
        }
    } else {
        warnings.append("No IMU message found; IMU-derived metrics are unavailable");
    }

    for (const auto& warning : clean_gps.warnings) {
        warnings.append(warning);
    }

    py::dict metrics;
    metrics["total_distance_m"] = round3(clean_gps.total_distance_m);
    metrics["flight_duration_s"] = round3(gps_samples.back().time_s - gps_samples.front().time_s);
    metrics["max_altitude_gain_m"] = round3(altitude_gain_m);
    metrics["max_horizontal_speed_mps"] = max_h_speed;
    metrics["max_vertical_speed_mps"] = max_v_speed;
    metrics["max_acceleration_mps2"] = max_acc;

    py::dict sampling;
    sampling["gps_hz"] = sampling_hz_or_none([&]() {
        std::vector<double> times;
        times.reserve(gps_samples.size());
        for (const auto& sample : gps_samples) {
            times.push_back(sample.time_s);
        }
        return times;
    }());
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
    py::list anomalies = detect_anomalies(max_h_speed, max_v_speed, max_acc);
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

    // Extra telemetry for AI context
    py::list parm_list   = build_parm_list(parm_fmt);
    py::list mode_list   = build_mode_list(mode_fmt);
    py::list err_list    = build_err_list(err_fmt);
    py::list bat_series  = build_bat_series(bat_fmt);
    py::list gps_quality = build_gps_quality_series(gps_fmt);
    py::list att_series  = build_att_series(att_samples);

    py::dict result;
    result["summary"]     = summary;
    result["sampling"]    = sampling;
    result["units"]       = units;
    result["metrics"]     = metrics;
    result["trajectory"]  = trajectory; // Now contains "enu", "global", and "speed_series"
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
    using namespace pybind11::literals;

    m.doc() = "pybind11 ArduPilot BIN parser and flight analysis module";

    m.def("parse_ardupilot_bin", &parse_ardupilot_bin, "Parses an Ardupilot Dataflash .bin log from raw bytes");
    m.def("analyze_flight_log", &analyze_flight_log, "Runs full flight analysis and builds separated global/enu trajectories in a single pass");
}