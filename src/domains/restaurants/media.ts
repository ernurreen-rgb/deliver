const DEMO_RESTAURANT_COVER_IMAGES: Readonly<Record<string, string>> = {
  "tengri-kitchen": "/images/demo/tengri-kitchen-cover.webp",
};

export function getRestaurantCoverImageUrl(slug: string) {
  return DEMO_RESTAURANT_COVER_IMAGES[slug] ?? null;
}
