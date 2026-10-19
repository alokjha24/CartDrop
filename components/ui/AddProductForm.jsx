"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "./input";
import { Loader2, Search } from "lucide-react";
import { AuthModal } from "./AuthModal";
import { addProduct } from "@/app/actions/auth";
import { toast } from "sonner";

const PENDING_PRODUCT_URL_KEY = "cartdrop.pending-product-url";

const AddProductForm = ({ user }) => {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const submitProductUrl = useCallback(async (productUrl) => {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("url", productUrl.trim());

      const result = await addProduct(formData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message || "Product tracked successfully!");
        setUrl("");
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!user?.id) return;

    let pendingUrl = "";
    try {
      pendingUrl = window.sessionStorage.getItem(PENDING_PRODUCT_URL_KEY) || "";
      if (pendingUrl) window.sessionStorage.removeItem(PENDING_PRODUCT_URL_KEY);
    } catch (error) {
      console.error("Unable to restore the product link after sign in:", error);
    }

    if (!pendingUrl) return;
    void Promise.resolve().then(() => {
      setUrl(pendingUrl);
      return submitProductUrl(pendingUrl);
    });
  }, [user?.id, submitProductUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    await submitProductUrl(url);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
        <div className="glass-card flex flex-col gap-2 rounded-2xl p-2 sm:flex-row">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a product URL from Amazon, Flipkart, Myntra or any store"
            className="h-12 border-0 bg-transparent text-base text-[#F8FAFC] shadow-none placeholder:text-slate-500 focus-visible:ring-0"
            required
            disabled={loading}
          />

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="h-12 bg-[#F97316] px-7 text-white hover:bg-[#EA580C]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Track price
              </>
            )}
          </Button>
        </div>
      </form>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        pendingProductUrl={url}
      />
    </>
  );
};

export default AddProductForm;
