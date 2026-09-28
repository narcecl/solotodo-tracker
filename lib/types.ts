export type Params = Record<string, string[]>;
export type TrackedUrlStatus = "ok" | "needs_review";
export type CheckSource = "cron" | "manual";

export interface TrackedUrl {
  id: number;
  url: string;
  label: string;
  categoryId: number | null;
  params: Params;
  status: TrackedUrlStatus;
  active: boolean;
  createdAt: Date;
}

export interface PriceCheck {
  id: number;
  trackedUrlId: number;
  checkedAt: Date;
  source: CheckSource;
  productId: number;
  productName: string;
  productSlug: string;
  normalPrice: number;
  offerPrice: number;
  storeName: string | null;
  storeUrl: string | null;
}

export type NewPriceCheck = Omit<PriceCheck, "id" | "checkedAt">;

export interface BrowseEntry {
  productId: number;
  name: string;
  slug: string;
  normalPrice: number;
  offerPrice: number;
}

export interface StoreOffer {
  storeId: number;
  url: string;
  normalPrice: number;
}

export interface PriceDropAlert {
  label: string;
  productName: string;
  productUrl: string;
  previousPrice: number;
  newPrice: number;
  offerPrice: number;
  storeName: string | null;
  storeUrl: string | null;
}
