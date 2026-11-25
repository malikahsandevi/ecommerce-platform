import axios from 'axios';
import { apiClient } from './api';
import { toast } from '@/components/ui/Toast';
import { couponExpired } from '@/config/couponConfig';

export interface ServiceCapabilities {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface ResourceService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list: (params: any) => Promise<{ items: any[]; meta: any }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create?: (data: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update?: (id: string, data: any) => Promise<any>;
  remove?: (id: string) => Promise<any>;
  /** Delete-impact: the record's live links for the delete
   *  confirmation's warning lines (modules whose backend serves
   *  GET /:id/delete-impact). Absent on the other modules. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteImpact?: (id: string) => Promise<any>;
  /** Delete All (Part 5): POST /:id/cascade-delete — the record plus
   *  its containment-linked records, server-computed and permission-
   *  filtered. Present exactly where deleteImpact is. */
  removeCascade?: (id: string) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadOptions?: () => Promise<any>;
}

/** Modules whose deletes warn about (and detach) the record's links. */
const DELETE_IMPACT_ENDPOINTS = new Set([
  'media',
  'categories',
  'brands',
  'products',
  'coupons',
  'users',
]);

export function getCapabilities(service: ResourceService | null): ServiceCapabilities {
  if (!service) return { canCreate: false, canUpdate: false, canDelete: false };
  return {
    canCreate: !!service.create,
    canUpdate: !!service.update,
    canDelete: !!service.remove,
  };
}

/** Maps a frontend route segment to its backend API endpoint. */
function endpointFor(pathname: string): string | null {
  const resource = pathname.split('/').filter(Boolean).pop()?.toLowerCase();
  if (!resource) return null;
  return resource === 'customers' ? 'users' : resource;
}

// ---------------------------------------------------------------------------
// Row adapters — the panel's tabs/stats filter on a `status` string, but
// several collections model state as booleans (isActive) or derive it from
// dates (coupons). Normalise those rows once, when they are fetched.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptRow(endpoint: string, row: any) {
  if (!row || typeof row !== 'object') return row;
  switch (endpoint) {
    case 'users':
    case 'categories':
    case 'brands':
      return { ...row, status: row.isActive === false ? 'inactive' : 'active' };
    case 'media':
      // Media has a real lifecycle status (published/draft/archived) —
      // only fall back to the isActive derivation for legacy records.
      return {
        ...row,
        status:
          row.status ||
          (row.isActive === false ? 'inactive' : 'active'),
      };
    case 'coupons': {
      let status = 'active';
      if (row.isActive === false) status = 'disabled';
      else if (couponExpired(row.validUntil)) status = 'expired';
      return { ...row, status };
    }
    default:
      return row;
  }
}

// ---------------------------------------------------------------------------
// Payload transforms — the form models do not match the Mongoose schemas
// 1:1. Translate before anything reaches the API so creates/updates do not
// fail validation or silently drop data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/** The alt a media item is shown with: its written alt, else its name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function effectiveMediaAlt(media: any): string {
  return media?.altText || media?.originalName || media?.filename || '';
}

function transformProductPayload(data: any) {
  const payload = { ...data };

  // The product form's two pickers (Ahsan's design): Category holds
  // the MAIN category, Sub Category the dependent subcategory — the
  // stored value is the SUBcategory's id alone. An empty Sub Category
  // (editing a product filed directly under a main before the
  // sub-only rule) leaves `category` exactly as the form sent it, and
  // the backend's grandfathering lets that save through.
  if ('subCategory' in payload) {
    if (payload.subCategory) payload.category = payload.subCategory;
    delete payload.subCategory;
  }

  if (Array.isArray(payload.images)) {
    // The gallery from the product form's media manager — send the
    // canonical entry shape; the backend enforces the 7-image cap, the
    // single main and the `image` mirror.
    payload.images = payload.images
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((entry: any) => entry && typeof entry.url === 'string' && entry.url.trim())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((entry: any) => ({
        url: entry.url,
        publicId: entry.publicId || undefined,
        mediaId: entry.mediaId || undefined,
        alt: entry.alt ?? entry.altText ?? '',
        isMain: Boolean(entry.isMain ?? entry.isPrimary),
      }));
    delete payload.image;
  } else if (typeof payload.image === 'string') {
    const url = payload.image.trim();
    payload.images = url ? [{ url, alt: payload.name || '', isMain: true }] : [];
    delete payload.image;
  }

  if (typeof payload.dimensions === 'string') {
    const nums = payload.dimensions.match(/[\d.]+/g)?.map(Number) || [];
    if (nums.length >= 3) {
      payload.dimensions = { length: nums[0], width: nums[1], height: nums[2] };
    } else {
      delete payload.dimensions;
    }
  }

  if (Array.isArray(payload.specifications)) {
    payload.attributes = payload.specifications
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((spec: any) => spec && (spec.key || spec.name))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((spec: any) => ({ name: spec.key || spec.name, value: spec.value || '' }));
    delete payload.specifications;
  }

  // Fields the panel used to show that the schema does not have.
  delete payload.salePrice;
  delete payload.discount;
  delete payload.featured;
  delete payload.shortDescription;
  // Brand is optional: the form's "None" choice arrives as "". Send an
  // explicit null (not a missing key) so an edit that picks None
  // actually clears a brand set earlier — a missing key would leave
  // the stored brand untouched.
  payload.brand = payload.brand ? payload.brand : null;

  // Optional numeric fields left blank in the form arrive as "" — drop them
  // so Mongoose does not cast them into values its validators reject.
  for (const key of ['comparePrice', 'costPrice', 'weight']) {
    if (payload[key] === '' || payload[key] === null) delete payload[key];
  }

  return payload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformUserPayload(data: any) {
  const payload = { ...data };
  if (payload.status !== undefined) {
    payload.isActive = payload.status === 'active';
    delete payload.status;
  }
  if (payload.isEmailVerified !== undefined) {
    payload.isVerified = payload.isEmailVerified;
    delete payload.isEmailVerified;
  }
  if (!payload.password) delete payload.password;
  delete payload.customerGroup;
  return payload;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCategoryPayload(data: any) {
  const payload = { ...data };
  if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
  if (payload.status !== undefined) {
    payload.isActive = payload.status === 'active';
    delete payload.status;
  }
  if ('parentCategory' in payload) {
    payload.parent =
      payload.parentCategory && payload.parentCategory !== 'main'
        ? payload.parentCategory
        : null;
    delete payload.parentCategory;
  }
  delete payload.icon;
  delete payload.banner;
  delete payload.isFeatured;
  delete payload.productsCount;
  return payload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformBrandPayload(data: any) {
  const payload = { ...data };
  if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
  if (payload.status !== undefined) {
    payload.isActive = payload.status === 'active';
    delete payload.status;
  }
  delete payload.banner;
  delete payload.isFeatured;
  delete payload.productsCount;
  delete payload.sortOrder;
  return payload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCouponPayload(data: any) {
  const payload = { ...data };
  // Limit semantics (2026-11-24): blank means NO limit (stored null,
  // shown "--"); a typed 0 is sent as 0 — the coupon is then dead and
  // can never be redeemed. Never translate 0 into null here.
  if (payload.usageLimit === '' || payload.usageLimit === undefined) {
    payload.usageLimit = null;
  }
  if (payload.perCustomerLimit === '' || payload.perCustomerLimit === undefined) {
    payload.perCustomerLimit = null;
  }
  if (payload.maxDiscountAmount === '' || payload.maxDiscountAmount === 0) {
    delete payload.maxDiscountAmount;
  }
  // Scoping pickers hold plain id arrays — send them as-is (an empty
  // array means no restriction); drop anything that is not an array.
  for (const key of ['applicableProducts', 'applicableCategories', 'applicableUsers']) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) {
      delete payload[key];
    }
  }
  return payload;
}

/** Builds a schema-valid order from the flat admin form. */
async function buildOrderPayload(data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: products } = await apiClient.get('/products');

  // The form's Items editor holds one draft line per order line (the
  // same product may repeat across lines — the server aggregates the
  // quantities before its stock check). A lone product/quantity pair
  // (the form's old shape) still builds a one-line order.
  const drafts: Array<{ product?: string; quantity?: number }> =
    Array.isArray(data.items) && data.items.length
      ? data.items
      : [{ product: data.product, quantity: data.quantity }];

  let subtotal = 0;
  const items = drafts.map((line) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const product = (products || []).find((p: any) => p._id === line.product);
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const price = product?.price ?? 0;
    subtotal += price * quantity;
    return {
      product: line.product,
      name: product?.name || 'Product',
      sku: product?.sku || '',
      price,
      quantity,
      image: product?.images?.[0]?.url || '',
    };
  });
  subtotal = Math.round(subtotal * 100) / 100;

  const shippingAddress = {
    street: data.shippingStreet || '',
    city: data.shippingCity || '',
    state: data.shippingState || '',
    zipCode: data.shippingZip || '',
    country: data.shippingCountry || '',
  };

  return {
    // Order numbers are generated by the server when none is given —
    // a browser-side timestamp slice used to collide between orders.
    orderNumber: data.orderNumber || undefined,
    user: data.user,
    items,
    subtotal,
    tax: 0,
    shippingCost: 0,
    discount: 0,
    total: subtotal,
    // Only a code the form actually APPLIED (validated live) is sent —
    // a half-typed code never reaches the server. The server re-runs
    // the same validation in createOrder and computes the real
    // discount/total, so this preview can never drift into the record.
    couponCode:
      data.couponApplied && data.couponCode
        ? String(data.couponCode).trim().toUpperCase()
        : undefined,
    shippingAddress,
    billingAddress: shippingAddress,
    paymentMethod: data.paymentMethod || 'cod',
    paymentStatus: data.paymentStatus || 'pending',
    status: data.status || 'pending',
    shippingCarrier: data.shippingCarrier || undefined,
    trackingNumber: data.trackingNumber || undefined,
    // The shipping choices — the server prices the order through
    // the shared shipping calculator from these two ids (the
    // shippingCost: 0 above is the fresh-store fallback the server
    // keeps when no methods are configured).
    shippingMethodId: data.shippingMethodId || undefined,
    deliveryOptionId: data.deliveryOptionId || undefined,
  };
}

/** Orders are only edited in place — status, payment and fulfilment. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformOrderUpdate(data: any) {
  const payload: Record<string, unknown> = {};
  for (const key of ['status', 'paymentStatus', 'paymentMethod', 'shippingCarrier', 'courierId', 'trackingNumber']) {
    if (data[key] !== undefined && data[key] !== '') payload[key] = data[key];
  }
  if (data.shippingStreet) {
    payload.shippingAddress = {
      street: data.shippingStreet,
      city: data.shippingCity || '',
      state: data.shippingState || '',
      zipCode: data.shippingZip || '',
      country: data.shippingCountry || '',
    };
  }
  return payload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PAYLOAD_TRANSFORMS: Record<string, (data: any) => any> = {
  products: transformProductPayload,
  users: transformUserPayload,
  categories: transformCategoryPayload,
  brands: transformBrandPayload,
  coupons: transformCouponPayload,
};

export function getResourceService(pathname: string): ResourceService | null {
  const apiEndpoint = endpointFor(pathname);
  if (!apiEndpoint) return null;

  const transform = PAYLOAD_TRANSFORMS[apiEndpoint];

  return {
    list: async (params) => {
      const { data } = await apiClient.get(`/${apiEndpoint}`, { params });
      if (Array.isArray(data)) {
        return {
          items: data.map((row) => adaptRow(apiEndpoint, row)),
          meta: { total: data.length, page: 1, limit: data.length },
        };
      }
      return data;
    },
    create: async (data) => {
      const payload =
        apiEndpoint === 'orders'
          ? await buildOrderPayload(data)
          : transform
            ? transform(data)
            : data;
      const res = await apiClient.post(`/${apiEndpoint}`, payload);
      return res.data;
    },
    update: async (id, data) => {
      const payload =
        apiEndpoint === 'orders'
          ? transformOrderUpdate(data)
          : transform
            ? transform(data)
            : data;
      const res = await apiClient.put(`/${apiEndpoint}/${id}`, payload);
      return res.data;
    },
    remove: async (id) => {
      const res = await apiClient.delete(`/${apiEndpoint}/${id}`);
      return res.data;
    },
    ...(DELETE_IMPACT_ENDPOINTS.has(apiEndpoint)
      ? {
          deleteImpact: async (id: string) => {
            const res = await apiClient.get(`/${apiEndpoint}/${id}/delete-impact`);
            return res.data;
          },
          removeCascade: async (id: string) => {
            const res = await apiClient.post(`/${apiEndpoint}/${id}/cascade-delete`);
            return res.data;
          },
        }
      : {}),
    loadOptions: async () => {
      // Entity dropdown labels carry the record's public code BEFORE
      // its name ("#CODE · Name") so a record can be tracked at a
      // glance — in the open menu and in the closed trigger alike.
      // Records without a code fall back to a short id slice.
      const entityLabel = (
        record: { _id: string; code?: string },
        name: string,
      ) => `#${record.code || String(record._id).slice(0, 6).toUpperCase()} · ${name}`;

      // Category dropdowns are hierarchical (Ahsan's sub-category
      // round): a subcategory's label carries its whole path —
      // "#CODE · Electronics › Phones" — and the options are ordered
      // as a tree walk, each main category followed by its own
      // subcategories, so the picker reads the way the catalog is
      // organised. The value stays the category's own id everywhere
      // these options are consumed (product form, coupon scoping,
      // the category form's own Parent Category picker).
      const hierarchicalCategoryOptions = (
        records: Array<{
          _id: string;
          code?: string;
          name: string;
          parent?: string | { _id?: string } | null;
        }>,
      ) => {
        const byId = new Map(records.map((record) => [String(record._id), record]));
        const parentIdOf = (record: (typeof records)[number]): string => {
          const parent = record.parent;
          if (!parent) return "";
          return typeof parent === "string" ? parent : String(parent._id || "");
        };
        const pathOf = (record: (typeof records)[number]): string => {
          const names = [record.name];
          const seen = new Set<string>([String(record._id)]);
          let pid = parentIdOf(record);
          while (pid && byId.has(pid) && !seen.has(pid)) {
            seen.add(pid);
            names.unshift(byId.get(pid)!.name);
            pid = parentIdOf(byId.get(pid)!);
          }
          return names.join(" › ");
        };
        const childrenOf = new Map<string, typeof records>();
        records.forEach((record) => {
          const pid = parentIdOf(record);
          const list = childrenOf.get(pid) || [];
          list.push(record);
          childrenOf.set(pid, list);
        });
        const ordered: typeof records = [];
        const visit = (record: (typeof records)[number]) => {
          ordered.push(record);
          (childrenOf.get(String(record._id)) || []).forEach(visit);
        };
        (childrenOf.get("") || []).forEach(visit);
        // A record whose parent is not in this list (e.g. filtered
        // out as inactive) still appears — after the tree, as a root.
        const placed = new Set(ordered.map((record) => String(record._id)));
        records.forEach((record) => {
          if (!placed.has(String(record._id))) ordered.push(record);
        });
        return ordered.map((record) => ({
          label: entityLabel(record, pathOf(record)),
          value: record._id,
        }));
      };

      // The product form's two pickers (Ahsan's design): Category
      // selects a MAIN category; Sub Category is dependent — every
      // subcategory (full-path labels, tree order) when no main is
      // chosen, only the chosen main's subs otherwise. Built from the
      // same records as the hierarchical options, plus the parent
      // lookup the form's dependency behaviour (auto-fill / clear)
      // runs on.
      const categoryPickerData = (
        records: Array<{
          _id: string;
          code?: string;
          name: string;
          parent?: string | { _id?: string } | null;
        }>,
      ) => {
        const parentIdOf = (record: (typeof records)[number]): string => {
          const parent = record.parent;
          if (!parent) return "";
          return typeof parent === "string" ? parent : String(parent._id || "");
        };
        const subCategoryParentById: Record<string, string> = {};
        records.forEach((record) => {
          const pid = parentIdOf(record);
          if (pid) subCategoryParentById[String(record._id)] = pid;
        });
        const subCategoryOptions = hierarchicalCategoryOptions(records).filter(
          (option) => subCategoryParentById[String(option.value)],
        );
        const subCategoryOptionsByParent: Record<string, { label: string; value: string }[]> = {};
        subCategoryOptions.forEach((option) => {
          const pid = subCategoryParentById[String(option.value)];
          (subCategoryOptionsByParent[pid] ||= []).push(option);
        });
        return {
          mainCategoryOptions: records
            .filter((record) => !parentIdOf(record))
            .map((record) => ({
              label: entityLabel(record, record.name),
              value: record._id,
            })),
          subCategoryOptions,
          subCategoryOptionsByParent,
          subCategoryParentById,
        };
      };

      if (apiEndpoint === 'products' || apiEndpoint === 'categories') {
        const [categoriesResponse, brandsResponse] = await Promise.all([
          apiClient.get('/categories'),
          apiClient.get('/brands'),
        ]);

        // Only ACTIVE categories/brands may be picked for a product — the
        // dropdowns used to offer deactivated entries too, so a product
        // could silently end up filed under an inactive category/brand.
        const isEnabled = (record: { isActive?: boolean }) => record.isActive !== false;
        const activeCategories = (categoriesResponse.data || []).filter(isEnabled);

        return {
          categoryOptions: hierarchicalCategoryOptions(activeCategories),
          ...categoryPickerData(activeCategories),
          brandOptions: (brandsResponse.data || [])
            .filter(isEnabled)
            .map((brand: { _id: string; code?: string; name: string }) => ({
              label: entityLabel(brand, brand.name),
              value: brand._id,
            })),
        };
      }
      if (apiEndpoint === 'coupons') {
        // The coupon form's scoping pickers: products and categories
        // the coupon may be limited to, and the CUSTOMERS it may be
        // limited to (staff accounts never redeem coupons, so the
        // user picker lists customers only).
        const [productsResponse, categoriesResponse, usersResponse] =
          await Promise.all([
            apiClient.get('/products'),
            apiClient.get('/categories'),
            apiClient.get('/users'),
          ]);

        const userLabel = (user: {
          _id: string;
          code?: string;
          firstName?: string;
          lastName?: string;
          username?: string;
          name?: string;
          email: string;
        }) =>
          entityLabel(
            user,
            [user.firstName, user.lastName].filter(Boolean).join(' ') ||
              user.name ||
              user.username ||
              user.email,
          );

        return {
          productOptions: (productsResponse.data || []).map(
            (product: { _id: string; code?: string; name: string }) => ({
              label: entityLabel(product, product.name),
              value: product._id,
            }),
          ),
          categoryOptions: hierarchicalCategoryOptions(categoriesResponse.data || []),
          userOptions: (usersResponse.data || [])
            .filter((user: { role?: string }) => user.role === 'Customer')
            .map((user: Parameters<typeof userLabel>[0]) => ({
              label: userLabel(user),
              value: user._id,
            })),
        };
      }
      if (apiEndpoint === 'reviews' || apiEndpoint === 'orders') {
        const [productsResponse, usersResponse, shippingResponse] = await Promise.all([
          apiClient.get('/products'),
          apiClient.get('/users'),
          // The order form's shipping pickers read the Shipping
          // centre through the orders API. Fail-soft: a store with
          // no shipping configured simply gets empty pickers.
          apiEndpoint === 'orders'
            ? apiClient.get('/orders/shipping-options').catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
        ]);

        return {
          shippingMethodOptions: (shippingResponse.data?.methods || []).map(
            (method: { id: string; name: string }) => ({
              label: method.name,
              value: method.id,
            }),
          ),
          deliveryOptionOptions: (shippingResponse.data?.deliveryOptions || []).map(
            (option: { id: string; name: string }) => ({
              label: option.name,
              value: option.id,
            }),
          ),
          productOptions: (productsResponse.data || []).map(
            (product: { _id: string; code?: string; name: string }) => ({
              label: entityLabel(product, product.name),
              value: product._id,
            }),
          ),
          userOptions: (usersResponse.data || []).map(
            (user: {
              _id: string;
              code?: string;
              firstName?: string;
              lastName?: string;
              username?: string;
              name?: string;
              email: string;
            }) => ({
              label: entityLabel(
                user,
                [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                  user.name ||
                  user.username ||
                  user.email,
              ),
              value: user._id,
            }),
          ),
        };
      }
      return {};
    },
  };
}

/**
 * Storage organization: every upload declares what the image is FOR,
 * and the backend saves it into that purpose's folder under
 * `ecommerce-media/` (products/, categories/, brands/, profiles/,
 * settings/, library/). The backend validates the key — these are
 * the only values that exist.
 */
export const MEDIA_PURPOSES = [
  "products",
  "categories",
  "brands",
  "profiles",
  "settings",
  "library",
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/** The purpose folder an existing asset URL already lives in (used
 *  when replacing a file behind a record — the replacement stays in
 *  the same folder family). Defaults to the general library. */
export function purposeFromAssetUrl(url?: string): MediaPurpose {
  const match = (url || "").match(/\/ecommerce-media\/([a-z]+)\//);
  const key = match?.[1];
  return (MEDIA_PURPOSES as readonly string[]).includes(key ?? "")
    ? (key as MediaPurpose)
    : "library";
}

export const mediaService = {
  /**
   * Uploads the file DIRECTLY to Cloudinary with a signature issued by
   * the backend, then registers the media record. The file bytes never
   * pass through the serverless backend — Vercel rejects request bodies
   * over ~4.5MB with a 413 before the API runs, which is exactly what
   * the old base64-through-the-backend flow hit on any real photo. This
   * one helper backs every upload entry point (Media page, product /
   * category / brand image fields), so all of them get the fix.
   */
  /**
   * Uploads a file DIRECTLY to Cloudinary with a backend-issued
   * signature and returns Cloudinary's own facts about the asset —
   * WITHOUT creating a Media record. `upload` registers a new record
   * from these facts; the Edit Media optimizer instead hands them to
   * `replaceFile`, which swaps the file behind an existing record.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadAsset: async (file: File, purpose?: MediaPurpose): Promise<any> => {
    // The file's size travels with the signature request: the
    // backend's storage rotation policy runs its fit check (and its
    // 98% stop) before issuing the signature, and answers with the
    // entry the file will land on plus a warning when that storage
    // is over 90% full.
    const sigRes = await apiClient.get('/media/upload-signature', {
      params: { ...(purpose ? { purpose } : {}), size: file.size },
    });
    const { signature, timestamp, apiKey, cloudName, folder, type, entry, storageWarning } = sigRes.data;

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', String(apiKey));
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);
    // Part of the backend's signature: the upload lands as an
    // authenticated-type asset (only reachable through signed URLs).
    if (type) form.append('type', String(type));

    try {
      const res = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
        form,
        { timeout: 120000 },
      );
      // The ≥90% destination warning is shown at upload time, here
      // in the one helper every upload entry point shares.
      if (storageWarning) toast.info(storageWarning);
      // The entry + cloud this asset landed on (the upload target's
      // account) travel with the facts — registration and replace
      // verify the asset against that same entry.
      return { ...res.data, cloudName, entry, storageWarning };
    } catch (uploadError) {
      // Surface Cloudinary's own explanation when it provides one.
      const cloudinaryMessage = (
        uploadError as { response?: { data?: { error?: { message?: string } } } }
      )?.response?.data?.error?.message;
      if (cloudinaryMessage) throw new Error(`Upload failed: ${cloudinaryMessage}`);
      throw uploadError;
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upload: async (data: any) => {
    const file = data.file as File;
    const uploaded = await mediaService.uploadAsset(file, data.purpose as MediaPurpose | undefined);

    // Small JSON registration — the backend reads the file's real facts
    // (URL, size, format, dimensions) back from Cloudinary itself.
    const res = await apiClient.post('/media/register', {
      publicId: uploaded.public_id,
      resourceType: uploaded.resource_type,
      cloudName: uploaded.cloudName,
      entry: uploaded.entry,
      originalName: file.name,
      mimeType: file.type || '',
      altText: data.altText || '',
      title: data.title || file.name,
      description: data.description || '',
      status: data.status || 'published',
    });
    return res.data;
  },

  /**
   * Replaces the file behind an existing media record with an asset
   * already uploaded to Cloudinary (see `uploadAsset`). The backend
   * updates the record in place — same id, same public code — rewrites
   * stored URL references and destroys the old asset.
   */
  replaceFile: async (
    id: string,
    facts: {
      url: string;
      publicId: string;
      cloudName?: string;
      entry?: string;
      size?: number;
      mimeType?: string;
      format?: string;
      dimensions?: { width?: number; height?: number };
      filename?: string;
    },
  ) => {
    const res = await apiClient.put(`/media/${id}/file`, facts);
    return res.data;
  },

  /** Metadata-only edit for media that is already uploaded. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: async (id: string, data: any) => {
    const res = await apiClient.put(`/media/${id}`, {
      title: data.title,
      altText: data.altText,
      description: data.description,
      status: data.status,
    });
    return res.data;
  },

  /** Real storage usage for the Media page cards (per storage entry). */
  storage: async () => {
    const res = await apiClient.get('/media/storage');
    return res.data;
  },

  /** Choose which configured storage entry receives new uploads. */
  setUploadTarget: async (slug: string) => {
    const res = await apiClient.put('/media/storage/target', { slug });
    return res.data;
  },

  /**
   * Library search for the "Select Media" picker — the backend matches
   * the query against file names, alt text and id prefixes, newest
   * first. An empty query returns the newest page of the whole library.
   */
  search: async (query: string, limit = 60) => {
    const res = await apiClient.get('/media', {
      params: { search: query, limit, kind: 'image' },
    });
    return Array.isArray(res.data) ? res.data : [];
  },

  /**
   * Everything using a media item — products (gallery mediaId match or
   * the legacy URL match), brands (logo URL) and categories (image
   * URL) — feeds the Edit Media panel's "Used In" list.
   */
  usage: async (id: string) => {
    const res = await apiClient.get(`/media/${id}/usage`);
    const data = res.data || {};
    return {
      products: Array.isArray(data.products) ? data.products : [],
      brands: Array.isArray(data.brands) ? data.brands : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
    };
  },
};

/** One populated product entry in a customer's shopping profile. */
export interface ProfileProduct {
  id: string;
  name: string;
  image: string;
  price: number | null;
  quantity?: number;
}

export interface ProfileOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  date: string;
  items: { name: string; quantity: number; price: number; image: string }[];
}

/** One bought product line, flattened from its order (Purchased popup). */
export interface ProfilePurchasedProduct {
  name: string;
  image: string;
  quantity: number;
  price: number;
  orderNumber: string;
  date: string;
}

export interface CustomerProfile {
  favorites: ProfileProduct[];
  liked: ProfileProduct[];
  cart: ProfileProduct[];
  favoriteCategories: { id: string; name: string; image: string }[];
  stats: {
    totalSpend: number;
    totalOrders: number;
    averageOrderValue: number;
    lastOrderDate: string | null;
  };
  purchased: ProfileOrder[];
  /** All non-cancelled orders (Total Spend / Total Orders popups). */
  orders: ProfileOrder[];
  purchasedProducts: ProfilePurchasedProduct[];
  usedCoupons: {
    code: string;
    timesUsed: number;
    discountType: string | null;
    discountValue: number | null;
    lastUsed: string | null;
  }[];
}

/**
 * The customer's shopping profile (GET /users/:id/profile): the stored
 * lists populated from the User record plus the order-derived stats —
 * the backend derives the transactional half from Orders per request.
 */
export const customerProfileService = {
  getProfile: async (userId: string): Promise<CustomerProfile> => {
    const res = await apiClient.get(`/users/${userId}/profile`);
    return res.data as CustomerProfile;
  },
};
