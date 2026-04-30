use super::*;
use rusqlite::{params, OptionalExtension};
use serde_json::json;

const BUILTIN_PRICING_VERSION: &str = "builtin-v1";
const BUILTIN_EFFECTIVE_FROM: &str = "1970-01-01T00:00:00Z";
const DEFAULT_FX_RATE: f64 = 7.2;

const BUILTIN_PRICING_ROWS: &[(&str, &str, f64, f64)] = &[
    ("openai", "gpt-4.1", 2.0, 8.0),
    ("openai", "gpt-4.1-mini", 0.4, 1.6),
    ("openai", "gpt-4o", 5.0, 15.0),
    ("anthropic", "claude-3-7-sonnet", 3.0, 15.0),
    ("anthropic", "claude-3-5-haiku", 0.8, 4.0),
];

#[derive(Debug, Clone)]
pub(super) struct ResolvedPricing {
    pub(super) input_cost_per_million: f64,
    pub(super) output_cost_per_million: f64,
    #[allow(dead_code)]
    pub(super) source: String,
}

#[derive(Debug, Clone)]
pub(super) struct FxSnapshot {
    pub(super) rate: f64,
    pub(super) fetched_at: String,
    pub(super) stale: bool,
    pub(super) source: String,
}

pub(super) fn ensure_pricing_seed(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let now = now_rfc3339();
    for (provider, model, input_cost, output_cost) in BUILTIN_PRICING_ROWS {
        conn.execute(
            "INSERT OR IGNORE INTO model_pricing_snapshots(
                id,
                workspace_id,
                provider,
                model,
                currency,
                input_cost_per_million,
                output_cost_per_million,
                effective_from,
                snapshot_version,
                source,
                created_at
            ) VALUES (?1, ?2, ?3, ?4, 'USD', ?5, ?6, ?7, ?8, 'builtin', ?9)",
            params![
                Uuid::new_v4().to_string(),
                workspace_id,
                provider,
                model,
                input_cost,
                output_cost,
                BUILTIN_EFFECTIVE_FROM,
                BUILTIN_PRICING_VERSION,
                now,
            ],
        )?;
    }
    Ok(())
}

pub(super) fn ensure_fx_seed(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO fx_snapshots(
            id, base_currency, quote_currency, rate, source, fetched_at
         ) VALUES (?1, 'USD', 'CNY', ?2, 'builtin', ?3)",
        params![Uuid::new_v4().to_string(), DEFAULT_FX_RATE, now_rfc3339(),],
    )?;
    Ok(())
}

pub(super) fn normalize_currency(raw: Option<&str>) -> String {
    raw.map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_uppercase())
        .filter(|item| item == "USD" || item == "CNY")
        .unwrap_or_else(|| "USD".to_string())
}

pub(super) fn resolve_pricing_usd(
    conn: &Connection,
    workspace_id: &str,
    provider: &str,
    model: &str,
    called_at: &str,
) -> Result<Option<ResolvedPricing>, AppError> {
    let provider = provider.trim();
    let model = model.trim();
    if model.is_empty() {
        return Ok(None);
    }

    let override_row = conn
        .query_row(
            "SELECT input_cost_per_million, output_cost_per_million
             FROM model_pricing_overrides
             WHERE workspace_id = ?1 AND provider = ?2 AND model = ?3 AND currency = 'USD'",
            params![workspace_id, provider, model],
            |row| {
                Ok(ResolvedPricing {
                    input_cost_per_million: row.get(0)?,
                    output_cost_per_million: row.get(1)?,
                    source: "manual_override".to_string(),
                })
            },
        )
        .optional()?;
    if override_row.is_some() {
        return Ok(override_row);
    }

    let snapshot = conn
        .query_row(
            "SELECT input_cost_per_million, output_cost_per_million, source
             FROM model_pricing_snapshots
             WHERE workspace_id = ?1
               AND provider = ?2
               AND model = ?3
               AND currency = 'USD'
               AND effective_from <= ?4
             ORDER BY effective_from DESC, created_at DESC
             LIMIT 1",
            params![workspace_id, provider, model, called_at],
            |row| {
                Ok(ResolvedPricing {
                    input_cost_per_million: row.get(0)?,
                    output_cost_per_million: row.get(1)?,
                    source: row.get(2)?,
                })
            },
        )
        .optional()?;
    Ok(snapshot)
}

pub(super) fn load_fx_snapshot(conn: &Connection) -> Result<FxSnapshot, AppError> {
    let row = conn
        .query_row(
            "SELECT rate, source, fetched_at
             FROM fx_snapshots
             WHERE base_currency = 'USD' AND quote_currency = 'CNY'
             ORDER BY fetched_at DESC
             LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, f64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;

    let (rate, source, fetched_at) =
        row.unwrap_or((DEFAULT_FX_RATE, "builtin".to_string(), now_rfc3339()));
    let stale = match chrono::DateTime::parse_from_rfc3339(&fetched_at) {
        Ok(time) => {
            Utc::now().signed_duration_since(time.with_timezone(&Utc)) > Duration::hours(48)
        }
        Err(_) => true,
    };

    Ok(FxSnapshot {
        rate,
        fetched_at,
        stale,
        source,
    })
}

pub(super) fn upsert_pricing_override(
    conn: &Connection,
    input: &ModelPricingOverrideUpsertInput,
) -> Result<Value, AppError> {
    let provider = input.provider.trim().to_string();
    let model = input.model.trim().to_string();
    if provider.is_empty() || model.is_empty() {
        return Err(AppError::invalid_argument("provider/model 不能为空"));
    }
    let currency = normalize_currency(input.currency.as_deref());
    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO model_pricing_overrides(
            id,
            workspace_id,
            provider,
            model,
            currency,
            input_cost_per_million,
            output_cost_per_million,
            updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(workspace_id, provider, model, currency) DO UPDATE SET
            input_cost_per_million = excluded.input_cost_per_million,
            output_cost_per_million = excluded.output_cost_per_million,
            updated_at = excluded.updated_at",
        params![
            Uuid::new_v4().to_string(),
            input.workspace_id,
            provider,
            model,
            currency,
            input.input_cost_per_million,
            input.output_cost_per_million,
            now,
        ],
    )?;

    Ok(json!({
        "workspaceId": input.workspace_id,
        "provider": input.provider.trim(),
        "model": input.model.trim(),
        "currency": currency,
        "inputCostPerMillion": input.input_cost_per_million,
        "outputCostPerMillion": input.output_cost_per_million,
        "updatedAt": now,
        "source": "manual_override",
    }))
}

pub(super) fn query_pricing_rows(
    conn: &Connection,
    workspace_id: &str,
    currency_filter: Option<&str>,
) -> Result<Vec<Value>, AppError> {
    let currency = normalize_currency(currency_filter);
    let mut rows = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT provider, model, input_cost_per_million, output_cost_per_million, updated_at
         FROM model_pricing_overrides
         WHERE workspace_id = ?1 AND currency = ?2
         ORDER BY provider ASC, model ASC",
    )?;
    let overrides = stmt.query_map(params![workspace_id, currency], |row| {
        Ok(json!({
            "provider": row.get::<_, String>(0)?,
            "model": row.get::<_, String>(1)?,
            "currency": currency,
            "inputCostPerMillion": row.get::<_, f64>(2)?,
            "outputCostPerMillion": row.get::<_, f64>(3)?,
            "effectiveFrom": row.get::<_, String>(4)?,
            "source": "manual_override",
        }))
    })?;
    for row in overrides {
        rows.push(row?);
    }

    let mut latest_stmt = conn.prepare(
        "SELECT provider, model, input_cost_per_million, output_cost_per_million, effective_from, source
         FROM model_pricing_snapshots
         WHERE workspace_id = ?1 AND currency = ?2
         ORDER BY provider ASC, model ASC, effective_from DESC, created_at DESC",
    )?;
    let snapshots = latest_stmt.query_map(params![workspace_id, currency], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, f64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;
    let mut seen = std::collections::HashSet::new();
    for row in snapshots {
        let (provider, model, input_cost, output_cost, effective_from, source) = row?;
        let key = format!("{provider}|{model}");
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        rows.push(json!({
            "provider": provider,
            "model": model,
            "currency": currency,
            "inputCostPerMillion": input_cost,
            "outputCostPerMillion": output_cost,
            "effectiveFrom": effective_from,
            "source": source,
        }));
    }

    rows.sort_by(|left, right| {
        let left_source = left
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let right_source = right
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or_default();
        left_source
            .cmp(right_source)
            .then_with(|| {
                left.get("provider")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .cmp(
                        right
                            .get("provider")
                            .and_then(Value::as_str)
                            .unwrap_or_default(),
                    )
            })
            .then_with(|| {
                left.get("model")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .cmp(
                        right
                            .get("model")
                            .and_then(Value::as_str)
                            .unwrap_or_default(),
                    )
            })
    });
    Ok(rows)
}
