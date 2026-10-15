"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownAZ,
  Search,
} from "lucide-react";
import { normalizePrice } from "@/lib/price-history.mjs";
import ProductCard from "@/components/ui/ProductCard";

function getPriceTimestamp(product) {
  const timestamp = product.updated_at ? new Date(product.updated_at).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function TrackedProducts({ products }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [currentTime] = useState(() => Date.now());

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

    return matchingProducts.sort((a, b) => {
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
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            return <ProductCard key={product.id} product={product} />;
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
