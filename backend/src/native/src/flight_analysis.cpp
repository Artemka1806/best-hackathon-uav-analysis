#include "flight_analysis.hpp"
#include "math_utils.hpp"

#include <cmath>
#include <algorithm>
#include <sstream>

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
                result.warnings.push_back(warning.str());
                
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
                result.warnings.push_back(warning.str());
            }
            continue;
        }

        consecutive_drops = 0;
        result.total_distance_m += distance_m;
        result.samples.push_back(current);
    }

    return result;
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

PositionVelocityKF::PositionVelocityKF(const Eigen::Vector3d& initial_pos) {
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

void PositionVelocityKF::predict(double dt, const Eigen::Vector3d& acc_enu) {
    F_.block<3, 3>(0, 3) = Eigen::Matrix3d::Identity() * dt;

    B_.block<3, 3>(0, 0) = Eigen::Matrix3d::Identity() * (0.5 * dt * dt);
    B_.block<3, 3>(3, 0) = Eigen::Matrix3d::Identity() * dt;

    x_ = F_ * x_ + B_ * acc_enu;
    P_ = F_ * P_ * F_.transpose() + Q_;
}

void PositionVelocityKF::update(const Eigen::Vector3d& pos_enu) {
    Eigen::Vector3d y = pos_enu - H_ * x_;
    Eigen::Matrix3d S = H_ * P_ * H_.transpose() + R_;
    
    Eigen::Matrix<double, 6, 3> K = P_ * H_.transpose() * S.inverse();

    x_ = x_ + K * y;
    P_ = (Eigen::Matrix<double, 6, 6>::Identity() - K * H_) * P_;
}

Eigen::Vector3d PositionVelocityKF::get_position() const { return x_.head<3>(); }

Eigen::Vector3d PositionVelocityKF::get_velocity() const { return x_.tail<3>(); }

ImuAnalysisResult analyze_imu_series(const std::vector<ImuSample>& imu_samples, const std::vector<GpsSample>& gps_samples) {
    ImuAnalysisResult result;
    if (imu_samples.empty() || gps_samples.empty()) {
        return result;
    }

    auto magnitude = [](const ImuSample& sample) {
        return std::sqrt(sample.acc_e * sample.acc_e + sample.acc_n * sample.acc_n + sample.acc_u * sample.acc_u);
    };

    result.times_s.reserve(imu_samples.size());
    result.h_speeds.reserve(imu_samples.size());
    result.v_speeds.reserve(imu_samples.size());
    result.accelerations.reserve(imu_samples.size());
    result.altitudes.reserve(imu_samples.size());

    // Initial state
    result.times_s.push_back(imu_samples.front().time_s);
    result.h_speeds.push_back(0.0);
    result.v_speeds.push_back(0.0);
    result.accelerations.push_back(imu_samples.front().acc_u);
    result.altitudes.push_back(0.0);

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
        double v_speed = vel.z();
        double acc_mag = magnitude(current);
        double current_alt = kf.get_position().z();

        result.max_h_speed = std::max(result.max_h_speed, h_speed);
        result.max_v_speed = std::max(result.max_v_speed, std::abs(v_speed));
        result.max_acc = std::max(result.max_acc, acc_mag);
        result.max_alt = std::max(result.max_alt, current_alt);

        result.times_s.push_back(current.time_s);
        result.h_speeds.push_back(h_speed);
        result.v_speeds.push_back(v_speed);
        result.accelerations.push_back(current.acc_u);
        result.altitudes.push_back(current_alt);
    }

    // Calculate sampling rate
    std::vector<double> times;
    times.reserve(imu_samples.size());
    for (const auto& sample : imu_samples) {
        times.push_back(sample.time_s);
    }
    std::vector<double> deltas = monotonic_deltas(times);
    double dt = median_of(deltas);
    
    if (dt > 0.0 && !std::isnan(dt)) {
        result.sampling_hz = 1.0 / dt;
        result.has_sampling_hz = true;
    }

    return result;
}

std::vector<std::string> detect_anomalies(double max_h_speed, double max_v_speed, double max_acc) {
    std::vector<std::string> anomalies;

    if (max_v_speed > 8.0) {
        anomalies.push_back("High vertical speed detected");
    }
    if (max_acc > 20.0) {
        anomalies.push_back("High acceleration spike detected");
    }
    if (max_h_speed > 30.0) {
        anomalies.push_back("High horizontal speed detected");
    }
    
    return anomalies;
}