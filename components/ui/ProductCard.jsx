"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
  X,
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
} from "@/app/actions/auth";

const ProductCard = ({ product }) => {
  const router = useRouter();

  const [showChart, setShowChart] = useState(false);
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [priceHistory, setPriceHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [error, setError] = useState("");

  // ==================================================
  // PRICE
  // ==================================================

  const currentPrice = Number(product.current_price);

  const currency = product.currency || "INR";

  const formatPrice = (price) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 0,
      }).format(price);
    } catch {
      return `${currency} ${price}`;
    }
  };

  // ==================================================
  // SHOW / HIDE PRICE HISTORY
  // ==================================================

  const handleChart = async () => {
    setError("");

    if (chartModalOpen) {
      setChartModalOpen(false);
      return;
    }

    if (historyLoaded) {
      setChartModalOpen(true);
      return;
    }

    try {
      setLoadingChart(true);

      const history = await getPriceHistory(product.id);

      setPriceHistory(history || []);
      setHistoryLoaded(true);
      setChartModalOpen(true);
    } catch (error) {
      console.error("Price history error:", error);

      setError("Unable to load price history.");
    } finally {
      setLoadingChart(false);
    }
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

  // ==================================================
  // PRICE HISTORY CALCULATIONS
  // ==================================================

  const formatChartDate = (date) =>
    date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

  const chartData = (() => {
    const cleanedHistory = priceHistory
      .slice()
      .sort(
        (a, b) =>
          new Date(a.checked_at).getTime() -
          new Date(b.checked_at).getTime()
      )
      .filter(
        (item) =>
          item?.checked_at &&
          Number.isFinite(Number(item.price))
      );

    if (cleanedHistory.length === 0) {
      return [];
    }

    // Keep the latest value for each day, then fill missing days with the last known price.
    const priceByDay = new Map();

    cleanedHistory.forEach((item) => {
      const dayKey = new Date(item.checked_at)
        .toISOString()
        .slice(0, 10);

      priceByDay.set(dayKey, Number(item.price));
    });

    const allDayKeys = Array.from(priceByDay.keys()).sort();
    const startDate = new Date(`${allDayKeys[0]}T00:00:00Z`);
    const lastHistoryDate = new Date(
      `${allDayKeys[allDayKeys.length - 1]}T00:00:00Z`
    );
    const todayUtcKey = new Date().toISOString().slice(0, 10);
    const todayDate = new Date(`${todayUtcKey}T00:00:00Z`);
    const endDate =
      todayDate > lastHistoryDate
        ? todayDate
        : lastHistoryDate;

    const filledData = [];
    let rollingPrice = priceByDay.get(allDayKeys[0]);

    for (
      let cursor = new Date(startDate);
      cursor <= endDate;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const dayKey = cursor.toISOString().slice(0, 10);

      if (priceByDay.has(dayKey)) {
        rollingPrice = priceByDay.get(dayKey);
      }

      filledData.push({
        label: formatChartDate(cursor),
        price: rollingPrice,
      });
    }

    return filledData;
  })();

  const prices = chartData
    .map((item) => Number(item.price))
    .filter((price) => Number.isFinite(price));

  const firstPrice =
    prices.length > 0
      ? prices[0]
      : currentPrice;

  const lowestPrice =
    prices.length > 0
      ? Math.min(...prices)
      : currentPrice;

  const highestPrice =
    prices.length > 0
      ? Math.max(...prices)
      : currentPrice;

  const priceDifference =
    currentPrice - firstPrice;

  const priceDropped = priceDifference < 0;
  const priceIncreased = priceDifference > 0;

  // ==================================================
  // CHART POINTS
  // ==================================================

  const getChartPoints = () => {
    if (prices.length === 0) {
      return "";
    }

    if (prices.length === 1) {
      return "0,50 100,50";
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const range = max - min || 1;

    return prices
      .map((price, index) => {
        const x = (index / (prices.length - 1)) * 100;
        const y = 85 - ((price - min) / range) * 65;
        return `${x},${y}`;
      })
      .join(" ");
  };

  // ==================================================
  // CARD
  // ==================================================

  return (
    <>
      <Card className="w-full overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <CardHeader className="p-5 lg:p-6">

          <div className="flex items-start gap-4">

            {/* PRODUCT IMAGE */}

            <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-xl border bg-gray-50">

              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name || "Product"}
                  className="h-full w-full object-contain bg-white"
                  loading="lazy"
                  style={{ imageRendering: "auto" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                  No Image
                </div>
              )}

            </div>

            {/* PRODUCT INFO */}

            <div className="min-w-0 flex-1">

              <CardTitle className="line-clamp-2 text-[18px] font-semibold leading-6">
                {product.name}
              </CardTitle>

              <CardDescription className="mt-3 flex flex-wrap items-center gap-2">

                {/* PRICE */}

                <span className="text-[30px] font-bold leading-none text-orange-500">
                  {formatPrice(currentPrice)}
                </span>

                {/* TRACKING BADGE */}

                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">

                  <Activity className="h-3 w-3" />

                  Tracking

                </span>

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

            {/* SHOW CHART */}

            <button
              type="button"
              onClick={handleChart}
              disabled={loadingChart}
              className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              View Product
            </a>

            {/* REMOVE */}

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

        </CardContent>

        {/* ================================================= */}
        {/* FOOTER */}
        {/* ================================================= */}

        <CardFooter className="border-t bg-gray-50 px-5 py-3 text-xs text-gray-500">

          <span>
            Last checked{" "}
            {product.updated_at
              ? new Date(
                product.updated_at
              ).toLocaleString()
              : "Recently"}
          </span>

        </CardFooter>

      </Card>

      <Dialog
        open={chartModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setChartModalOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl sm:max-w-5xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="grid max-h-[85vh] overflow-hidden md:grid-cols-[320px_1fr]">
            <div className="flex items-center justify-center bg-gradient-to-br from-gray-50 to-white p-5">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name || "Product"}
                  className="h-[320px] w-full rounded-2xl object-contain bg-white shadow-sm md:h-[420px]"
                />
              ) : (
                <div className="flex h-[220px] w-full items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-100 text-sm text-gray-500">
                  No Image
                </div>
              )}
            </div>

            <div className="overflow-y-auto p-5 md:p-6">
              <DialogHeader className="mb-5 text-left">
                <DialogTitle className="text-2xl font-bold text-gray-900 md:text-3xl">
                  {product.name}
                </DialogTitle>
                <DialogDescription className="mt-3 flex flex-wrap items-center gap-3 text-left">
                  <span className="text-3xl font-bold text-orange-500 md:text-4xl">
                    {formatPrice(currentPrice)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    <Activity className="h-3 w-3" />
                    Tracking
                  </span>
                </DialogDescription>
              </DialogHeader>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {priceHistory.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                  No price history available yet.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Lowest</p>
                      <p className="mt-1 text-lg font-semibold">{formatPrice(lowestPrice)}</p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Highest</p>
                      <p className="mt-1 text-lg font-semibold">{formatPrice(highestPrice)}</p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Records</p>
                      <p className="mt-1 text-lg font-semibold">{priceHistory.length}</p>
                    </div>
                  </div>

                  {priceDropped && (
                    <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                      <TrendingDown className="h-4 w-4" />
                      Price dropped by {formatPrice(Math.abs(priceDifference))}
                    </div>
                  )}

                  {priceIncreased && (
                    <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                      <TrendingUp className="h-4 w-4" />
                      Price increased by {formatPrice(priceDifference)}
                    </div>
                  )}

                  <div className="h-64 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-2 shadow-inner">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          domain={[
                            (dataMin) => Math.max(0, Math.floor((dataMin || 0) / 100) * 100 - 100),
                            (dataMax) => Math.ceil((dataMax || 0) / 100) * 100 + 100,
                          ]}
                          tickFormatter={(value) => `₹${value}`}
                        />
                        <Tooltip
                          formatter={(value) => formatPrice(Number(value))}
                          labelStyle={{ color: "#111827" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="#f97316"
                          strokeWidth={3}
                          dot={{ r: 2, fill: "#f97316" }}
                          activeDot={{ r: 5, fill: "#f97316" }}
                          animationDuration={600}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2">
                    {priceHistory
                      .slice()
                      .reverse()
                      .map((history) => (
                        <div
                          key={history.id}
                          className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2"
                        >
                          <span className="text-xs text-gray-500">
                            {new Date(history.checked_at).toLocaleString()}
                          </span>
                          <span className="font-semibold text-gray-900">
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
    </>
  );
};

export default ProductCard;