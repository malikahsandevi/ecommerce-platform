import { apiClient } from './api';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadOptions?: () => Promise<any>;
}

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
      else if (row.validUntil && new Date(row.validUntil) < new Date()) status = 'expired';
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
function transformProductPayload(data: any) {
  const payload = { ...data };

  if (typeof payload.image === 'string') {
    const url = payload.image.trim();
    payload.images = url ? [{ url, altText: payload.name || '', isPrimary: true }] : [];
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
  if (!payload.brand) delete payload.brand;

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
  delete payload.perUserLimit;
  if (payload.usageLimit === '' || payload.usageLimit === 0) payload.usageLimit = null;
  if (payload.maxDiscountAmount === '' || payload.maxDiscountAmount === 0) {
    delete payload.maxDiscountAmount;
  }
  return payload;
}

/** Builds a schema-valid order from the flat admin form. */
async function buildOrderPayload(data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: products } = await apiClient.get('/products');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const product = (products || []).find((p: any) => p._id === data.product);
  const quantity = Math.max(1, Number(data.quantity) || 1);
  const price = product?.price ?? 0;
  const subtotal = price * quantity;

  const shippingAddress = {
    street: data.shippingStreet || '',
    city: data.shippingCity || '',
    state: data.shippingState || '',
    zipCode: data.shippingZip || '',
    country: data.shippingCountry || '',
  };

  return {
    orderNumber: data.orderNumber || `ORD-${Date.now().toString().slice(-6)}`,
    user: data.user,
    items: [
      {
        product: data.product,
        name: product?.name || 'Product',
        sku: product?.sku || '',
        price,
        quantity,
        image: product?.images?.[0]?.url || '',
      },
    ],
    subtotal,
    tax: 0,
    shippingCost: 0,
    discount: 0,
    total: subtotal,
    shippingAddress,
    billingAddress: shippingAddress,
    paymentMethod: data.paymentMethod || 'cod',
    paymentStatus: data.paymentStatus || 'pending',
    status: data.status || 'pending',
    shippingCarrier: data.shippingCarrier || undefined,
    trackingNumber: data.trackingNumber || undefined,
  };
}

/** Orders are only edited in place — status, payment and fulfilment. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformOrderUpdate(data: any) {
  const payload: Record<string, unknown> = {};
  for (const key of ['status', 'paymentStatus', 'paymentMethod', 'shippingCarrier', 'trackingNumber']) {
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
    loadOptions: async () => {
      if (apiEndpoint === 'products' || apiEndpoint === 'categories') {
        const [categoriesResponse, brandsResponse] = await Promise.all([
          apiClient.get('/categories'),
          apiClient.get('/brands'),
        ]);

        // Only ACTIVE categories/brands may be picked for a product — the
        // dropdowns used to offer deactivated entries too, so a product
        // could silently end up filed under an inactive category/brand.
        const isEnabled = (record: { isActive?: boolean }) => record.isActive !== false;

        return {
          categoryOptions: (categoriesResponse.data || [])
            .filter(isEnabled)
            .map((category: { _id: string; name: string }) => ({
              label: category.name,
              value: category._id,
            })),
          brandOptions: (brandsResponse.data || [])
            .filter(isEnabled)
            .map((brand: { _id: string; name: string }) => ({
              label: brand.name,
              value: brand._id,
            })),
        };
      }
      if (apiEndpoint === 'reviews' || apiEndpoint === 'orders') {
        const [productsResponse, usersResponse] = await Promise.all([
          apiClient.get('/products'),
          apiClient.get('/users'),
        ]);

        return {
          productOptions: (productsResponse.data || []).map(
            (product: { _id: string; name: string }) => ({
              label: product.name,
              value: product._id,
            }),
          ),
          userOptions: (usersResponse.data || []).map(
            (user: {
              _id: string;
              firstName?: string;
              lastName?: string;
              username?: string;
              email: string;
            }) => ({
              label:
                [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                user.username ||
                user.email,
              value: user._id,
            }),
          ),
        };
      }
      return {};
    },
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

export const mediaService = {
  /** Uploads the file to Cloudinary through the backend and registers it. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upload: async (data: any) => {
    const file = data.file as File;
    const dataUrl = await readFileAsDataUrl(file);

    let uploadedBy: string | undefined;
    try {
      const stored = localStorage.getItem('adminUser');
      if (stored) uploadedBy = JSON.parse(stored)?.id;
    } catch {
      /* the backend falls back to the first admin account */
    }

    const res = await apiClient.post('/media/upload', {
      dataUrl,
      filename: file.name,
      altText: data.altText || '',
      title: data.title || file.name,
      description: data.description || '',
      status: data.status || 'published',
      uploadedBy,
    });
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

  /** Real storage usage for the Media page cards (Cloudinary + library). */
  storage: async () => {
    const res = await apiClient.get('/media/storage');
    return res.data;
  },
};
