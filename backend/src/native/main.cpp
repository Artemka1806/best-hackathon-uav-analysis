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

// The PYBIND11_MODULE macro creates a function that will be called when an import statement
// is issued from within Python. The module name (python_example) must match the
// name of the final shared library.
PYBIND11_MODULE(python_example, m) {
    m.doc() = "pybind11 example plugin with Eigen and Ardupilot BIN parser"; // Optional module docstring

    m.def("add", &add, "A function that adds two numbers");

    m.def("add_matrices", &add_matrices, "A function that adds two NumPy arrays (via Eigen)");
    
    m.def("parse_ardupilot_bin", &parse_ardupilot_bin, "Parses an Ardupilot Dataflash .bin log from raw bytes");
}