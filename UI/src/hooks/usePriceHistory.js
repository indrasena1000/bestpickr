// hooks/usePriceHistory.js
// ─────────────────────────────────────────────────────────────────
// Fetches price-tracking stats for a product ASIN from our backend.
//
// STATES:
//   loading  — request in flight
//   found:false  — product not yet in our Postgres tracking DB
//   dataReady:false  — tracking started but <5 entries or <7 days
//   dataReady:true   — 30-day stats available (low/high/avg/buySignal)
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import api from "../services/api.js";

export function usePriceHistory(asin) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!asin) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get(`/products/asin/${encodeURIComponent(asin)}/price-stats`)
      .then((res) => {
        if (!cancelled) setStats(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [asin]);

  return { stats, loading, error };
}
