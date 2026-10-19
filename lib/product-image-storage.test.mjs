import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { storeProductImage } from "./product-image-storage.mjs";

async function createPhoto(width, height, format = "png") {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    const shade = (index * 37 + Math.floor(index / 7) * 19) % 256;
    pixels[index] = shade;
    pixels[index + 1] = (shade * 3) % 256;
    pixels[index + 2] = (shade * 7) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).toFormat(format).toBuffer();
}

const validPhoto = await createPhoto(256, 256);
const validJpeg = await createPhoto(256, 256, "jpeg");
const smallBadge = await createPhoto(96, 96);

test("stores the first working image candidate at a content-addressed URL", async () => {
  const uploads = [];
  const supabase = {
    storage: {
      from() {
        return {
          async upload(path, body, options) {
            uploads.push({ path, size: body.byteLength, options });
            return { error: null };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/product-images/${path}` } };
          },
        };
      },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(validJpeg, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });

  try {
    const result = await storeProductImage(supabase, {
      candidates: ["https://cdn.savana.com/product.jpg"],
      userId: "user-1",
      productId: "product-1",
      referer: "https://www.savana.com/product",
    });
    assert.match(
      result,
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/product-images\/user-1\/product-1\/[a-f0-9]{64}\.jpg$/
    );
    assert.equal(uploads[0].options.contentType, "image/jpeg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips a broken first candidate and stores a working fallback", async () => {
  const uploads = [];
  const supabase = {
    storage: {
      from() {
        return {
          async upload(path, body, options) {
            uploads.push({ path, size: body.byteLength, options });
            return { error: null };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/product-images/${path}` } };
          },
        };
      },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (new URL(url).hostname === "cdn.savana.com") {
      return new Response("not an image", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (new URL(url).pathname.includes("illustration")) {
      return new Response(smallBadge, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    return new Response(validPhoto, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  };

  try {
    const result = await storeProductImage(supabase, {
      candidates: [
        "https://cdn.savana.com/broken.jpg",
        "https://assets.myntassets.com/illustration.png",
        "https://assets.myntassets.com/product.png",
      ],
      userId: "user-2",
      productId: "product-2",
      referer: "https://www.savana.com/product",
    });
    assert.match(
      result,
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/product-images\/user-2\/product-2\/[a-f0-9]{64}\.png$/
    );
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].options.contentType, "image/png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps a Savana gallery URL when its CDN rejects server-side fetching", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("blocked", { status: 403 });

  try {
    const result = await storeProductImage({}, {
      candidates: [
        "https://img.mfrcdn.com/static/up/image/discount-icon.png",
        "https://img201.savana.com/v1/goods-pic/product_w96_q85.webp",
      ],
      userId: "user-3",
      productId: "product-3",
      referer: "https://www.savana.com/details/product-123456",
    });
    assert.equal(
      result,
      "https://img201.savana.com/v1/goods-pic/product_w1440_q90.webp"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps a Zara product photo when its CDN rejects server-side fetching", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("blocked", { status: 403 });

  try {
    const result = await storeProductImage({}, {
      candidates: [
        "https://static.zara.net/assets/public/b8dd/4284/43a24827800f/37cb1134adf7/01223504030-f1/01223504030-f1.jpg?ts=1792082225296&w=64",
      ],
      userId: "user-4",
      productId: "product-4",
      referer: "https://www.zara.com/in/en/woman-skirts-l1299.html?v1=2420454",
    });
    assert.equal(
      result,
      "https://static.zara.net/assets/public/b8dd/4284/43a24827800f/37cb1134adf7/01223504030-f1/01223504030-f1.jpg?ts=1792082225296&w=1200"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
