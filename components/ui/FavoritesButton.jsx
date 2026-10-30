"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleProductFavorite } from "@/app/actions/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProductDisplayTitle } from "@/lib/product-url.mjs";
import { normalizePrice } from "@/lib/price-history.mjs";
import { getProductImageSrc } from "@/lib/product-image.mjs";

function formatPrice(value, currency = "INR") {
  const price = normalizePrice(value);
  if (price === null) return "Price unavailable";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

export default function FavoritesButton({ products = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState(() =>
    products.filter((product) => product.is_favorite)
  );
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    setFavorites(products.filter((product) => product.is_favorite));
  }, [products]);

  const removeFavorite = async (product) => {
    if (savingId) return;

    setSavingId(product.id);
    try {
      const result = await toggleProductFavorite(product.id, false);
      if (result?.error) {
        toast.error(result.error);
        return;
      }

      setFavorites((current) => current.filter((item) => item.id !== product.id));
      toast.success("Removed from favorites.");
      router.refresh();
    } catch (error) {
      console.error("Remove favorite error:", error);
      toast.error("Unable to update this favorite right now.");
    } finally {
      setSavingId("");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View favorite products${favorites.length ? ` (${favorites.length})` : ""}`}
        title="Favorite products"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-300/50 text-amber-200 transition hover:bg-amber-300/10 sm:h-10 sm:w-10"
      >
        <Star className="h-4 w-4" />
        {favorites.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F97316] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0B1220]">
            {favorites.length > 99 ? "99+" : favorites.length}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card max-h-[85vh] max-w-xl overflow-hidden rounded-3xl p-0 text-[#F8FAFC] shadow-2xl sm:max-w-xl">
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="border-b border-white/10 px-5 py-5 pr-12 sm:px-6">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Star className="h-5 w-5 fill-current text-amber-300" />
                Favorite products
                <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-xs font-semibold text-amber-200">
                  {favorites.length}
                </span>
              </DialogTitle>
              <DialogDescription className="text-[#B8C4D9]">
                Your saved products are ready to revisit whenever you need them.
              </DialogDescription>
            </DialogHeader>

            {favorites.length > 0 ? (
              <div className="min-h-0 space-y-3 overflow-y-auto p-4 sm:p-5">
                {favorites.map((product) => {
                  const imageSrc = getProductImageSrc(product.image_url, product.url);
                  const title = getProductDisplayTitle(product.name, product.url);

                  return (
                    <article
                      key={product.id}
                      className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-[#0B1220]/65 p-3 sm:gap-4 sm:p-4"
                    >
                      <img
                        src={imageSrc || "/product-placeholder.svg"}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.src = "/product-placeholder.svg";
                        }}
                        className="h-16 w-16 shrink-0 rounded-xl bg-[#172337] object-contain ring-1 ring-white/10 sm:h-20 sm:w-20"
                      />
                      <div className="min-w-0 flex-1">
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 text-sm font-semibold leading-5 text-[#F8FAFC] transition hover:text-[#FDBA74] sm:text-base"
                        >
                          {title}
                        </a>
                        <p className="mt-1 text-sm font-bold text-[#FDBA74]">
                          {formatPrice(product.current_price, product.currency)}
                        </p>
                      </div>
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${title}`}
                        title="Open product"
                        className="rounded-lg border border-slate-700 p-2 text-[#B8C4D9] transition hover:border-[#F97316] hover:text-[#FDBA74]"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => void removeFavorite(product)}
                        disabled={Boolean(savingId)}
                        aria-label={`Remove ${title} from favorites`}
                        title="Remove from favorites"
                        className="rounded-lg border border-amber-300/20 p-2 text-amber-200 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingId === product.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="h-4 w-4 fill-current" />
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <Star className="mx-auto h-9 w-9 text-amber-200" />
                <h3 className="mt-3 font-semibold">No favorite products yet</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#B8C4D9]">
                  Select the star on any tracked product to save it here.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
