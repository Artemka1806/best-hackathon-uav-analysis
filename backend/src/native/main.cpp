#include <pybind11/pybind11.h>
#include <pybind11/eigen.h> // For automatic type conversion between Eigen and NumPy
#include <pybind11/stl.h>   // For automatic conversion of STL containers
#include <Eigen/Dense>
#include <string_view>
#include <unordered_map>
#include <vector>
#include <string>
#include <sstream>
#include <cstring>
#include <stdexcept>
#include <cmath>

namespace py = pybind11;

// A simple function to add two integers
int add(int i, int j) {
    return i + j;
}

// A function that adds two Eigen matrices.
// pybind11 will handle the conversion from NumPy arrays to Eigen::MatrixXd.
Eigen::MatrixXd add_matrices(const Eigen::MatrixXd& m1, const Eigen::MatrixXd& m2) {
    if (m1.rows() != m2.rows() || m1.cols() != m2.cols()) {
        throw std::invalid_argument("Input matrices must have the same dimensions");
    }
    return m1 + m2;
}

// --- Ardupilot Parsing Logic ---

struct FormatDef {
    uint8_t type;
    uint8_t length;
    std::string name;
    std::string format;
    std::vector<std::string> columns;
    std::vector<py::list> columns_data;
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
    std::istringstream tokenStream(s);
    while (std::getline(tokenStream, token, delimiter)) {
        tokens.push_back(token);
    }
    return tokens;
}

/**
 * @brief Parses an Ardupilot Dataflash (.bin) log from a raw byte buffer.
 * * This function scans the binary buffer for Ardupilot packet signatures, decodes
 * FMT (format) definitions on-the-fly, and organizes the corresponding payload 
 * data into columnar formats.
 * * @param data The raw binary data of the .bin file passed as py::bytes.
 * @return py::dict A Python dictionary where keys are message names (e.g., "IMU", "GPS")
 * and values are dictionaries mapping column names to lists of values.
 * @warning This function loads the entire parsed structure into memory. 
 * For extremely large logs (>1GB), it might consume significant RAM.
 */
py::dict parse_ardupilot_bin(py::bytes data) {
    std::string_view buf = data;
    const char* ptr = buf.data();
    const char* end = ptr + buf.size();

    std::unordered_map<uint8_t, FormatDef> formats;

    while (ptr + 2 < end) {
        // Check for Ardupilot magic header bytes
        if ((uint8_t)ptr[0] == 0xA3 && (uint8_t)ptr[1] == 0x95) {
            uint8_t msg_type = ptr[2];

            if (msg_type == 0x80) { 
                // FMT message: length is strictly 89 bytes
                if (ptr + 89 > end) break; 

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

                    // Initialize the python lists for columnar data
                    for (size_t i = 0; i < fmt.columns.size(); ++i) {
                        fmt.columns_data.push_back(py::list());
                    }

                    formats[def_type] = fmt;
                }
                ptr += 89;
            } else {
                auto it = formats.find(msg_type);
                if (it != formats.end()) {
                    FormatDef& fmt = it->second;
                    
                    if (ptr + fmt.length > end) break; // Incomplete message block

                    const char* data_ptr = ptr + 3; // Skip header 0xA3 0x95 and MsgType

                    if (fmt.columns.size() == fmt.format.size()) {
                        for (size_t col = 0; col < fmt.format.size(); ++col) {
                            char f = fmt.format[col];
                            if (data_ptr >= ptr + fmt.length) break; // Safety bounds

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
                                case 'c': fmt.columns_data[col].append(read_val<int16_t>(data_ptr) / 100.0f); break;
                                case 'C': fmt.columns_data[col].append(read_val<uint16_t>(data_ptr) / 100.0f); break;
                                case 'e': fmt.columns_data[col].append(read_val<int32_t>(data_ptr) / 100.0f); break;
                                case 'E': fmt.columns_data[col].append(read_val<uint32_t>(data_ptr) / 100.0f); break;
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
                                    // Unknown format flag, safely skip the rest of this packet
                                    data_ptr = ptr + fmt.length; 
                                    break;
                            }
                        }
                    }
                    ptr += fmt.length;
                } else {
                    // Unknown message type, step 1 byte to re-sync
                    ptr++;
                }
            }
        } else {
            // Not a header byte, step 1 byte to re-sync
            ptr++;
        }
    }

    // Pack into a structured Python dictionary
    py::dict final_result;
    for (auto& [type, fmt] : formats) {
        py::dict msg_dict;
        for (size_t i = 0; i < fmt.columns.size(); ++i) {
            msg_dict[py::str(fmt.columns[i])] = fmt.columns_data[i];
        }
        final_result[py::str(fmt.name)] = msg_dict;
    }

    return final_result;
}

/**
 * @brief Converts GPS coordinates from a .BIN log to local ENU (East-North-Up) in meters.
 *
 * WGS-84 ellipsoid constants:
 *   a  = 6378137.0 m  (semi-major axis)
 *   f  = 1/298.257223563 (flattening)
 *   e2 = 2f - f^2  (first eccentricity squared)
 *
 * Geodetic -> ECEF:
 *   N = a / sqrt(1 - e2 * sin^2(lat))
 *   X = (N + alt) * cos(lat) * cos(lon)
 *   Y = (N + alt) * cos(lat) * sin(lon)
 *   Z = (N*(1-e2) + alt) * sin(lat)
 *
 * ECEF -> ENU (relative to reference point lat0, lon0):
 *   dX = X - X0,  dY = Y - Y0,  dZ = Z - Z0
 *   E =  -sin(lon0)*dX + cos(lon0)*dY
 *   N = -sin(lat0)*cos(lon0)*dX - sin(lat0)*sin(lon0)*dY + cos(lat0)*dZ
 *   U =  cos(lat0)*cos(lon0)*dX + cos(lat0)*sin(lon0)*dY + sin(lat0)*dZ
 *
 * @param data  Raw .BIN bytes (py::bytes)
 * @return py::dict with:
 *   "origin": {"lat": deg, "lon": deg, "alt": m}
 *   "points": list of {"e","n","u","lat","lon","alt","t"}
 */
py::dict convert_gps_to_enu(py::bytes data) {
    // WGS-84 constants
    const double a  = 6378137.0;
    const double f  = 1.0 / 298.257223563;
    const double e2 = 2.0 * f - f * f;

    auto geodetic_to_ecef = [&](double lat_rad, double lon_rad, double alt,
                                double& X, double& Y, double& Z) {
        double sin_lat = std::sin(lat_rad);
        double cos_lat = std::cos(lat_rad);
        double sin_lon = std::sin(lon_rad);
        double cos_lon = std::cos(lon_rad);
        double N = a / std::sqrt(1.0 - e2 * sin_lat * sin_lat);
        X = (N + alt) * cos_lat * cos_lon;
        Y = (N + alt) * cos_lat * sin_lon;
        Z = (N * (1.0 - e2) + alt) * sin_lat;
    };

    std::string_view buf = data;
    const char* ptr = buf.data();
    const char* end = ptr + buf.size();

    std::unordered_map<uint8_t, FormatDef> formats;

    // First pass: collect FMT definitions and GPS+ATT data
    while (ptr + 2 < end) {
        if ((uint8_t)ptr[0] == 0xA3 && (uint8_t)ptr[1] == 0x95) {
            uint8_t msg_type = ptr[2];

            if (msg_type == 0x80) {
                if (ptr + 89 > end) break;

                uint8_t def_type = (uint8_t)ptr[3];
                uint8_t def_len  = (uint8_t)ptr[4];

                if (formats.find(def_type) == formats.end()) {
                    FormatDef fmt;
                    fmt.type   = def_type;
                    fmt.length = def_len;

                    const char* d_ptr = ptr + 5;
                    fmt.name    = read_str(d_ptr, 4);
                    fmt.format  = read_str(d_ptr, 16);
                    std::string cols_str = read_str(d_ptr, 64);
                    fmt.columns = split_columns(cols_str, ',');
                    for (size_t i = 0; i < fmt.columns.size(); ++i) {
                        fmt.columns_data.push_back(py::list());
                    }
                    formats[def_type] = fmt;
                }
                ptr += 89;
            } else {
                auto it = formats.find(msg_type);
                if (it != formats.end()) {
                    FormatDef& fmt = it->second;
                    if (ptr + fmt.length > end) break;

                    // Collect GPS and ATT messages
                    if ((fmt.name == "GPS" || fmt.name == "ATT") && fmt.columns.size() == fmt.format.size()) {
                        const char* data_ptr = ptr + 3;
                        for (size_t col = 0; col < fmt.format.size(); ++col) {
                            char f_char = fmt.format[col];
                            if (data_ptr >= ptr + fmt.length) break;
                            switch (f_char) {
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
                                case 'c': fmt.columns_data[col].append(read_val<int16_t>(data_ptr) / 100.0f); break;
                                case 'C': fmt.columns_data[col].append(read_val<uint16_t>(data_ptr) / 100.0f); break;
                                case 'e': fmt.columns_data[col].append(read_val<int32_t>(data_ptr) / 100.0f); break;
                                case 'E': fmt.columns_data[col].append(read_val<uint32_t>(data_ptr) / 100.0f); break;
                                case 'L': fmt.columns_data[col].append(read_val<int32_t>(data_ptr)); break;
                                case 'M': fmt.columns_data[col].append(read_val<uint8_t>(data_ptr)); break;
                                case 'q': fmt.columns_data[col].append(read_val<int64_t>(data_ptr)); break;
                                case 'Q': fmt.columns_data[col].append(read_val<uint64_t>(data_ptr)); break;
                                case 'a': {
                                    py::list arr;
                                    for (int k = 0; k < 32; ++k) arr.append(read_val<int16_t>(data_ptr));
                                    fmt.columns_data[col].append(arr);
                                    break;
                                }
                                default:
                                    data_ptr = ptr + fmt.length;
                                    break;
                            }
                        }
                    }
                    ptr += fmt.length;
                } else {
                    ptr++;
                }
            }
        } else {
            ptr++;
        }
    }

    // Find the GPS FormatDef by name
    FormatDef* gps_fmt = nullptr;
    for (auto& [type, fmt] : formats) {
        if (fmt.name == "GPS") {
            gps_fmt = &fmt;
            break;
        }
    }

    if (!gps_fmt) {
        throw std::runtime_error("No GPS messages found in log");
    }

    // Locate column indices for Lat, Lng, Alt, TimeUS
    auto find_col = [&](const std::string& name) -> int {
        for (size_t i = 0; i < gps_fmt->columns.size(); ++i) {
            if (gps_fmt->columns[i] == name) return (int)i;
        }
        return -1;
    };

    int lat_idx    = find_col("Lat");
    int lng_idx    = find_col("Lng");
    int alt_idx    = find_col("Alt");
    int time_idx   = find_col("TimeUS");

    if (lat_idx < 0 || lng_idx < 0 || alt_idx < 0) {
        throw std::runtime_error("GPS message missing Lat/Lng/Alt columns");
    }

    size_t n_pts = py::len(gps_fmt->columns_data[lat_idx]);
    if (n_pts == 0) {
        throw std::runtime_error("No GPS data points found");
    }

    // Extract raw values; Lat/Lng are 'L' (int32 * 1e-7 degrees)
    auto get_double = [&](int col_idx, size_t row) -> double {
        py::object val = gps_fmt->columns_data[col_idx][row];
        return val.cast<double>();
    };

    // Find ATT format and its columns
    FormatDef* att_fmt = nullptr;
    for (auto& [type, fmt] : formats) {
        if (fmt.name == "ATT") { att_fmt = &fmt; break; }
    }

    // Build ATT lookup: vector of (TimeUS, roll_deg, pitch_deg, yaw_deg)
    struct AttSample { double t, roll, pitch, yaw; };
    std::vector<AttSample> att_samples;
    if (att_fmt) {
        auto fc = [&](const std::string& name) -> int {
            for (size_t i = 0; i < att_fmt->columns.size(); ++i)
                if (att_fmt->columns[i] == name) return (int)i;
            return -1;
        };
        int at  = fc("TimeUS"), ar = fc("Roll"), ap = fc("Pitch"), ay = fc("Yaw");
        if (at >= 0 && ar >= 0 && ap >= 0 && ay >= 0) {
            size_t n = py::len(att_fmt->columns_data[at]);
            att_samples.reserve(n);
            for (size_t i = 0; i < n; ++i) {
                att_samples.push_back({
                    att_fmt->columns_data[at][i].cast<double>(),
                    att_fmt->columns_data[ar][i].cast<double>(),
                    att_fmt->columns_data[ap][i].cast<double>(),
                    att_fmt->columns_data[ay][i].cast<double>(),
                });
            }
        }
    }

    // Binary search for closest ATT sample by TimeUS
    auto closest_att = [&](double t) -> AttSample {
        if (att_samples.empty()) return {t, 0, 0, 0};
        size_t lo = 0, hi = att_samples.size() - 1;
        while (lo < hi) {
            size_t mid = (lo + hi) / 2;
            if (att_samples[mid].t < t) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0 && std::abs(att_samples[lo-1].t - t) < std::abs(att_samples[lo].t - t))
            return att_samples[lo-1];
        return att_samples[lo];
    };

    // Reference origin: first valid point
    double lat0_deg = get_double(lat_idx, 0) * 1e-7;
    double lon0_deg = get_double(lng_idx, 0) * 1e-7;
    double alt0     = get_double(alt_idx, 0);

    double lat0_rad = lat0_deg * M_PI / 180.0;
    double lon0_rad = lon0_deg * M_PI / 180.0;

    double X0, Y0, Z0;
    geodetic_to_ecef(lat0_rad, lon0_rad, alt0, X0, Y0, Z0);

    // Precompute rotation terms for ECEF -> ENU
    double sin_lat0 = std::sin(lat0_rad);
    double cos_lat0 = std::cos(lat0_rad);
    double sin_lon0 = std::sin(lon0_rad);
    double cos_lon0 = std::cos(lon0_rad);

    py::list points;
    for (size_t i = 0; i < n_pts; ++i) {
        double lat_deg = get_double(lat_idx, i) * 1e-7;
        double lon_deg = get_double(lng_idx, i) * 1e-7;
        double alt     = get_double(alt_idx, i);
        double t       = (time_idx >= 0) ? get_double(time_idx, i) : 0.0;

        double lat_rad = lat_deg * M_PI / 180.0;
        double lon_rad = lon_deg * M_PI / 180.0;

        double X, Y, Z;
        geodetic_to_ecef(lat_rad, lon_rad, alt, X, Y, Z);

        double dX = X - X0;
        double dY = Y - Y0;
        double dZ = Z - Z0;

        double E =  -sin_lon0 * dX + cos_lon0 * dY;
        double N = -sin_lat0 * cos_lon0 * dX - sin_lat0 * sin_lon0 * dY + cos_lat0 * dZ;
        double U =  cos_lat0 * cos_lon0 * dX + cos_lat0 * sin_lon0 * dY + sin_lat0 * dZ;

        AttSample att = closest_att(t);

        py::dict pt;
        pt["e"]     = E;
        pt["n"]     = N;
        pt["u"]     = U;
        pt["lat"]   = lat_deg;
        pt["lon"]   = lon_deg;
        pt["alt"]   = alt;
        pt["t"]     = t;
        pt["roll"]  = att.roll;
        pt["pitch"] = att.pitch;
        pt["yaw"]   = att.yaw;
        points.append(pt);
    }

    py::dict origin;
    origin["lat"] = lat0_deg;
    origin["lon"] = lon0_deg;
    origin["alt"] = alt0;

    py::dict result;
    result["origin"] = origin;
    result["points"] = points;
    return result;
}

// The PYBIND11_MODULE macro creates a function that will be called when an import statement
// is issued from within Python. The module name (python_example) must match the
// name of the final shared library.
PYBIND11_MODULE(flight_parser, m) {
    m.doc() = "pybind11 example plugin with Eigen and Ardupilot BIN parser"; // Optional module docstring

    m.def("add", &add, "A function that adds two numbers");

    m.def("add_matrices", &add_matrices, "A function that adds two NumPy arrays (via Eigen)");

    m.def("parse_ardupilot_bin", &parse_ardupilot_bin, "Parses an Ardupilot Dataflash .bin log from raw bytes");

    m.def("convert_gps_to_enu", &convert_gps_to_enu, "Converts GPS log data to local ENU coordinates (meters) with WGS-84");
}