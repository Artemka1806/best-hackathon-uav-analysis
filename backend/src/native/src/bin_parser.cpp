#include "bin_parser.hpp"
#include "math_utils.hpp"
#include "flight_analysis.hpp"

#include <cstring>
#include <sstream>
#include <stdexcept>
#include <algorithm>
#include <limits>

using namespace pybind11::literals;

namespace {

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

double py_obj_to_double(const py::handle& value) {
    return value.cast<double>();
}

} // namespace

std::unordered_map<uint8_t, FormatDef> collect_formats(
    std::string_view buf,
    const std::optional<std::set<std::string>>& filter
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

int find_column_index(const FormatDef& fmt, const std::string& name) {
    for (size_t i = 0; i < fmt.columns.size(); ++i) {
        if (fmt.columns[i] == name) {
            return static_cast<int>(i);
        }
    }
    return -1;
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