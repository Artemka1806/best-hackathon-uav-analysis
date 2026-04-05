#pragma once

#include <vector>
#include <tuple>
#include <Eigen/Dense>
#include <Eigen/Geometry>

#include "types.hpp"

constexpr double kEarthRadiusMeters = 6371000.0;
constexpr double kWgs84A = 6378137.0;
constexpr double kWgs84F = 1.0 / 298.257223563;
constexpr double kGravityMps2 = 9.80665;

/**
 * @brief Rounds a double value to 3 decimal places.
 * @param value The value to round.
 * @return Rounded value.
 */
double round3(double value);

/**
 * @brief Calculates the great-circle distance between two points on a sphere.
 * @param lat1_deg Latitude of point 1 in degrees.
 * @param lon1_deg Longitude of point 1 in degrees.
 * @param lat2_deg Latitude of point 2 in degrees.
 * @param lon2_deg Longitude of point 2 in degrees.
 * @return Distance in meters.
 */
double haversine_m(double lat1_deg, double lon1_deg, double lat2_deg, double lon2_deg);

/**
 * @brief Converts geodetic coordinates to Earth-Centered, Earth-Fixed (ECEF) coordinates.
 * @param lat_deg Latitude in degrees.
 * @param lon_deg Longitude in degrees.
 * @param alt_m Altitude in meters.
 * @return EcefPoint struct containing X, Y, Z in meters.
 */
EcefPoint geodetic_to_ecef(double lat_deg, double lon_deg, double alt_m);

/**
 * @brief Converts an ECEF coordinate delta to East-North-Up (ENU) local tangent plane coordinates.
 * @param lat0_deg Reference latitude in degrees.
 * @param lon0_deg Reference longitude in degrees.
 * @param origin Reference ECEF point (takeoff location).
 * @param point Target ECEF point to convert.
 * @return Tuple containing East, North, and Up coordinates in meters.
 */
std::tuple<double, double, double> ecef_delta_to_enu(
    double lat0_deg,
    double lon0_deg,
    const EcefPoint& origin,
    const EcefPoint& point
);

/**
 * @brief Rotates body-frame accelerations to the ENU frame and removes gravity.
 * @param ax Body X acceleration.
 * @param ay Body Y acceleration.
 * @param az Body Z acceleration.
 * @param roll_deg Roll angle in degrees.
 * @param pitch_deg Pitch angle in degrees.
 * @param yaw_deg Yaw angle in degrees.
 * @return Tuple containing ENU accelerations (East, North, Up).
 */
std::tuple<double, double, double> body_acc_to_enu_linear(
    double ax,
    double ay,
    double az,
    double roll_deg,
    double pitch_deg,
    double yaw_deg
);

/**
 * @brief Calculates strictly positive time deltas between samples.
 * @param times Vector of timestamps.
 * @return Vector of positive deltas.
 */
std::vector<double> monotonic_deltas(const std::vector<double>& times);

/**
 * @brief Computes the median value of a numerical vector.
 * @param values Vector of values.
 * @return The median value, or NaN if empty.
 */
double median_of(std::vector<double> values);