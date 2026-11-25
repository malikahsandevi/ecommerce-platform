export interface EntityOption {
  value: string;
  label: string;
}

export interface EntityOptions {
  categoryOptions?: EntityOption[];
  /** Product form's Category picker: top-level (main) categories only. */
  mainCategoryOptions?: EntityOption[];
  /** Product form's Sub Category picker with no main chosen: every subcategory. */
  subCategoryOptions?: EntityOption[];
  /** Subcategory options grouped by their main category's id. */
  subCategoryOptionsByParent?: Record<string, EntityOption[]>;
  /** Subcategory id → its main category's id (the pickers' dependency map). */
  subCategoryParentById?: Record<string, string>;
  brandOptions?: EntityOption[];
  vendorOptions?: EntityOption[];
  statusOptions?: EntityOption[];
  productOptions?: EntityOption[];
  userOptions?: EntityOption[];
  shippingMethodOptions?: EntityOption[];
  deliveryOptionOptions?: EntityOption[];
}

