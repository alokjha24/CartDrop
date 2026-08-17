import Image from "next/image";
import { Rabbit, Shield, Bell, TrendingDown } from "lucide-react";
import AddProductForm from "@/components/ui/AddProductForm";
import AuthButton from "@/components/ui/AuthButton";
import { createClient } from "@/utils/supabase/server";
import { getProducts } from "./actions/auth";
import ProductCard from "@/components/ui/ProductCard";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();


  const product = user ? await getProducts() : [];

  const FEATURES = [
    {
      icon: Rabbit,
      title: "Lightning Fast",
      description:
        "Deal Drop extracts prices in seconds, handling JavaScript and dynamic content",
    },
    {
      icon: Shield,
      title: "Always Reliable",
      description:
        "Works across all major e-commerce sites with built-in anti-bot protection",
    },
    {
      icon: Bell,
      title: "Smart Alerts",
      description:
        "Get notified instantly when prices drop below your target",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Image
            src="/logo.png"
            alt="Logo"
            width={600}
            height={200}
            className="h-10 w-auto"
          />

          <AuthButton user={user} />
        </div>
      </header>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-7xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-orange-100 px-6 py-2 text-sm font-medium text-orange-700">
            Made by Alok
          </div>

          <h2 className="mb-4 text-4xl font-bold tracking-tight text-gray-900">
            Never Miss a Price Drop
          </h2>

          <p className="mx-auto mb-12 max-w-2xl text-xl text-gray-600">
            Track the price of products anytime and never miss a price drop.
          </p>

          <AddProductForm user={user} />

          {product.length === 0 && (
            <div className="mx-auto mt-16 grid max-w-4xl gap-6 md:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-xl border border-gray-200 bg-white p-6"
                >
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                    <Icon className="h-6 w-6 text-orange-500" />
                  </div>

                  <h3 className="mb-2 font-semibold text-gray-900">
                    {title}
                  </h3>

                  <p className="text-sm text-gray-600">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {user && product.length > 0 && (
        <section className="mx-auto max-w-[1500px] px-4 pb-20">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-2xl font-bold text-gray-900">
              Your Tracked Products
            </h3>
            <span className="text-sm text-gray-500">
              {product.length} {product.length === 1 ? "product" : "products"}
            </span>
          </div>

          <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
            {product.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>






        </section>
      )}


      {user && product.length === 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-20 text-center">
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12">
            <TrendingDown className="w-16 h-16 text-grey-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-grey-900 mb-2">
              No Product yet
            </h3>
            <p className="text-grey-600">
              Add your first product above to start tracking prices !
            </p>
          </div>

        </section>
      )














      }


    </main>
  );
}