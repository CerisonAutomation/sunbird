export const PHYS_HZ = 120;
export const PHYS_DT = 1 / PHYS_HZ;

/* ---------------- momentum flight model ----------------
 * Height comes from momentum, never from "flapping upward".
 *   hold  -> heavier gravity + strong ground suction (carve the valley)
 *   release -> light gravity + lift from speed (ride the arc)
 */
export const GRAVITY_GLIDE = 18;
export const GRAVITY_DIVE = 96;
/** Gravity along the slope while carving the ground. */
export const GROUND_G_GLIDE = 30;
export const GROUND_G_DIVE = 88;
/** Quadratic air drag (per unit speed²) — low, so momentum lives a long time. */
export const AIR_DRAG_GLIDE = 0.00042;
export const AIR_DRAG_DIVE = 0.00016;
/** Rolling resistance while on the ground. */
export const GROUND_FRICTION = 0.05;
export const GROUND_FRICTION_DIVE = 0.018;
/** Speed-borne lift while gliding: cancels up to this fraction of gravity. */
export const GLIDE_LIFT_MAX = 0.55;
export const GLIDE_LIFT_SPEED = 62;
/** Downforce that keeps a diving bird glued through convex crests. */
export const STICK_ACCEL_DIVE = 190;
export const STICK_ACCEL_GLIDE = 13;

export const MAX_SPEED = 108;
export const MAX_SPEED_FEVER = 128;
export const BIRD_RADIUS = 0.9;
export const MIN_KEEP_SPEED = 6;

/* Landing quality: how much speed survives touching down.
 * alignment = 1 - |v·n| / |v|   (1 = perfectly tangential kiss) */
export const LAND_PERFECT = 0.985;
export const LAND_GOOD = 0.94;
export const LAND_PERFECT_GAIN = 1.03;
export const LAND_GOOD_KEEP = 1.0;
export const LAND_BAD_MIN_KEEP = 0.55;
export const LAND_FEATHER_FLOOR = 0.88;

/* ---------------- launch rating ---------------- */
export const LAUNCH_MIN_SPEED = 26;
export const LAUNCH_RELEASE_WINDOW = 1.35;
export const RATING_GOOD = 0.42;
export const RATING_GREAT = 0.68;
export const RATING_PERFECT = 0.84;
export const LAUNCH_BOOST_GOOD = 1.02;
export const LAUNCH_BOOST_GREAT = 1.07;
export const LAUNCH_BOOST_PERFECT = 1.145;
export const LAUNCH_COMBO_STEP = 0.012;
export const LAUNCH_COMBO_MAX = 0.09;
export const COMBO_GRACE = 9;

/* ---------------- altitude zones (world units above terrain) ---------------- */
export const ALT_SKY = 30;
export const ALT_CLOUDS = 72;
export const ALT_HIGH = 135;
export const ALT_STRATO = 230;

export const ISLAND_PERIOD = 1100;
export const RAMP_START = 845;
export const GAP_START = 928;
export const OCEAN_FLOOR = -18;
export const WATER_Y = 0.4;

export const CHUNK_SIZE = 72;
export const CHUNK_RES = 1.8;
export const TERRAIN_HALF_Z = 11;
export const TERRAIN_FACE_DEPTH = 42;
export const VISIBLE_CHUNKS_BACK = 4;
export const VISIBLE_CHUNKS_FWD = 14;

export const DAYLIGHT_MAX = 52;
export const DAYLIGHT_ISLAND_REFILL = 15;
export const DAYLIGHT_OCEAN_PENALTY = 4.5;

export const FEVER_NEED = 3;
export const FEVER_DURATION = 9;
export const NEST_MULT_PER_LEVEL = 0.12;

export const COIN_VALUE = 1;
export const CLOUD_BONUS = 40;
export const MAGNET_RADIUS = 15;
export const MAGNET_RADIUS_NORMAL = 1.7;

export const CAMERA_BASE_Z = 24;
export const CAMERA_LOOKAHEAD = 0.22;

export const SAVE_KEY_V1 = "sunbird.save.v1";
export const SAVE_KEY = "sunbird.save.v2";

export const DAYLIGHT_MAX_GOLD = 62;
export const CONTINUE_COST = 80;
export const CONTINUE_DAYLIGHT = 16;
export const CONTINUE_TIMEOUT = 6;
export const AD_DURATION = 4;
export const INTERSTITIAL_EVERY = 3;

export const ZENITH_ALT = 42;

/* ---------------- power-ups ---------------- */
export const PU_LONGGLIDE = 9;
export const PU_WINGBOOST = 8;
export const PU_SPEED = 2.2;
export const PU_FEATHER = 12;
export const PU_MAGNET = 12;
export const PU_GOLDENWINGS = 10;
export const PU_CLOUDBOOST = 14;
export const ZENITH_SLOWMO = 0.22;
export const ZENITH_DURATION = 0.55;

export const PICKUP_SUN_TIME = 6;
export const MAGNET_TIME = 12;
export const BOOST_TIME = 1.6;
export const BOOST_EXTRA_SPEED = 42;
export const HEADSTART_DISTANCE = 300;

/* ---------- Stripe (see .env.example) ---------- */
export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
export const STRIPE_GOLD_LINK = import.meta.env.VITE_STRIPE_GOLD_LINK ?? "";
export const STRIPE_VIP_LINK = import.meta.env.VITE_STRIPE_VIP_LINK ?? "";
export const STRIPE_RETURN_KEY = "sunbird_stripe";

export const VIP_DAYS = 30;
export const ADS_PER_DAY = 4;
export const AD_MIN_RUN_GAP = 2;

/* ---------- Season pass ---------- */
export const SEASON_TIERS = 30;
export const SEASON_XP_PER_TIER = 220;
export const VIP_DAILY_GIFT = 25;

/* ---------- Ghost rival ---------- */
export const GHOST_SAMPLE_DT = 0.1;
export const GHOST_MAX_SAMPLES = 6000;

/* ---------- Referral ---------- */
export const REFERRAL_BONUS = 60;
