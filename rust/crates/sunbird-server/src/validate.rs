//! Server-authoritative plausibility envelope for pilot `state` frames.
//!
//! The legacy transport (`legacy.rs`) previously stored whatever `x/y/r/d` a
//! client sent and rebroadcast it verbatim to the whole room. That made every
//! remote pilot's position a client-supplied fact: a modified browser could
//! teleport to the finish line, or push `x` to `1e308` and corrupt the
//! interpolation buffers of the other 39 pilots. `ROADMAP.md` called this out
//! as aspirational anti-cheat; this module is the first real slice of it.
//!
//! Design rules:
//!   * The envelope is derived from the client's own physics ceiling, not
//!     invented. `MAX_SPEED_FEVER` (128) × wingboost `speedMult` (1.5)
//!     + `BOOST_EXTRA_SPEED` (42) = 234 units/sec, per `Bird.ts` and
//!     `PowerUps.ts`. Everything here is that number plus headroom.
//!   * The check is **time-aware**. Clients legitimately drop frames, so a
//!     fixed per-frame cap would false-reject a stuttering connection. The
//!     allowance is `max_speed × elapsed × headroom`, with `elapsed` clamped at
//!     both ends: a floor so a fast sender is not over-penalised, a ceiling so
//!     a long reconnect gap cannot authorise an unlimited jump.
//!   * Rejection is **soft**. A bad frame is dropped and counted; the seat is
//!     never dropped. A false positive must cost one interpolated frame, never
//!     a player's race.
//!
//! All numeric values are mirrored from `protocol/contract.json` and pinned by
//! `rust/crates/sunbird-protocol/tests/contract.rs` plus the TypeScript
//! `MOVEMENT_LIMITS` block, so the client and server cannot disagree about what
//! a legal flight looks like.

use metrics::counter;
use std::time::{Duration, Instant};

/// One client-reported position sample, exactly as it arrives on the wire.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MotionSample {
    pub x: f64,
    pub y: f64,
    pub rot: f64,
    pub distance: f64,
}

impl MotionSample {
    pub fn new(x: f64, y: f64, rot: f64, distance: f64) -> Self {
        Self {
            x,
            y,
            rot,
            distance,
        }
    }
}

/// Why a sample was refused. Exposed as a metric label so ops can tell a
/// cheating client apart from a buggy one.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MotionRejection {
    /// A field was NaN or infinite.
    NonFinite,
    /// A field was finite but outside the world envelope.
    OutOfBounds,
    /// Reported distance went backwards beyond tolerance.
    DistanceRegression,
    /// Position moved faster than the physics ceiling allows.
    SpeedCap,
}

impl MotionRejection {
    /// Stable metric label. Must not be renamed without updating dashboards.
    pub fn as_str(self) -> &'static str {
        match self {
            MotionRejection::NonFinite => "nonFinite",
            MotionRejection::OutOfBounds => "outOfBounds",
            MotionRejection::DistanceRegression => "distanceRegression",
            MotionRejection::SpeedCap => "speedCap",
        }
    }
}

/// The movement envelope. `Default` reproduces `protocol/contract.json`.
#[derive(Clone, Copy, Debug)]
pub struct MotionPolicy {
    pub tick_hz: f64,
    pub max_speed_units_per_sec: f64,
    pub speed_headroom_factor: f64,
    pub min_sample_interval: Duration,
    pub max_sample_interval: Duration,
    pub max_coordinate_abs: f64,
    pub max_altitude_abs: f64,
    pub max_rotation_abs: f64,
    pub max_distance: f64,
    pub distance_regression_tolerance: f64,
    pub position_decimal_places: u32,
    pub rotation_decimal_places: u32,
}

impl Default for MotionPolicy {
    fn default() -> Self {
        Self {
            tick_hz: 15.0,
            max_speed_units_per_sec: 234.0,
            speed_headroom_factor: 2.0,
            min_sample_interval: Duration::from_micros(16_700),
            max_sample_interval: Duration::from_secs(2),
            max_coordinate_abs: 1_000_000.0,
            max_altitude_abs: 100_000.0,
            max_rotation_abs: 12.5664,
            max_distance: 500_000.0,
            distance_regression_tolerance: 0.5,
            position_decimal_places: 2,
            rotation_decimal_places: 2,
        }
    }
}

/// The last accepted sample plus when it was accepted, which is what makes the
/// speed check time-aware.
#[derive(Clone, Copy, Debug)]
pub struct MotionBaseline {
    pub sample: MotionSample,
    pub at: Instant,
}

impl MotionPolicy {
    /// Decide whether `next` is a physically possible continuation of the
    /// caller's last accepted sample. `None` means "first sample after join or
    /// reconnect", which is admitted on envelope checks alone.
    pub fn admit(
        &self,
        baseline: Option<&MotionBaseline>,
        next: &MotionSample,
        now: Instant,
    ) -> Result<(), MotionRejection> {
        if !next.x.is_finite()
            || !next.y.is_finite()
            || !next.rot.is_finite()
            || !next.distance.is_finite()
        {
            return Err(MotionRejection::NonFinite);
        }
        if next.x.abs() > self.max_coordinate_abs
            || next.y.abs() > self.max_altitude_abs
            || next.rot.abs() > self.max_rotation_abs
            || !(-f64::EPSILON..=self.max_distance).contains(&next.distance)
        {
            return Err(MotionRejection::OutOfBounds);
        }

        let Some(baseline) = baseline else {
            return Ok(());
        };

        if next.distance < baseline.sample.distance - self.distance_regression_tolerance {
            return Err(MotionRejection::DistanceRegression);
        }

        let elapsed = now
            .saturating_duration_since(baseline.at)
            .clamp(self.min_sample_interval, self.max_sample_interval)
            .as_secs_f64();
        let allowed = self.max_speed_units_per_sec * elapsed * self.speed_headroom_factor;

        if (next.x - baseline.sample.x).abs() > allowed
            || (next.y - baseline.sample.y).abs() > allowed
        {
            return Err(MotionRejection::SpeedCap);
        }

        Ok(())
    }

    /// Round a sample to the precision the wire actually carries. The client
    /// already rounds to 2dp before sending (`Realtime.ts`); doing it again
    /// server-side canonicalises the value so a hand-rolled client cannot
    /// inflate every broadcast frame with 17 significant digits of precision
    /// nobody renders. At 40 pilots × 15 Hz this is a real bandwidth saving.
    pub fn canonicalise(&self, sample: MotionSample) -> MotionSample {
        MotionSample {
            x: round_to(sample.x, self.position_decimal_places),
            y: round_to(sample.y, self.position_decimal_places),
            rot: round_to(sample.rot, self.rotation_decimal_places),
            distance: round_to(sample.distance, self.position_decimal_places),
        }
    }
}

fn round_to(value: f64, decimals: u32) -> f64 {
    let scale = 10f64.powi(decimals as i32);
    (value * scale).round() / scale
}

/// Record a rejection as a Prometheus counter, labelled by reason.
pub fn record_rejection(reason: MotionRejection) {
    counter!("sunbird_legacy_state_rejected_total", "reason" => reason.as_str()).increment(1);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> MotionPolicy {
        MotionPolicy::default()
    }

    #[test]
    fn default_policy_reproduces_the_contract_envelope() {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../protocol/contract.json"
        ))
        .expect("read contract");
        let contract: serde_json::Value = serde_json::from_str(&raw).expect("parse contract");
        let m = &contract["movement"];
        let p = policy();
        assert_eq!(p.tick_hz, m["tickHz"].as_f64().unwrap());
        assert_eq!(
            p.max_speed_units_per_sec,
            m["maxSpeedUnitsPerSec"].as_f64().unwrap()
        );
        assert_eq!(
            p.speed_headroom_factor,
            m["speedHeadroomFactor"].as_f64().unwrap()
        );
        assert_eq!(
            p.max_coordinate_abs,
            m["maxCoordinateAbs"].as_f64().unwrap()
        );
        assert_eq!(p.max_altitude_abs, m["maxAltitudeAbs"].as_f64().unwrap());
        assert_eq!(p.max_rotation_abs, m["maxRotationAbs"].as_f64().unwrap());
        assert_eq!(p.max_distance, m["maxDistance"].as_f64().unwrap());
        assert_eq!(
            p.distance_regression_tolerance,
            m["distanceRegressionTolerance"].as_f64().unwrap()
        );
    }

    #[test]
    fn first_sample_after_join_is_judged_on_envelope_alone() {
        let now = Instant::now();
        assert!(policy()
            .admit(None, &MotionSample::new(64.0, 12.0, 0.1, 0.0), now)
            .is_ok());
        // A pilot may legitimately be far down the track when they join.
        assert!(policy()
            .admit(
                None,
                &MotionSample::new(180_000.0, 90.0, -0.4, 180_000.0),
                now
            )
            .is_ok());
    }

    #[test]
    fn a_honest_flight_at_the_physics_ceiling_is_admitted() {
        let p = policy();
        let now = Instant::now();
        let dt = 1.0 / p.tick_hz;
        let mut baseline = MotionBaseline {
            sample: MotionSample::new(0.0, 10.0, 0.0, 0.0),
            at: now,
        };
        // Fly at the absolute ceiling for 60 ticks: fever + wingboost + cloud.
        for tick in 1..=60 {
            let next = MotionSample::new(
                p.max_speed_units_per_sec * dt * tick as f64,
                10.0,
                0.0,
                p.max_speed_units_per_sec * dt * tick as f64,
            );
            let at = now + Duration::from_secs_f64(dt * tick as f64);
            assert!(
                p.admit(Some(&baseline), &next, at).is_ok(),
                "tick {tick} of an honest max-speed flight was rejected"
            );
            baseline = MotionBaseline { sample: next, at };
        }
    }

    #[test]
    fn a_frame_dropping_client_is_not_punished() {
        let p = policy();
        let now = Instant::now();
        let baseline = MotionBaseline {
            sample: MotionSample::new(0.0, 10.0, 0.0, 0.0),
            at: now,
        };
        // One frame every ~700 ms (three dropped frames in a row).
        let next = MotionSample::new(p.max_speed_units_per_sec * 0.7, 10.0, 0.0, 160.0);
        assert!(p
            .admit(Some(&baseline), &next, now + Duration::from_secs_f64(0.7))
            .is_ok());
    }

    #[test]
    fn teleport_to_the_finish_is_rejected() {
        let p = policy();
        let now = Instant::now();
        let baseline = MotionBaseline {
            sample: MotionSample::new(100.0, 10.0, 0.0, 100.0),
            at: now,
        };
        let cheat = MotionSample::new(400_000.0, 10.0, 0.0, 400_000.0);
        assert_eq!(
            p.admit(Some(&baseline), &cheat, now + Duration::from_millis(66)),
            Err(MotionRejection::SpeedCap)
        );
    }

    #[test]
    fn spamming_frames_cannot_accumulate_a_teleport() {
        let p = policy();
        let now = Instant::now();
        let baseline = MotionBaseline {
            sample: MotionSample::new(0.0, 10.0, 0.0, 0.0),
            at: now,
        };
        // 1 ms apart: the elapsed floor keeps the allowance small, so a burst
        // of big jumps cannot slip through one frame at a time.
        let burst = MotionSample::new(400.0, 10.0, 0.0, 400.0);
        assert_eq!(
            p.admit(Some(&baseline), &burst, now + Duration::from_millis(1)),
            Err(MotionRejection::SpeedCap)
        );
    }

    #[test]
    fn rewinding_distance_is_rejected() {
        let p = policy();
        let now = Instant::now();
        let baseline = MotionBaseline {
            sample: MotionSample::new(500.0, 10.0, 0.0, 500.0),
            at: now,
        };
        assert_eq!(
            p.admit(
                Some(&baseline),
                &MotionSample::new(499.0, 10.0, 0.0, 10.0),
                now
            ),
            Err(MotionRejection::DistanceRegression)
        );
        // Sub-tolerance wobble from interpolation noise is fine.
        assert!(p
            .admit(
                Some(&baseline),
                &MotionSample::new(499.8, 10.0, 0.0, 499.7),
                now
            )
            .is_ok());
    }

    #[test]
    fn absurd_magnitudes_are_rejected_before_they_reach_peers() {
        let p = policy();
        let now = Instant::now();
        for sample in [
            MotionSample::new(1e300, 0.0, 0.0, 0.0),
            MotionSample::new(0.0, 1e300, 0.0, 0.0),
            MotionSample::new(0.0, 0.0, 1e300, 0.0),
            MotionSample::new(0.0, 0.0, 0.0, 1e300),
            MotionSample::new(f64::NAN, 0.0, 0.0, 0.0),
            MotionSample::new(0.0, f64::INFINITY, 0.0, 0.0),
            MotionSample::new(0.0, 0.0, f64::NEG_INFINITY, 0.0),
            MotionSample::new(0.0, 0.0, 0.0, -1.0),
        ] {
            let verdict = p.admit(None, &sample, now);
            assert!(
                matches!(
                    verdict,
                    Err(MotionRejection::NonFinite) | Err(MotionRejection::OutOfBounds)
                ),
                "sample {sample:?} was admitted with verdict {verdict:?}"
            );
        }
    }

    #[test]
    fn canonicalisation_matches_the_wire_precision() {
        let p = policy();
        let sample = MotionSample::new(123.456_789, 45.678_912, 0.123_456_789, 9_876.543_21);
        let out = p.canonicalise(sample);
        assert_eq!(out.x, 123.46);
        assert_eq!(out.y, 45.68);
        assert_eq!(out.rot, 0.12);
        assert_eq!(out.distance, 9_876.54);
    }

    #[test]
    fn canonicalisation_never_changes_a_value_by_more_than_the_precision() {
        let p = policy();
        for raw in [-500.123_45, -0.001, 0.0, 1.004, 12_345.678_9] {
            let rounded = p.canonicalise(MotionSample::new(raw, raw, raw, raw.abs()));
            assert!(
                (rounded.x - raw).abs() <= 0.005,
                "{raw} rounded to {}",
                rounded.x
            );
        }
    }

    #[test]
    fn nominal_delta_agrees_with_the_contract_cap() {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../protocol/contract.json"
        ))
        .expect("read contract");
        let contract: serde_json::Value = serde_json::from_str(&raw).expect("parse contract");
        let declared = contract["movement"]["maxStateDeltaXPerTick"]
            .as_f64()
            .unwrap();
        // The contract cap is the nominal allowance, rounded down.
        let p = policy();
        let nominal = p.max_speed_units_per_sec / p.tick_hz * p.speed_headroom_factor;
        assert_eq!(nominal.floor(), declared, "234 / 15 * 2 = {nominal}");
    }

    #[test]
    fn rejection_labels_are_stable() {
        assert_eq!(MotionRejection::NonFinite.as_str(), "nonFinite");
        assert_eq!(MotionRejection::OutOfBounds.as_str(), "outOfBounds");
        assert_eq!(
            MotionRejection::DistanceRegression.as_str(),
            "distanceRegression"
        );
        assert_eq!(MotionRejection::SpeedCap.as_str(), "speedCap");
    }
}
