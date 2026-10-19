"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
} from "recharts";
import {
  ExternalLink,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Activity,
  RefreshCw,
  Bell,
  Pencil,
} from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  deleteProduct,
  getPriceHistory,
  addProduct,
  updateProduct,
} from "@/app/actions/auth";
import {
  deletePriceAlert,
  getPriceAlerts,
  upsertPriceAlert,
} from "@/app/actions/alerts";
import {
  getPriceHistoryForRange,
  normalizePrice,
  PRICE_RANGES,
  summarizePriceHistory,
} from "@/lib/price-history.mjs";
import { getProductDisplayTitle } from "@/lib/product-url.mjs";
import { getProductImageSrc } from "@/lib/product-image.mjs";

const ProductCard = ({ product, selected = false, onSelect }) => {
  const router = useRouter();

  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState("7d");
  const [loadingChart, setLoadingChart] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [refreshState, setRefreshState] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(product.name ?? "");
  const [editCurrency, setEditCurrency] = useState(product.currency ?? "INR");
  const [savingEdit, setSavingEdit] = useState(false);
  const [currentTime] = useState(() => Date.now());

  const [priceHistory, setPriceHistory] = useState([]);
  const [historyAsOf, setHistoryAsOf] = useState(null);
  const [error, setError] = useState("");
  const [imageSource, setImageSource] = useState(() =>
    getProductImageSrc(product.image_url, product.url)
  );
  const [imageFailed, setImageFailed] = useState(false);
  const [mobileChartScrolled, setMobileChartScrolled] = useState(false);
  const chartScrollRef = useRef(null);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);
  const [alertError, setAlertError] = useState("");
  const [alertDrafts, setAlertDrafts] = useState({});

  // ==================================================
  // PRICE
  // ==================================================

  const currentPrice = normalizePrice(product.current_price);
  const displayTitle = getProductDisplayTitle(product.name, product.url);
  const productImageSrc = imageSource;

  const handleImageError = () => {
    if (imageSource?.startsWith("/api/product-image")) {
      setImageSource(product.image_url);
      return;
    }
    setImageFailed(true);
  };

  const currency = product.currency || "INR";

  const formatPrice = (price) => {
    if (normalizePrice(price) === null) {
      return "—";
    }

    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 2,
      }).format(price);
    } catch {
      return `${currency} ${price}`;
    }
  };

  // ==================================================
  // SHOW / HIDE PRICE HISTORY
  // ==================================================

  const loadPriceHistory = async () => {
    setError("");
    setLoadingChart(true);

    try {
      const history = await getPriceHistory(product.id);

      setPriceHistory(Array.isArray(history) ? history : []);
      setHistoryAsOf(Date.now());
    } catch (error) {
      console.error("Price history error:", error);

      setError("Unable to load price history.");
    } finally {
      setLoadingChart(false);
    }
  };

  const handleChart = () => {
    if (chartModalOpen) {
      setChartModalOpen(false);
      return;
    }

    setPriceHistory([]);
    setHistoryAsOf(Date.now());
    setSelectedRange("7d");
    setMobileChartScrolled(false);
    setChartModalOpen(true);
    void loadPriceHistory();
  };

  const handleAlertSettings = async () => {
    setAlertModalOpen(true);
    setAlertLoading(true);
    setAlertError("");
    setAlertSaved(false);

    try {
      const result = await getPriceAlerts(product.id);
      if (result?.error) {
        setAlertError(result.error);
        return;
      }

      const drafts = {};
      for (const alert of result.alerts ?? []) {
        drafts[alert.alert_type] = {
          id: alert.id,
          enabled: alert.enabled,
          threshold: alert.threshold ?? "",
          frequency: alert.frequency,
          observationWindowDays: alert.observation_window_days ?? 30,
        };
      }
      setAlertDrafts(drafts);
    } catch (error) {
      console.error("Load price alerts error:", error);
      setAlertError("Unable to load alert settings.");
    } finally {
      setAlertLoading(false);
    }
  };

  const saveAlertSettings = async () => {
    setAlertSaving(true);
    setAlertError("");

    try {
      const alertType = "target_price";
      const draft = alertDrafts[alertType];

      if (draft) {
        const hasValue = String(draft.threshold).trim() !== "";

        if (!hasValue && draft.id) {
          const result = await deletePriceAlert(product.id, draft.id);
          if (result?.error) throw new Error(result.error);
        } else if (hasValue) {
          const result = await upsertPriceAlert(product.id, {
            alert_type: alertType,
            threshold: draft.threshold,
            observation_window_days: null,
            frequency: draft.frequency || "immediate",
            enabled: true,
          });
          if (result?.error) throw new Error(result.error);
          if (result?.warning) setAlertError(result.warning);
        }
      }

      setAlertSaved(true);
    } catch (error) {
      console.error("Save price alerts error:", error);
      setAlertError(error?.message || "Unable to save alert settings.");
    } finally {
      setAlertSaving(false);
    }
  };

  const updateAlertDraft = (alertType, changes) => {
    setAlertDrafts((current) => ({
      ...current,
      [alertType]: {
        id: current[alertType]?.id,
        enabled: current[alertType]?.enabled ?? true,
        frequency: current[alertType]?.frequency ?? "immediate",
        observationWindowDays: current[alertType]?.observationWindowDays ?? 30,
        threshold: current[alertType]?.threshold ?? "",
        ...changes,
      },
    }));
  };

  // ==================================================
  // DELETE PRODUCT
  // ==================================================

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Remove this product from tracking?"
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");

      const result = await deleteProduct(product.id);

      if (result?.error) {
        setError(result.error);
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);

      setError("Failed to remove product.");
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing || refreshCooldown) return;
    setRefreshing(true);
    setError("");
    setRefreshState("");

    try {
      const formData = new FormData();
      formData.set("url", product.url);
      const result = await addProduct(formData);

      if (result?.error) {
        setError(result.error);
        setRefreshState("failed");
        return;
      }

      setRefreshState("success");
      setRefreshCooldown(true);
      window.setTimeout(() => setRefreshCooldown(false), 5000);
      router.refresh();
      if (chartModalOpen) {
        await loadPriceHistory();
      }
    } catch (error) {
      console.error("Refresh price error:", error);
      setError("Unable to refresh the price right now.");
      setRefreshState("failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveProduct = async () => {
    setSavingEdit(true);
    setError("");
    try {
      const result = await updateProduct(product.id, {
        name: editName,
        currency: editCurrency,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEditModalOpen(false);
      router.refresh();
    } catch (saveError) {
      console.error("Update product error:", saveError);
      setError("Unable to update this product.");
    } finally {
      setSavingEdit(false);
    }
  };

  // ==================================================
  // PRICE HISTORY CALCULATIONS
  // ==================================================

  const rangeOptions = PRICE_RANGES;
  const historyNow = historyAsOf ?? 0;
  const storedChartData = getPriceHistoryForRange(priceHistory, {
    range: selectedRange,
    now: historyNow,
    productId: product.id,
  });
  const currentTimestamp = (product.last_checked_at || product.updated_at)
    ? new Date(product.last_checked_at || product.updated_at).getTime()
    : 0;
  const currentHistoryPoint =
    currentPrice !== null &&
    Number.isFinite(currentTimestamp) &&
    currentTimestamp <= historyNow
      ? {
          id: `current-${product.id}`,
          product_id: product.id,
          checked_at: product.updated_at,
          timestamp: currentTimestamp,
          price: currentPrice,
          currency,
        }
      : null;
  const currentPointInRange = currentHistoryPoint
    ? getPriceHistoryForRange([currentHistoryPoint], {
        range: selectedRange,
        now: historyNow,
        productId: product.id,
      })[0] ?? null
    : null;
  const chartData =
    currentPointInRange &&
    !storedChartData.some(
      (record) =>
        record.timestamp === currentPointInRange.timestamp &&
        record.price === currentPointInRange.price
    )
      ? [...storedChartData, currentPointInRange].sort(
          (a, b) => a.timestamp - b.timestamp
        )
      : storedChartData;
  const priceSummary = summarizePriceHistory(chartData, { now: historyNow });
  const selectedRangeOption = rangeOptions.find(
    (option) => option.value === selectedRange
  );

  const formatChartDate = (timestamp) => {
    const span = chartData.length > 1
      ? chartData.at(-1).timestamp - chartData[0].timestamp
      : 0;

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: span > 365 * 24 * 60 * 60 * 1000 ? undefined : "2-digit",
      month: "short",
      year: span > 365 * 24 * 60 * 60 * 1000 ? "2-digit" : undefined,
    }).format(new Date(timestamp));
  };

  const formatChartDateTime = (timestamp) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(timestamp));

  const lowestPrice = priceSummary.lowestPrice;
  const highestPrice = priceSummary.highestPrice;
  const typicalPrice = priceSummary.typicalPrice ?? priceSummary.averagePrice;
  const priceDifference = priceSummary.change ?? 0;

  const priceDropped = priceDifference < 0;
  const priceIncreased = priceDifference > 0;

  const firstChartTimestamp = chartData[0]?.timestamp ?? 0;
  const lastChartTimestamp = chartData.at(-1)?.timestamp ?? firstChartTimestamp;
  const hasTimestampSpan = lastChartTimestamp > firstChartTimestamp;
  const chartXDomain = hasTimestampSpan
    ? ["dataMin", "dataMax"]
    : [
        firstChartTimestamp - 12 * 60 * 60 * 1000,
        firstChartTimestamp + 12 * 60 * 60 * 1000,
      ];

  const priceSpan = (highestPrice ?? 0) - (lowestPrice ?? 0);
  const pricePadding = Math.max(
    priceSpan === 0 ? (highestPrice ?? 0) * 0.05 : priceSpan * 0.08,
    (highestPrice ?? 0) * 0.002,
    1
  );
  const chartYDomain = [
    Math.max(0, (lowestPrice ?? 0) - pricePadding),
    (highestPrice ?? 0) + pricePadding,
  ];

  const formatAxisPrice = (value) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${currency} ${value}`;
    }
  };

  // ==================================================
  // CARD
  // ==================================================

  return (
    <>
      <Card className="w-full overflow-hidden rounded-2xl border-white/10 bg-[#0B1220]/75 text-[#F8FAFC] shadow-xl shadow-black/30 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-500/30 hover:shadow-2xl">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <CardHeader className="p-5 lg:p-6">

          <div className="flex items-start gap-4">
            {onSelect && (
              <label className="mt-1 shrink-0">
                <span className="sr-only">Select {displayTitle}</span>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => onSelect(product.id, event.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-[#F97316]"
                />
              </label>
            )}

            {/* PRODUCT IMAGE */}

            <div className="glass-card h-[112px] w-[112px] shrink-0 overflow-hidden rounded-xl">

              {productImageSrc && !imageFailed ? (
                <img
                  src={productImageSrc}
                  alt={displayTitle}
                  className="h-full w-full object-contain bg-transparent"
                  loading="lazy"
                  style={{ imageRendering: "auto" }}
                  onError={handleImageError}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-slate-400">
                  <span className="text-lg text-slate-500">◇</span>
                  Image unavailable
                </div>
              )}

            </div>

            {/* PRODUCT INFO */}

            <div className="min-w-0 flex-1">

              <CardTitle className="line-clamp-2 text-[18px] font-semibold leading-6">
                {displayTitle}
              </CardTitle>

              <CardDescription className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#1E2B40] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#FDBA74]">
                  {product.retailer || "Retailer"}
                </span>

                {/* PRICE */}

                <span className="text-[30px] font-bold leading-none text-[#FDBA74]">
                  {formatPrice(currentPrice)}
                </span>

                {/* TRACKING BADGE */}

                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-[#FDBA74]">

                  <Activity className="h-3 w-3" />

                  Tracking

                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  (product.last_checked_at || product.updated_at) && currentTime - new Date(product.last_checked_at || product.updated_at).getTime() <= 24 * 60 * 60 * 1000
                    ? "bg-emerald-400/15 text-[#34D399]"
                      : "bg-amber-300/15 text-[#FFE082]"
                }`}>
                  {(product.last_checked_at || product.updated_at) && currentTime - new Date(product.last_checked_at || product.updated_at).getTime() <= 24 * 60 * 60 * 1000
                    ? "Checked today"
                    : "Needs refresh"}
                </span>
                {refreshState === "success" && (
                  <span className="text-xs font-medium text-emerald-300">Refresh complete</span>
                )}
                {refreshState === "failed" && (
                  <button type="button" onClick={handleRefresh} className="text-xs font-medium text-red-300 underline">
                    Retry
                  </button>
                )}

              </CardDescription>

            </div>

          </div>

        </CardHeader>

        {/* ================================================= */}
        {/* CONTENT */}
        {/* ================================================= */}

        <CardContent className="px-5 pb-5 lg:px-6 lg:pb-6">

          {/* BUTTONS */}

          <div className="flex flex-wrap items-center gap-2">

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || refreshCooldown}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#F97316] bg-[#F97316]/10 px-4 text-sm font-medium text-[#FDBA74] shadow-sm transition hover:bg-[#F97316]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : refreshCooldown ? "Try again shortly" : "Refresh price"}
            </button>

            {/* SHOW CHART */}

            <button
              type="button"
              onClick={handleChart}
              disabled={loadingChart && !chartModalOpen}
              aria-expanded={chartModalOpen}
              aria-controls={`price-history-${product.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#1E2B40] px-4 text-sm font-medium text-[#B8C4D9] shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >

              {loadingChart ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : chartModalOpen ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide Chart
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show Chart
                </>
              )}

            </button>

            {/* VIEW PRODUCT */}

            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#1E2B40] px-4 text-sm font-medium text-[#B8C4D9] shadow-sm transition hover:bg-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              View Product
            </a>

            <button
              type="button"
              onClick={() => void handleAlertSettings()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#1E2B40] px-4 text-sm font-medium text-[#B8C4D9] shadow-sm transition hover:bg-slate-700"
            >
              <Bell className="h-4 w-4" />
              Alert settings
            </button>

            <button
              type="button"
              onClick={() => {
                setEditName(product.name ?? "");
                setEditCurrency(product.currency ?? "INR");
                setEditModalOpen(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#1E2B40] px-4 text-sm font-medium text-[#B8C4D9] shadow-sm transition hover:bg-slate-700"
            >
              <Pencil className="h-4 w-4" />
              Edit product
            </button>

            {/* REMOVE */}

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[#F87171] transition hover:bg-[#F87171]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >

              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}

              {deleting
                ? "Removing..."
                : "Remove"}

            </button>

          </div>

          {/* ERROR */}

          {error && (
            <div className="mt-3 rounded-lg border border-[#F87171]/30 bg-[#F87171]/10 p-3 text-sm text-[#F87171]">
              {error}
            </div>
          )}

        </CardContent>

        {/* ================================================= */}
        {/* FOOTER */}
        {/* ================================================= */}

<CardFooter className="border-t border-white/10 bg-[#0B1220]/45 px-5 py-3 text-xs text-[#B8C4D9] backdrop-blur-md">
  <span>
    Last checked{" "}
    {(product.last_checked_at || product.updated_at)
      ? new Date(product.last_checked_at || product.updated_at).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : "Recently"}
  </span>
</CardFooter>

      </Card>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="border-slate-700 bg-[#0B1220] text-[#F8FAFC] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit tracked product</DialogTitle>
            <DialogDescription className="text-[#B8C4D9]">
              Change the display name or preferred currency. The last checked time is preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[#B8C4D9]">
              Product name
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                maxLength={160}
                className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-[#111C2E] px-3 text-[#F8FAFC] outline-none focus:border-[#F97316]"
              />
            </label>
            <label className="block text-sm font-medium text-[#B8C4D9]">
              Currency
              <select
                value={editCurrency}
                onChange={(event) => setEditCurrency(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-[#111C2E] px-3 text-[#F8FAFC] outline-none focus:border-[#F97316]"
              >
                {["INR", "USD", "EUR", "GBP", "AED", "CAD", "AUD", "JPY"].map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditModalOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-[#B8C4D9]">
                Cancel
              </button>
              <button type="button" onClick={() => void handleSaveProduct()} disabled={savingEdit} className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {savingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={chartModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setChartModalOpen(false);
            setMobileChartScrolled(false);
          }
        }}
      >
        <DialogContent id={`price-history-${product.id}`} className="glass-card max-w-5xl overflow-hidden rounded-3xl p-0 text-[#F8FAFC] shadow-2xl sm:max-w-5xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="grid max-h-[85vh] overflow-hidden md:grid-cols-[320px_1fr]">
            <div className="hidden items-center justify-center overflow-hidden bg-[#0B1220] p-5 md:flex">
              {productImageSrc && !imageFailed ? (
                <img
                  src={productImageSrc}
                  alt={displayTitle}
                  className="h-[420px] w-full rounded-2xl bg-[#172337] object-contain shadow-sm"
                  onError={handleImageError}
                />
              ) : (
                <div className="flex h-[220px] w-full items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-[#172337] text-sm text-[#B8C4D9]">
                  No Image
                </div>
              )}
            </div>

            <div
              ref={chartScrollRef}
              onScroll={(event) => {
                const nextScrolled = event.currentTarget.scrollTop > 32;
                setMobileChartScrolled((current) =>
                  current === nextScrolled ? current : nextScrolled
                );
              }}
              className="relative overflow-y-auto overscroll-contain p-4 md:p-6"
            >
              <div
                aria-hidden={!mobileChartScrolled}
                className={`pointer-events-none sticky top-0 z-20 -mx-4 relative flex max-h-0 items-center gap-3 overflow-visible border-b border-white/10 bg-[#111C2E]/95 px-4 py-0 text-left shadow-lg shadow-black/10 backdrop-blur-xl transition-[max-height,margin,padding,opacity,transform] duration-300 ease-out before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:h-4 before:bg-[#111C2E]/95 before:backdrop-blur-xl md:hidden ${
                  mobileChartScrolled
                    ? "-mt-4 mb-4 max-h-20 translate-y-0 py-3 opacity-100"
                    : "mb-0 -translate-y-3 opacity-0"
                }`}
              >
                {productImageSrc && !imageFailed ? (
                  <img
                    src={productImageSrc}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg bg-[#172337] object-contain ring-1 ring-white/10"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#172337] text-xs text-[#B8C4D9]">
                    No image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold leading-5 text-[#F8FAFC]">
                    {displayTitle}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-base font-bold leading-5 text-[#FDBA74]">
                    {formatPrice(currentPrice)}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-1 text-[10px] font-medium text-[#FDBA74]">
                    <Activity className="h-3 w-3" />
                    Tracking
                  </span>
                </div>
              </div>

              <div
                aria-hidden={mobileChartScrolled}
                className={`mb-5 flex items-center justify-center overflow-hidden rounded-2xl bg-[#0B1220] p-3 transition-[max-height,opacity,transform,margin,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
                  mobileChartScrolled
                    ? "pointer-events-none mb-2 max-h-0 -translate-y-3 p-0 opacity-0"
                    : "max-h-52 translate-y-0 opacity-100"
                }`}
              >
                {productImageSrc && !imageFailed ? (
                  <img
                    src={productImageSrc}
                    alt={displayTitle}
                    className={`h-44 w-full rounded-xl bg-[#172337] object-contain shadow-sm transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      mobileChartScrolled ? "scale-95" : "scale-100"
                    }`}
                    onError={handleImageError}
                  />
                ) : (
                  <div className="flex h-44 w-full items-center justify-center rounded-xl border border-dashed border-slate-700 bg-[#172337] text-sm text-[#B8C4D9]">
                    No Image
                  </div>
                )}
              </div>

              <DialogHeader className="mb-5 text-left">
                <DialogTitle className={`overflow-hidden break-words whitespace-normal text-2xl font-bold leading-8 text-[#F8FAFC] transition-[max-height,opacity,margin] duration-300 ease-out md:text-3xl md:leading-9 ${
                  mobileChartScrolled
                    ? "max-h-0 mb-0 opacity-0"
                    : "max-h-[12rem] opacity-100"
                }`}>
                  {displayTitle}
                </DialogTitle>
                <DialogDescription className={`flex flex-wrap items-center gap-3 overflow-hidden text-left transition-[max-height,opacity,margin] duration-300 ease-out ${
                  mobileChartScrolled
                    ? "mt-0 max-h-0 opacity-0"
                    : "mt-3 max-h-20 opacity-100"
                }`}>
                  <span className="text-3xl font-bold leading-9 text-[#FDBA74] md:text-4xl md:leading-10">
                    {formatPrice(currentPrice)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#1E2B40] px-2.5 py-1 text-xs font-medium text-[#B8C4D9]">
                    <Activity className="h-3 w-3" />
                    Tracking
                  </span>
                </DialogDescription>
              </DialogHeader>

              {error && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => void loadPriceHistory()}
                    disabled={loadingChart}
                    className="rounded-md border border-[#F87171]/30 bg-[#1E2B40] px-3 py-1.5 font-medium text-[#F87171] hover:bg-[#F87171]/10 disabled:opacity-60"
                  >
                    Retry
                  </button>
                </div>
              )}

              {loadingChart ? (
                <div role="status" className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-[#172337] text-sm text-[#B8C4D9]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading saved price history…
                </div>
              ) : priceHistory.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-[#172337] text-sm text-[#B8C4D9]">
                  No saved price history yet. A chart will appear after the first successful price check.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="glass-card rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FDBA74]">
                        Current price
                      </p>
                      <p className="mt-1 break-words text-base font-bold text-[#F8FAFC] sm:text-lg">
                        {formatPrice(currentPrice)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#B8C4D9]">Latest verified check</p>
                    </div>
                    <div className="glass-card rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6EE7B7]">
                        Lowest price
                      </p>
                      <p className="mt-1 break-words text-base font-bold text-[#F8FAFC] sm:text-lg">
                        {formatPrice(lowestPrice)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#B8C4D9]">
                        In {selectedRangeOption?.label || "all history"}
                      </p>
                    </div>
                    <div className="glass-card rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                        Typical price
                      </p>
                      <p className="mt-1 break-words text-base font-bold text-[#F8FAFC] sm:text-lg">
                        {formatPrice(typicalPrice)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#B8C4D9]">
                        Most frequently observed
                      </p>
                    </div>
                    <div className="glass-card rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-200">
                        Highest price
                      </p>
                      <p className="mt-1 break-words text-base font-bold text-[#F8FAFC] sm:text-lg">
                        {formatPrice(highestPrice)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#B8C4D9]">
                        In {selectedRangeOption?.label || "all history"}
                      </p>
                    </div>
                  </div>

                  {priceDropped && (
                    <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                      <TrendingDown className="h-4 w-4" />
                      Price dropped by {formatPrice(Math.abs(priceDifference))} since the first sample in this range
                    </div>
                  )}

                  {priceIncreased && (
                    <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                      <TrendingUp className="h-4 w-4" />
                      Price increased by {formatPrice(priceDifference)} since the first sample in this range
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#F8FAFC]">
                        Price history
                      </p>
                      <p className="text-xs text-[#B8C4D9]">
                        {priceSummary.sampleCount} samples · Updated{" "}
                        {historyAsOf ? formatChartDateTime(historyAsOf) : "just now"}
                      </p>
                    </div>
                    <div
                      aria-label="Price history range"
                      className="inline-flex rounded-lg border border-slate-700 bg-[#172337] p-1"
                    >
                      {rangeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selectedRange === option.value}
                          onClick={() => setSelectedRange(option.value)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            selectedRange === option.value
                              ? "bg-[#F97316] text-white shadow-sm"
                              : "text-[#B8C4D9] hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {chartData.length > 0 ? (
                    <div className="h-72 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-orange-50/70 to-white p-3 shadow-inner">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartData}
                          margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                        >
                          <defs>
                            <linearGradient id={`price-fill-${product.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            stroke="#e5e7eb"
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            type="number"
                            dataKey="timestamp"
                            scale="time"
                            domain={chartXDomain}
                            tickCount={5}
                            tickFormatter={formatChartDate}
                            minTickGap={24}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                          />
                          <YAxis
                            width={72}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            domain={chartYDomain}
                            tickFormatter={formatAxisPrice}
                          />
                          <Tooltip
                            labelFormatter={(value) =>
                              formatChartDateTime(Number(value))
                            }
                            formatter={(value) => formatPrice(Number(value))}
                            cursor={{ stroke: "#fb923c", strokeDasharray: "4 4" }}
                            contentStyle={{ borderRadius: 14, borderColor: "#fed7aa", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.1)" }}
                            labelStyle={{ color: "#111827", fontWeight: 600 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="none"
                            fill={`url(#price-fill-${product.id})`}
                            isAnimationActive={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            name="Price"
                            stroke="#f97316"
                            strokeWidth={2.5}
                            dot={{ r: 2.5, fill: "#f97316", strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: "#f97316" }}
                            animationDuration={350}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-[#172337] px-4 text-center text-sm text-[#B8C4D9]">
                      <span>
                        No price samples in {selectedRangeOption?.label || "this period"}.
                      </span>
                      {selectedRange !== "all" && (
                        <button
                          type="button"
                          onClick={() => setSelectedRange("all")}
                          className="rounded-md border border-slate-700 bg-[#1E2B40] px-3 py-1.5 font-medium text-[#B8C4D9] shadow-sm hover:bg-slate-700"
                        >
                          Show all saved history
                        </button>
                      )}
                    </div>
                  )}

                  {priceSummary.sampleCount === 1 && (
                    <p className="text-xs text-[#B8C4D9]">
                      One saved sample so far. More price checks are needed to show a trend.
                    </p>
                  )}

                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {chartData
                      .slice()
                      .reverse()
                      .map((history) => (
                        <div
                          key={`${history.id ?? "sample"}-${history.timestamp}`}
                          className="flex items-center justify-between rounded-xl border border-slate-700 bg-[#172337] px-3 py-2"
                        >
                          <span className="text-xs text-[#B8C4D9]">
                            {new Date(history.checked_at).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                          <span className="font-semibold text-[#F8FAFC]">
                            {formatPrice(Number(history.price))}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={alertModalOpen} onOpenChange={setAlertModalOpen}>
        <DialogContent className="glass-card max-w-lg rounded-3xl text-[#F8FAFC]">
          <DialogHeader>
            <DialogTitle>Price alert settings</DialogTitle>
            <DialogDescription className="text-[#B8C4D9]">
              Configure alerts for {displayTitle}. Alerts use verified price observations only.
            </DialogDescription>
          </DialogHeader>

          {alertLoading ? (
            <div className="flex min-h-32 items-center justify-center text-sm text-[#B8C4D9]">
              Loading alert settings...
            </div>
          ) : (
            <div className="space-y-4">
              {[
                ["target_price", "Target price", "We’ll notify you when the verified price reaches your goal."],
              ].map(([type, label, description]) => {
                const draft = alertDrafts[type] ?? {
                  enabled: false,
                  threshold: "",
                  frequency: "immediate",
                  observationWindowDays: 30,
                };

                return (
                  <div key={type} className="glass-card rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{label}</p>
                        <p className="mt-1 text-xs text-[#B8C4D9]">{description}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                        Active
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium text-[#B8C4D9]">
                        Target price
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={draft.threshold}
                          onChange={(event) => updateAlertDraft(type, { threshold: event.target.value })}
                          placeholder="Enter your target price"
                          className="glass-card mt-1 h-10 w-full rounded-lg px-3 text-sm text-[#F8FAFC] outline-none focus:border-[#F97316]"
                        />
                      </label>

                      <label className="text-xs font-medium text-[#B8C4D9]">
                        Notification frequency
                        <select
                          value={draft.frequency}
                          onChange={(event) => updateAlertDraft(type, { frequency: event.target.value })}
                          className="glass-card mt-1 h-10 w-full rounded-lg px-3 text-sm text-[#F8FAFC] outline-none focus:border-[#F97316]"
                        >
                          <option value="immediate">Immediately</option>
                          <option value="daily">At most once a day</option>
                          <option value="weekly">At most once a week</option>
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {alertSaved && (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
              <p className="font-semibold text-emerald-300">Alert settings saved</p>
              <p className="mt-1 text-xs text-emerald-100/70">We&apos;ll keep watching this product for you.</p>
            </div>
          )}

          {alertError && (
            <p role="alert" className="rounded-lg border border-[#F87171]/30 bg-[#F87171]/10 p-3 text-sm text-[#F87171]">
              {alertError}
            </p>
          )}

          {alertSaved ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAlertModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-[#1E2B40] px-4 py-2 text-sm font-medium text-[#B8C4D9] hover:bg-slate-700"
              >
                Close
              </button>
              <Link
                href="/alerts"
                onClick={() => setAlertModalOpen(false)}
                className="inline-flex items-center justify-center rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA580C]"
              >
                View all alerts
              </Link>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAlertModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-[#1E2B40] px-4 py-2 text-sm font-medium text-[#B8C4D9] hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveAlertSettings()}
                disabled={alertLoading || alertSaving}
                className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA580C] disabled:opacity-60"
              >
                {alertSaving ? "Saving..." : "Save alerts"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProductCard;
