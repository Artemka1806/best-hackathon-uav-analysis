#pragma once

#include <vector>
#include <string>
#include <Eigen/Dense>

#include "types.hpp"

/**
 * @brief Self-healing filter for physically impossible GPS leaps (glitches/multipath).
 * Rejects jumps requiring absurd velocities (e.g. > Mach 1 for typical ArduPilot vehicles).
 * If consecutive bad points are found, the filter assumes the reference point was flawed
 * and resets the trajectory to the current stable point.
 * * @param raw_samples Unfiltered GPS samples.
 * @return CleanGpsData A structure containing the clean samples array and anomaly warnings.
 */
CleanGpsData clean_gps_anomalies(const std::vector<GpsSample>& raw_samples);

/**
 * @brief Finds the nearest attitude sample in time to a given timestamp.
 * * @param time_s Target timestamp in seconds.
 * @param att_samples Vector of available attitude samples.
 * @return AttSample The closest attitude sample.
 */
AttSample nearest_attitude(double time_s, const std::vector<AttSample>& att_samples);

/**
 * @brief Linear Kalman Filter for fusing ENU IMU accelerations with ENU GPS positions.
 * This filter maintains a 6D state vector consisting of 3D position and 3D velocity
 * in the East-North-Up (ENU) coordinate frame.
 */
class PositionVelocityKF {
public:
    /**
     * @brief Constructor initializes the filter matrices.
     * @param initial_pos Initial position vector in ENU [e, n, u].
     */
    PositionVelocityKF(const Eigen::Vector3d& initial_pos);

    /**
     * @brief Predicts the next state using IMU acceleration data.
     * @param dt Time delta since the last prediction in seconds.
     * @param acc_enu Acceleration vector in ENU frame [ae, an, au].
     */
    void predict(double dt, const Eigen::Vector3d& acc_enu);

    /**
     * @brief Updates the state estimation using GPS measurement data.
     * @param pos_enu Measured position vector in ENU frame [e, n, u].
     */
    void update(const Eigen::Vector3d& pos_enu);

    /**
     * @brief Retrieves the current position estimate.
     * @return Eigen::Vector3d Current [e, n, u] position.
     */
    Eigen::Vector3d get_position() const;

    /**
     * @brief Retrieves the current velocity estimate.
     * @return Eigen::Vector3d Current [ve, vn, vu] velocity.
     */
    Eigen::Vector3d get_velocity() const;

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
 * @brief Container for the pure C++ results of IMU and GPS sensor fusion.
 */
struct ImuAnalysisResult {
    std::vector<double> times_s;
    std::vector<double> h_speeds;
    std::vector<double> v_speeds;
    std::vector<double> accelerations;
    std::vector<double> altitudes;
    
    double max_h_speed{0.0};
    double max_v_speed{0.0};
    double max_acc{0.0};
    double max_alt{0.0};
    
    double sampling_hz{0.0};
    bool has_sampling_hz{false};
};

/**
 * @brief Fuses IMU and GPS data to analyze speeds and accelerations.
 * Uses a Kalman Filter to prevent drift from double integration. Uses
 * trapezoidal integration internally to satisfy hackathon MVP requirements.
 * * @param imu_samples Vector of IMU samples.
 * @param gps_samples Vector of CLEANED GPS samples for position updates.
 * @return ImuAnalysisResult Struct containing clean C++ vectors of speeds, accelerations, and max values.
 */
ImuAnalysisResult analyze_imu_series(const std::vector<ImuSample>& imu_samples, const std::vector<GpsSample>& gps_samples);

/**
 * @brief Detects physical anomalies in the flight based on threshold violations.
 * * @param max_h_speed Maximum horizontal speed.
 * @param max_v_speed Maximum vertical speed.
 * @param max_acc Maximum acceleration.
 * @return std::vector<std::string> List of detected anomalies.
 */
std::vector<std::string> detect_anomalies(double max_h_speed, double max_v_speed, double max_acc);