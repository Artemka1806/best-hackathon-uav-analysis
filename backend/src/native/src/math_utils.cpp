#include "math_utils.hpp"
#include <cmath>
#include <algorithm>
#include <limits>

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