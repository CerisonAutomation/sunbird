use anyhow::{anyhow, bail, Context, Result};
use std::{env, net::SocketAddr, time::Duration};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Environment {
    Development,
    Staging,
    Production,
}

impl Environment {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Development => "development",
            Self::Staging => "staging",
            Self::Production => "production",
        }
    }

    pub fn requires_tls_origins(self) -> bool {
        !matches!(self, Self::Development)
    }

    pub fn metrics_is_public_by_default(self) -> bool {
        matches!(self, Self::Development)
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub environment: Environment,
    pub bind_addr: SocketAddr,
    pub public_origins: Vec<String>,
    pub reconnect_secret: Vec<u8>,
    pub reconnect_grace: Duration,
    pub shutdown_grace: Duration,
    pub metrics_bind: Option<SocketAddr>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let environment = parse_env("SUNBIRD_ENV")?;
        let bind_addr = parse_addr("SUNBIRD_BIND_ADDR", environment)?;
        let public_origins = parse_origins("SUNBIRD_PUBLIC_ORIGINS", environment)?;
        let reconnect_secret = parse_secret("SUNBIRD_RECONNECT_HMAC_SECRET", environment)?;
        let reconnect_grace = Duration::from_secs(parse_u64("SUNBIRD_RECONNECT_GRACE_SECONDS", 30, 1, 300)?);
        let shutdown_grace = Duration::from_secs(parse_u64("SUNBIRD_SHUTDOWN_GRACE_SECONDS", 5, 1, 60)?);
        let metrics_bind = parse_optional_metrics_bind("SUNBIRD_METRICS_BIND_ADDR", environment)?;

        Ok(Self {
            environment,
            bind_addr,
            public_origins,
            reconnect_secret,
            reconnect_grace,
            shutdown_grace,
            metrics_bind,
        })
    }

    pub fn development_default() -> Self {
        Self {
            environment: Environment::Development,
            bind_addr: "127.0.0.1:8080".parse().expect("valid bind address"),
            public_origins: vec!["*".to_string()],
            reconnect_secret: b"development-only-not-production-secret-32".to_vec(),
            reconnect_grace: Duration::from_secs(30),
            shutdown_grace: Duration::from_secs(5),
            metrics_bind: Some("127.0.0.1:9090".parse().expect("valid metrics bind address")),
        }
    }

    pub fn app_identity(&self) -> String {
        format!("sunbird-server/{} {}", env!("CARGO_PKG_VERSION"), self.environment.as_str())
    }

    pub fn reconnect_grace_ready(&self) -> bool {
        !self.reconnect_secret.is_empty()
    }
}

fn parse_env(value: &str) -> Result<Environment> {
    match env::var(value).unwrap_or_else(|_| "development".to_string()).as_str() {
        "development" | "dev" => Ok(Environment::Development),
        "staging" | "stage" => Ok(Environment::Staging),
        "production" | "prod" => Ok(Environment::Production),
        other => bail!("{value} must be development, staging, or production; got {other:?}"),
    }
}

fn parse_addr(name: &str, environment: Environment) -> Result<SocketAddr> {
    let fallback = if environment == Environment::Development {
        Some("127.0.0.1:8080")
    } else {
        None
    };
    let raw = env::var(name).ok().or_else(|| fallback.map(str::to_string)).ok_or_else(|| anyhow!("{name} is required outside development"))?;
    raw.parse().with_context(|| format!("{name} must be a socket address, got {raw:?}"))
}

fn parse_optional_metrics_bind(name: &str, environment: Environment) -> Result<Option<SocketAddr>> {
    match env::var(name).ok() {
        Some(raw) => Ok(Some(raw.parse().with_context(|| format!("{name} must be a socket address, got {raw:?}"))?)),
        None if environment.metrics_is_public_by_default() => Ok(None),
        None => Ok(None),
    }
}

fn parse_origins(name: &str, environment: Environment) -> Result<Vec<String>> {
    let raw = env::var(name).unwrap_or_default();
    let mut out = Vec::new();
    for token in raw.split(',').map(str::trim).filter(|v| !v.is_empty()) {
        if token == "*" {
            if environment.requires_tls_origins() {
                bail!("{name} must not contain wildcard origins outside development");
            }
            out.push("*".to_string());
            continue;
        }
        let parsed = url::Url::parse(token).with_context(|| format!("invalid {name} origin {token:?}"))?;
        if environment.requires_tls_origins() && parsed.scheme() != "https" {
            bail!("{name} entries must use https outside development; got {token:?}");
        }
        out.push(token.to_string());
    }
    if out.is_empty() && environment.requires_tls_origins() {
        bail!("{name} is required outside development and must list explicit https origins");
    }
    if out.is_empty() {
        out.push("*".to_string());
    }
    Ok(out)
}

fn parse_secret(name: &str, environment: Environment) -> Result<Vec<u8>> {
    let raw = env::var(name).unwrap_or_default();
    let secret = if raw.is_empty() {
        if environment == Environment::Development {
            b"development-only-not-production-secret-32".to_vec()
        } else {
            bail!("{name} must contain at least 32 bytes outside development")
        }
    } else if let Ok(decoded) = hex::decode(raw.trim_start_matches("0x")) {
        decoded
    } else {
        raw.into_bytes()
    };
    if secret.len() < 32 {
        bail!("{name} must contain at least 32 bytes");
    }
    Ok(secret)
}

fn parse_u64(name: &str, default: u64, min: u64, max: u64) -> Result<u64> {
    let value = env::var(name).ok().map(|value| {
        value
            .parse::<u64>()
            .with_context(|| format!("{name} must be an unsigned integer, got {value:?}"))
    });
    let value = match value {
        Some(Ok(v)) => v,
        Some(Err(err)) => return Err(err),
        None => default,
    };
    if !(min..=max).contains(&value) {
        bail!("{name} must be in the range {min}..={max}; got {value}");
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn development_config_is_self_contained() {
        let config = Config::development_default();
        assert_eq!(config.environment, Environment::Development);
        assert!(config.reconnect_grace_ready());
        assert!(config.metrics_bind.is_some());
    }

    #[test]
    fn config_identity_is_exposed() {
        let config = Config::development_default();
        assert!(config.app_identity().contains("sunbird-server"));
    }
}
