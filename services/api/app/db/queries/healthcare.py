"""
SQL queries for healthcare endpoints.

The healthcare_providers table is long form: one row per (npi, year).
"""

# All NPIs scored for a given year, as GeoJSON-ready columns.
GET_NUECES_FOR_YEAR = """
    SELECT
        npi,
        ST_X(geom) AS lon,
        ST_Y(geom) AS lat,
        specialty,
        tier,
        ensemble_score,
        med_mdcr_stdzd_amt,
        tot_benes
    FROM healthcare_providers
    WHERE year = $1
    ORDER BY ensemble_score DESC NULLS LAST
"""

# Every year on record for a single NPI — drives the right-panel card.
GET_PROVIDER_BY_NPI = """
    SELECT
        npi,
        year,
        ST_X(geom) AS lon,
        ST_Y(geom) AS lat,
        specialty,
        tier,
        ensemble_score,
        iqr_score,
        iforest_score,
        lgbm_residual,
        med_mdcr_stdzd_amt,
        tot_benes
    FROM healthcare_providers
    WHERE npi = $1
    ORDER BY year
"""
