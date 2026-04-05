#include "pybind_formatters.hpp"
#include "math_utils.hpp"
#include "flight_analysis.hpp"
#include "bin_parser.hpp"

#include <cmath>
#include <limits>
#include <algorithm>
#include <sstream>

using namespace pybind11::literals;

namespace {

// Internal helper for subsampling large arrays for AI context
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

} // namespace

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
        enu_point["valid_segment_from_previous"] = true; 
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
    for (const auto& sample : gps_samples) {
        altitude.append(py::dict(
            "t"_a = round3(sample.time_s),
            "value"_a = round3(sample.alt_m)
        ));
    }
    py::dict result;
    result["altitude"] = altitude;
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

std::string build_ai_context_toon(const py::dict& analysis_payload) {
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
        int sats_min = std::numeric_limits<int>::max();
        int sats_max = std::numeric_limits<int>::min();

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
        if (sats_min < std::numeric_limits<int>::max()) {
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