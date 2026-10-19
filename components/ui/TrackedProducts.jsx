"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  CheckSquare,
  Loader2,
  Search,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { normalizePrice } from "@/lib/price-history.mjs";
import ProductCard from "@/components/ui/ProductCard";
import { addProduct, deleteProducts, refreshTrackedProducts } from "@/app/actions/auth";
import { setProductsAlertsEnabled } from "@/app/actions/alerts";
import { toast } from "sonner";

function getPriceTimestamp(product) {
  const timestamp = product.last_checked_at || product.updated_at
    ? new Date(product.last_checked_at || product.updated_at).getTime()
    : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function TrackedProducts({ products }) {
  const router = useRouter();
  const initialRefreshStarted = useRef(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [currentTime] = useState(() => Date.now());
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState("");
  const [initialRefreshState, setInitialRefreshState] = useState("loading");
  const [selectionMode, setSelectionMode] = useState(false);

  useEffect(() => {
    if (initialRefreshStarted.current) return;
    initialRefreshStarted.current = true;

    let active = true;
    void refreshTrackedProducts().then((result) => {
      if (!active) return;
      if (result?.error) {
        setInitialRefreshState("failed");
        toast.error(result.error);
        return;
      }
      setInitialRefreshState("done");
      router.refresh();
    });

    return () => {
      active = false;
    };
  }, [router]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingProducts = products.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        [product.name, product.url, product.currency].some((value) =>
          String(value ?? "").toLowerCase().includes(normalizedQuery)
        );

      const price = normalizePrice(product.current_price);
      const updatedAt = getPriceTimestamp(product);
      const ageInDays = updatedAt
        ? (currentTime - updatedAt) / (24 * 60 * 60 * 1000)
        : Infinity;

      const matchesFilter =
        filter === "all" ||
        (filter === "fresh" && ageInDays <= 1) ||
        (filter === "stale" && ageInDays > 1) ||
        (filter === "priced" && price !== null);

      return matchesQuery && matchesFilter;
    });

    return [...matchingProducts].sort((a, b) => {
      if (sort === "low") {
        return (normalizePrice(a.current_price) ?? Infinity) -
          (normalizePrice(b.current_price) ?? Infinity);
      }
      if (sort === "high") {
        return (normalizePrice(b.current_price) ?? -Infinity) -
          (normalizePrice(a.current_price) ?? -Infinity);
      }
      if (sort === "name") {
        return String(a.name ?? "").localeCompare(String(b.name ?? ""));
      }
      return getPriceTimestamp(b) - getPriceTimestamp(a);
    });
  }, [currentTime, filter, products, query, sort]);

  const allProductIds = products.map((product) => product.id);
  const allVisibleSelected =
    allProductIds.length > 0 && allProductIds.every((id) => selectedIds.includes(id));

  const toggleSelected = (id, checked) => {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    );
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) =>
      allVisibleSelected ? [] : allProductIds
    );
  };

  const closeSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length || !window.confirm(`Remove ${selectedIds.length} selected products?`)) return;
    setBulkLoading("delete");
    const result = await deleteProducts(selectedIds);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Selected products removed.");
      setSelectedIds([]);
      window.location.reload();
    }
    setBulkLoading("");
  };

  const handleBulkRefresh = async () => {
    if (!selectedIds.length) return;
    const selectedProducts = products.filter((product) => selectedIds.includes(product.id));
    setBulkLoading("refresh");
    let failed = 0;
    for (const product of selectedProducts) {
      const formData = new FormData();
      formData.set("url", product.url);
      const result = await addProduct(formData);
      if (result?.error) failed += 1;
    }
    setBulkLoading("");
    if (failed) toast.error(`${failed} product${failed === 1 ? "" : "s"} could not be refreshed.`);
    else toast.success("Selected products refreshed.");
    window.location.reload();
  };

  const handleBulkPause = async () => {
    if (!selectedIds.length) return;
    setBulkLoading("pause");
    const result = await setProductsAlertsEnabled(selectedIds, false);
    if (result?.error) toast.error(result.error);
    else toast.success("Alerts paused for selected products.");
    setBulkLoading("");
  };

  const dashboardStats = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const freshProducts = products.filter((product) => {
      const updatedAt = getPriceTimestamp(product);
      return updatedAt > 0 && currentTime - updatedAt <= dayMs;
    });

    return {
      freshCount: freshProducts.length,
      pricedCount: products.filter((product) => normalizePrice(product.current_price) !== null).length,
      needsRefreshCount: products.length - freshProducts.length,
    };
  }, [currentTime, products]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4 shadow-xl shadow-black/25 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search tracked products</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your tracked products..."
              className="h-11 w-full rounded-xl border border-slate-700 bg-[#111C2E] pl-10 pr-4 text-sm text-[#F8FAFC] outline-none transition placeholder:text-slate-500 focus:border-[#F97316] focus:bg-[#1E2B40] focus:ring-4 focus:ring-orange-500/20"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {[
              ["all", "All products"],
              ["fresh", "Checked today"],
              ["stale", "Needs refresh"],
              ["priced", "With price"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`w-full rounded-lg px-3 py-2 text-xs font-semibold transition sm:w-auto ${
                  filter === value
                    ? "border border-[#F97316] bg-[#F97316] text-white shadow-sm"
                    : "border border-[#F97316]/70 bg-transparent text-[#FDBA74] hover:bg-[#F97316]/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 sm:max-w-xl sm:gap-4">
            {[
              ["Verified prices", dashboardStats.pricedCount, "text-[#F97316]"],
              ["Checked today", dashboardStats.freshCount, "text-[#168A52]"],
              ["Needs refresh", dashboardStats.needsRefreshCount, "text-[#D92D20]"],
            ].map(([label, value, color]) => (
              <div key={label}>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
              </div>
            ))}
          </div>
          <label className="relative">
            <span className="sr-only">Sort tracked products</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-slate-700 bg-[#111C2E] px-3 pr-9 text-sm font-medium text-[#B8C4D9] outline-none focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/20 lg:w-44"
            >
              <option value="recent">Recently checked</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="name">Name: A to Z</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {filteredProducts.length} of {products.length} tracked {products.length === 1 ? "product" : "products"}
          </span>
        </div>
        {filteredProducts.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            {!selectionMode ? (
              <button type="button" onClick={() => setSelectionMode(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-[#B8C4D9] hover:border-[#F97316]">
                <CheckSquare className="h-4 w-4" />
                Select products
              </button>
            ) : (
              <>
                <button type="button" onClick={toggleAllVisible} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-[#B8C4D9] hover:border-[#F97316]">
                  <CheckSquare className="h-4 w-4" />
                  {allVisibleSelected ? "Uncheck all" : "Check all"}
                </button>
                <button type="button" onClick={closeSelectionMode} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white">
                  Cancel
                </button>
              </>
            )}
            {selectionMode && selectedIds.length > 0 && (
              <>
                <span className="text-xs text-[#FDBA74]">{selectedIds.length} selected</span>
                <button type="button" onClick={() => void handleBulkRefresh()} disabled={Boolean(bulkLoading)} className="inline-flex items-center gap-2 rounded-lg border border-[#F97316]/70 px-3 py-2 text-xs font-semibold text-[#FDBA74] disabled:opacity-60">
                  {bulkLoading === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh selected
                </button>
                <button type="button" onClick={() => void handleBulkDelete()} disabled={Boolean(bulkLoading)} className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-60">
                  {bulkLoading === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete selected
                </button>
                <button type="button" onClick={() => void handleBulkPause()} disabled={Boolean(bulkLoading)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-[#B8C4D9] disabled:opacity-60">
                  {bulkLoading === "pause" ? "Pausing..." : "Pause selected alerts"}
                </button>
              </>
            )}
            {initialRefreshState === "loading" && (
              <p className="mt-3 flex items-center gap-2 text-xs text-[#B8C4D9]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F97316]" />
                Checking latest prices from the original stores...
              </p>
            )}
            {initialRefreshState === "failed" && (
              <p className="mt-3 text-xs text-amber-200">
                Latest price check failed. Existing saved prices are shown.
              </p>
            )}
          </div>
        )}
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            return (
              <ProductCard
                key={`${product.id}-${product.image_url ?? ""}`}
                product={product}
                selected={selectedIds.includes(product.id)}
                onSelect={selectionMode ? toggleSelected : undefined}
              />
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#0B1220]/65 px-6 py-14 text-center shadow-xl shadow-black/25 backdrop-blur-xl">
          <ArrowDownAZ className="mx-auto h-8 w-8 text-slate-300" />
          <h3 className="mt-3 font-semibold text-[#F8FAFC]">No tracked products found</h3>
          <p className="mt-1 text-sm text-[#B8C4D9]">Try a different search term or filter.</p>
        </div>
      )}
    </div>
  );
}
