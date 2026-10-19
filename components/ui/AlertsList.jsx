"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, ExternalLink, Loader2, Pencil, Trash2, X } from "lucide-react";
import { deletePriceAlert, upsertPriceAlert } from "@/app/actions/alerts";
import { getProductDisplayTitle } from "@/lib/product-url.mjs";
import { normalizePrice } from "@/lib/price-history.mjs";
import { getProductImageSrc } from "@/lib/product-image.mjs";

function formatPrice(value, currency = "INR") {
  const price = normalizePrice(value);
  if (price === null) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function getAlertCopy(alert) {
  return `Target ${formatPrice(alert.threshold, alert.products?.currency)}`;
}

export default function AlertsList({ initialAlerts, error }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [deletingId, setDeletingId] = useState("");
  const [editingAlert, setEditingAlert] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const openEdit = (alert) => {
    setEditingAlert(alert);
    setEditAmount(String(alert.threshold ?? ""));
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editingAlert) return;

    setSavingEdit(true);
    setEditError("");
    const result = await upsertPriceAlert(editingAlert.product_id, {
      alert_type: "target_price",
      threshold: editAmount,
      frequency: editingAlert.frequency || "immediate",
      observation_window_days: null,
      enabled: true,
    });

    if (result?.error) {
      setEditError(result.error);
    } else if (result?.warning) {
      setEditError(result.warning);
    } else if (result.alert) {
      setAlerts((current) =>
        current.map((alert) =>
          alert.id === editingAlert.id
            ? { ...alert, ...result.alert, products: alert.products }
            : alert
        )
      );
      setEditingAlert(null);
    }
    setSavingEdit(false);
  };

  const handleDelete = async (alert) => {
    if (!window.confirm("Remove this price alert?")) return;
    setDeletingId(alert.id);
    const result = await deletePriceAlert(alert.product_id, alert.id);
    if (result?.error) {
      window.alert(result.error);
    } else {
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
    }
    setDeletingId("");
  };

  if (error) {
    return <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-200">{error}</div>;
  }

  if (!alerts.length) {
    return (
      <div className="glass-card rounded-3xl border-dashed px-6 py-16 text-center">
        <Bell className="mx-auto h-10 w-10 text-[#F97316]" />
        <h2 className="mt-4 text-2xl font-bold">No alerts yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#B8C4D9]">Open any tracked product and create an alert when you find the price you want.</p>
        <Link href="/#tracked" className="mt-6 inline-flex rounded-xl bg-[#F97316] px-5 py-3 text-sm font-semibold text-white">Browse tracked products</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#B8C4D9]">Active and paused price watches</p>
          <h2 className="mt-1 text-2xl font-bold">{alerts.length} {alerts.length === 1 ? "alert" : "alerts"}</h2>
        </div>
        <Link href="/#tracked" className="glass-card w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-[#FDBA74] transition hover:border-orange-500/50 sm:w-auto">+ Track another product</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {alerts.map((alert) => {
          const product = alert.products ?? {};
          const productImageSrc = getProductImageSrc(product.image_url, product.url);
          const current = normalizePrice(product.current_price);
          const target = normalizePrice(alert.threshold);
          const reached = alert.alert_type === "target_price" && current !== null && target !== null && current <= target;
          const progress = reached ? 100 : target && current ? Math.min(100, Math.round((target / current) * 100)) : null;

          return (
            <article key={alert.id} className="glass-card min-w-0 overflow-hidden rounded-3xl">
              <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                {productImageSrc ? <img src={productImageSrc} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-[#0B1220] object-contain ring-1 ring-white/10 sm:h-20 sm:w-20" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#0B1220] text-xs text-slate-500 sm:h-20 sm:w-20">No image</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold leading-5 sm:text-lg sm:leading-6">{getProductDisplayTitle(product.name, product.url)}</h3>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#B8C4D9]"><Bell className="h-3.5 w-3.5 text-[#F97316]" /> {getAlertCopy(alert)}</p>
                    </div>
                    <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${reached ? "bg-emerald-500/15 text-emerald-300" : alert.enabled ? "bg-orange-500/15 text-[#FDBA74]" : "bg-slate-700 text-slate-300"}`}>
                      {reached ? "Target reached" : alert.enabled ? "Watching" : "Paused"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 sm:gap-3 sm:px-5">
                <div className="glass-card rounded-2xl p-4"><p className="text-xs text-[#B8C4D9]">Current price</p><p className="mt-1 text-xl font-bold">{formatPrice(current, product.currency)}</p></div>
                <div className="glass-card rounded-2xl p-4"><p className="text-xs text-[#B8C4D9]">Target price</p><p className="mt-1 text-xl font-bold text-[#FDBA74]">{formatPrice(target, product.currency)}</p></div>
              </div>
              <div className="px-4 pt-3 sm:hidden"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${reached ? "bg-emerald-500/15 text-emerald-300" : alert.enabled ? "bg-orange-500/15 text-[#FDBA74]" : "bg-slate-700 text-slate-300"}`}>{reached ? "Target reached" : alert.enabled ? "Watching" : "Paused"}</span></div>
              {progress !== null && <div className="px-5 pt-4"><div className="mb-1 flex justify-between text-[11px] text-[#B8C4D9]"><span>{reached ? "You can buy at your target" : "Progress to target"}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-700"><div className={`h-full rounded-full ${reached ? "bg-emerald-400" : "bg-[#F97316]"}`} style={{ width: `${progress}%` }} /></div></div>}
              <div className="mt-5 flex flex-col items-stretch gap-3 border-t border-slate-700 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="text-xs text-[#B8C4D9]">Notify: {alert.frequency === "immediate" ? "Immediately" : `At most once a ${alert.frequency === "daily" ? "day" : "week"}`}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openEdit(alert)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-[#B8C4D9] hover:border-[#F97316] hover:text-[#FDBA74] sm:flex-none"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  <a href={product.url} target="_blank" rel="noopener noreferrer" aria-label="Open product" className="rounded-lg border border-slate-600 p-2 text-[#B8C4D9] hover:border-[#F97316] hover:text-[#FDBA74]"><ExternalLink className="h-4 w-4" /></a>
                  <button type="button" onClick={() => void handleDelete(alert)} disabled={deletingId === alert.id} aria-label="Delete alert" className="rounded-lg border border-red-400/20 p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50">{deletingId === alert.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {editingAlert && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-alert-title"
        >
          <div className="glass-card w-full max-w-lg rounded-t-3xl p-5 text-[#F8FAFC] shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#F97316]">Update alert</p>
                <h2 id="edit-alert-title" className="mt-1 text-xl font-bold">Edit target price</h2>
                <p className="mt-1 text-sm text-[#B8C4D9]">
                  {getProductDisplayTitle(editingAlert.products?.name, editingAlert.products?.url)}
                </p>
              </div>
              <button type="button" onClick={() => setEditingAlert(null)} aria-label="Close edit alert dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs text-[#B8C4D9]">Current price</p>
              <p className="mt-1 text-2xl font-bold">{formatPrice(editingAlert.products?.current_price, editingAlert.products?.currency)}</p>
            </div>
            <label className="mt-4 block text-sm font-medium text-[#B8C4D9]">
              New target price
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={editAmount}
                onChange={(event) => setEditAmount(event.target.value)}
                autoFocus
                className="glass-card mt-2 h-12 w-full rounded-xl px-4 text-lg font-semibold text-[#F8FAFC] outline-none focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/20"
              />
            </label>
            {editError && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{editError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditingAlert(null)} className="rounded-xl border border-slate-700 bg-[#172337] px-4 py-3 text-sm font-semibold text-[#B8C4D9] hover:bg-slate-700">
                Cancel
              </button>
              <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white hover:bg-[#EA580C] disabled:opacity-60">
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                {savingEdit ? "Updating..." : "Update and save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
