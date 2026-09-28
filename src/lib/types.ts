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

export interface CheckProduct {
  productId: number;
  name: string;
  slug: string;
  normalPrice: number;
  offerPrice: number;
  position: number; // 0 = más barato
}

export type ProductChangeKind = "down" | "up" | "same" | "new";

export interface ProductChange extends CheckProduct {
  previousNormalPrice: number | null; // null si kind === "new" o no hay chequeo anterior con productos
  kind: ProductChangeKind;
}

export interface PriceChangeAlert {
  label: string;
  listingUrl: string;
  products: ProductChange[]; // ordenados por position
}


