"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Tag as TagIcon,
  PlusCircle,
  UploadCloud,
  Images,
  Pencil,
  Trash2,
  Lock,
  Calendar,
} from "lucide-react";
import Select, { SelectOption } from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { StepperButtons, steppedValue } from "@/components/ui/NumberStepper";
import MediaPickerModal from "@/components/models/MediaPickerModal";
import ImageCropper from "@/components/models/ImageCropper";
import ProductMediaManager, {
  GalleryImage,
} from "@/components/models/ProductMediaManager";
import CustomerShoppingProfile from "@/components/models/CustomerShoppingProfile";
import CouponApplyField from "@/components/models/CouponApplyField";
import OrderItemsField from "@/components/models/OrderItemsField";
import ShippingQuoteField from "@/components/models/ShippingQuoteField";
import DatePicker from "@/components/ui/DatePicker";
import { formatRangeDay } from "@/components/ui/DateRangePicker";
import { mediaService } from "@/services/resourceRegistry";
import { extractApiError } from "@/services/api";
import { useLanguage } from "@/services/i18n";

// Export SelectOption for module integration
export type { SelectOption };

export type FormFieldType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "multi-select"
  | "checkbox"
  | "switch"
  | "date"
  | "tags"
  | "key-value"
  | "image"
  | "media-gallery"
  | "shopping-profile"
  | "order-items"
  | "coupon"
  | "shipping-quote";

export interface FormField {
  name: string; // Key in formData (e.g. "title", "sku", "address.city")
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: SelectOption[];
  defaultValue?: any;
  colSpan?: 1 | 2 | 3 | 4; // Grid column span in a 4-column layout (1 = 25%, 2 = 50%, 3 = 75%, 4 = 100%)
  section?: string; // Grouping section title (e.g. "Basic Details", "Pricing & Inventory")
  disabled?: boolean;
  /**
   * When true, the field renders as a read-only display while EDITING an
   * existing record (the value is shown, never changeable); on CREATE it
   * stays a normal editable field. Used for pairings that must not change
   * after creation — e.g. a review's Product and Customer.
   */
  disableOnEdit?: boolean;
  /**
   * Image fields only: the image must be saved EXACTLY square (1:1).
   * Choosing a new image — via Upload or the library Select — opens
   * the 1:1 cropper first and nothing is uploaded until the crop is
   * applied; clicking the current image re-opens the cropper on it.
   * Used for profile avatars, which render round everywhere.
   */
  cropToSquare?: boolean;
  /**
   * Image fields only: the storage purpose folder uploads for this
   * field land in (see services/resourceRegistry MEDIA_PURPOSES).
   * Defaults to the general library folder.
   */
  uploadPurpose?: import("@/services/resourceRegistry").MediaPurpose;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  helperText?: string;
  /**
   * For a select whose options come from another resource (Category,
   * Brand): when the loaded list is empty, the dropdown shows
   * `emptyMessage` plus a button that jumps to that resource's page and
   * auto-opens its create form there. Attached by the page only after
   * the options have loaded and come back empty — never while loading
   * and never when items exist.
   */
  createNew?: {
    emptyMessage: string;
    buttonLabel: string;
    path: string;
    resource: string;
  };
}

export interface ItemFormData {
  [key: string]: any;
}

export interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  formMode: "add" | "edit";
  itemTypeLabel?: string;
  formData: ItemFormData;
  setFormData: React.Dispatch<React.SetStateAction<ItemFormData>>;
  handleSave: (e: React.FormEvent) => void | Promise<void>;
  fields?: FormField[]; // Dynamic fields defined in page config
  categoryOptions?: SelectOption[];
  brandOptions?: SelectOption[];
  statusOptions?: SelectOption[];
  error?: string | null;
}

// Utility to read nested object keys (e.g. "personalInfo.firstName")
function getNestedValue(obj: any, path: string): any {
  if (!obj) return "";
  if (obj[path] !== undefined) return obj[path];
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return "";
    current = current[part];
  }
  return current !== undefined && current !== null ? current : "";
}

// Utility to write nested object keys
function setNestedValue(obj: any, path: string, value: any): any {
  if (!path.includes(".")) {
    return { ...obj, [path]: value };
  }
  const parts = path.split(".");
  const newObj = { ...obj };
  let current = newObj;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = { ...(current[parts[i]] || {}) };
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return newObj;
}

export const FormModal: React.FC<FormModalProps> = ({
  isOpen,
  onClose,
  formMode,
  itemTypeLabel = "Item",
  formData,
  setFormData,
  handleSave,
  fields = [],
  categoryOptions = [],
  brandOptions = [],
  statusOptions = [],
  error,
}) => {
  const router = useRouter();
  const { t } = useLanguage();
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  // Pending (not yet added) pick of each multi-select field.
  const [multiPick, setMultiPick] = useState<Record<string, string>>({});
  const [imageUpload, setImageUpload] = useState<{ field: string; busy: boolean; error: string }>({
    field: "",
    busy: false,
    error: "",
  });
  // Which image field the Media library picker is open for (Select button).
  const [pickerField, setPickerField] = useState<string | null>(null);
  // Which date field the single-date picker popup is open for.
  const [dateField, setDateField] = useState<string | null>(null);
  // "Set image" cropper target: the field being edited, the image it
  // opens on, and whether it was launched from inside the media picker
  // (then applying also confirms the cropped image as the pick).
  const [cropTarget, setCropTarget] = useState<{
    field: string;
    url: string;
    fromPicker: boolean;
    /** Original file name when known (picker items carry it) — the
     *  cropper names its output after it. */
    name?: string;
    /** The url is a local object URL of a just-chosen file (square-crop
     *  fields route uploads through the cropper before anything is
     *  sent) — revoked as soon as the cropper closes. */
    objectUrl?: boolean;
  } | null>(null);

  // Revoke a pending object URL the moment its cropper closes (Apply,
  // Cancel, Esc — every exit path clears cropTarget).
  const cropObjectUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cropTarget && cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
      cropObjectUrlRef.current = null;
    }
  }, [cropTarget]);

  // Backdrop dismissal: a click closes the form only when the press
  // BOTH started and ended on the overlay itself — clicks inside the
  // panel (and drags that start inside, e.g. selecting text) never
  // close it. Child popups (picker, cropper) render their own overlays
  // above this one, so a click on their backdrop targets their overlay,
  // not this one, and only closes the child.
  const backdropPressRef = useRef(false);

  // Double-submit guard: while a save is in flight, repeat submits
  // (a double-click on Create, an Enter mash, an impatient re-click)
  // are ignored and the submit button is disabled, so one form can
  // never create or update the same record twice. The ref blocks
  // even same-frame repeats, before React has re-rendered the
  // disabled state; the state drives the button's disabled look.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    const release = () => {
      submittingRef.current = false;
      setIsSubmitting(false);
    };
    try {
      Promise.resolve(handleSave(event)).then(release, release);
    } catch {
      release();
    }
  };

  // A modal closed mid-save must never reopen with the guard stuck
  // on — closing always releases it (the save itself continues in
  // the page handler, exactly as before).
  useEffect(() => {
    if (!isOpen) {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Esc follows the same stacking: cropper first, then the picker,
  // then the form itself.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (cropTarget) {
        setCropTarget(null);
        return;
      }
      if (pickerField) {
        setPickerField(null);
        return;
      }
      if (dateField) {
        setDateField(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, cropTarget, pickerField, dateField, onClose]);

  // A file chosen for an image field. Square-crop fields (profile
  // avatars) do NOT upload yet: the cropper opens on the local file
  // first, and only the applied 1:1 crop is ever uploaded. Other
  // fields upload straight away, as before.
  const handleImageChosen = (field: FormField, file: File | undefined) => {
    if (!file) return;
    if (field.cropToSquare) {
      const url = URL.createObjectURL(file);
      cropObjectUrlRef.current = url;
      setCropTarget({ field: field.name, url, fromPicker: false, name: file.name, objectUrl: true });
      return;
    }
    void handleImageFile(field.name, file);
  };

  // Image fields accept a pasted URL or a real file — files go through the
  // media library upload endpoint and the field receives the hosted URL.
  const handleImageFile = async (fieldName: string, file: File | undefined) => {
    if (!file) return;
    setImageUpload({ field: fieldName, busy: true, error: "" });
    try {
      const uploaded = await mediaService.upload({
        file,
        title: file.name,
        purpose: fields.find((f) => f.name === fieldName)?.uploadPurpose,
      });
      if (!uploaded?.url) throw new Error(t("The upload did not return a URL."));
      handleFieldChange(fieldName, uploaded.url);
      setImageUpload({ field: fieldName, busy: false, error: "" });
    } catch (uploadError) {
      setImageUpload({ field: fieldName, busy: false, error: extractApiError(uploadError) });
    }
  };

  // Group fields by section
  const groupedSections = useMemo(() => {
    if (!fields || fields.length === 0) return [];
    const sectionsMap = new Map<string, FormField[]>();

    fields.forEach((field) => {
      const sectionName = field.section || "General Information";
      if (!sectionsMap.has(sectionName)) {
        sectionsMap.set(sectionName, []);
      }
      sectionsMap.get(sectionName)!.push(field);
    });

    return Array.from(sectionsMap.entries()).map(([title, sectionFields]) => ({
      title,
      fields: sectionFields,
    }));
  }, [fields]);

  if (!isOpen) return null;

  // Empty Category/Brand dropdown → "Create New": hand the target
  // resource to that resource's page via sessionStorage (the same
  // handoff pattern as openEntity), close this form, and navigate —
  // the landing page opens its own create form on arrival.
  const handleCreateNew = (createNew: NonNullable<FormField["createNew"]>) => {
    try {
      sessionStorage.setItem("openCreate", createNew.resource);
    } catch {
      /* navigation still happens; the create form just won't auto-open */
    }
    onClose();
    router.push(createNew.path);
  };

  // Change handler for standard input fields
  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData((prev) => setNestedValue(prev, fieldName, value));
  };

  // A date field's current value as an ISO day string (or null) — the
  // same normalization the old native <input type="date"> applied on
  // render, shared by the field's trigger and the picker popup.
  const dateFieldIso = (name: string): string | null => {
    const v = getNestedValue(formData, name);
    if (!v) return null;
    return typeof v === "string"
      ? v.split("T")[0]
      : new Date(v).toISOString().split("T")[0];
  };

  // Tag helper functions
  const handleAddTag = (fieldName: string) => {
    const inputVal = (tagInputs[fieldName] || "").trim();
    if (!inputVal) return;

    const currentTags: string[] = getNestedValue(formData, fieldName) || [];
    if (!currentTags.includes(inputVal)) {
      handleFieldChange(fieldName, [...currentTags, inputVal]);
      setTagInputs((prev) => ({ ...prev, [fieldName]: "" }));
    }
  };

  const handleRemoveTag = (fieldName: string, tagToRemove: string) => {
    const currentTags: string[] = getNestedValue(formData, fieldName) || [];
    handleFieldChange(
      fieldName,
      currentTags.filter((t) => t !== tagToRemove)
    );
  };

  // Multi-select helpers: the field's value is an array of option ids;
  // the house Select stages one pick, Add commits it as a chip.
  const handleAddMultiPick = (fieldName: string) => {
    const pick = multiPick[fieldName];
    if (!pick) return;
    const current: string[] = (getNestedValue(formData, fieldName) || []).map(String);
    if (!current.includes(pick)) {
      handleFieldChange(fieldName, [...current, pick]);
    }
    setMultiPick((prev) => ({ ...prev, [fieldName]: "" }));
  };

  const handleRemoveMultiPick = (fieldName: string, idToRemove: string) => {
    const current: string[] = (getNestedValue(formData, fieldName) || []).map(String);
    handleFieldChange(
      fieldName,
      current.filter((id) => id !== idToRemove)
    );
  };

  // Key-Value specifications helper functions
  const handleAddKeyValueRow = (fieldName: string) => {
    const currentRows = getNestedValue(formData, fieldName) || [];
    handleFieldChange(fieldName, [...currentRows, { key: "", value: "" }]);
  };

  const handleKeyValueChange = (
    fieldName: string,
    index: number,
    keyOrVal: "key" | "value",
    val: string
  ) => {
    const currentRows = [...(getNestedValue(formData, fieldName) || [])];
    currentRows[index] = { ...currentRows[index], [keyOrVal]: val };
    handleFieldChange(fieldName, currentRows);
  };

  const handleRemoveKeyValueRow = (fieldName: string, index: number) => {
    const currentRows = getNestedValue(formData, fieldName) || [];
    handleFieldChange(
      fieldName,
      currentRows.filter((_: any, idx: number) => idx !== index)
    );
  };

  // Grid column span classes
  const getColSpanClass = (span?: number) => {
    switch (span) {
      case 1:
        return "col-span-1 sm:col-span-1 md:col-span-1";
      case 2:
        return "col-span-1 sm:col-span-2 md:col-span-2";
      case 3:
        return "col-span-1 sm:col-span-2 md:col-span-3";
      case 4:
      default:
        return "col-span-1 sm:col-span-2 md:col-span-4";
    }
  };

  // Render individual field
  const renderField = (field: FormField) => {
    const rawValue = getNestedValue(formData, field.name);
    const colClass = getColSpanClass(field.colSpan);

    switch (field.type) {
      case "text":
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              required={field.required}
              disabled={field.disabled}
              value={rawValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder ? t(field.placeholder) : t("Enter {label}").replace("{label}", t(field.label))}
              className="w-full px-3 py-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)] transition-colors"
            />
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );

      case "number":
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <input
                type="number"
                required={field.required}
                disabled={field.disabled}
                min={field.min}
                max={field.max}
                step={field.step || 1}
                value={rawValue === "" || rawValue === undefined ? "" : rawValue}
                onChange={(e) =>
                  handleFieldChange(
                    field.name,
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                placeholder={field.placeholder ? t(field.placeholder) : "0"}
                className="w-full px-3 py-2 pr-7 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)] transition-colors"
              />
              <StepperButtons
                disabled={field.disabled}
                onStep={(dir) =>
                  handleFieldChange(
                    field.name,
                    steppedValue(rawValue, dir, field.step || 1, field.min, field.max)
                  )
                }
              />
            </div>
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );

      case "date": {
        // House custom date input: a trigger in the form inputs' own
        // style opens the shared single-date calendar popup
        // (DatePicker); only its Apply commits, as an ISO day string
        // byte-identical to the old native input's value.
        const isoValue = dateFieldIso(field.name) || "";
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <button
              type="button"
              disabled={field.disabled}
              onClick={() => setDateField(field.name)}
              data-testid={`date-field-${field.name}`}
              className="flex w-full items-center justify-between px-3 py-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)] transition-colors disabled:opacity-50"
            >
              <span className={isoValue ? "" : "text-[var(--text-muted)]"}>
                {isoValue
                  ? formatRangeDay(isoValue)
                  : field.placeholder
                    ? t(field.placeholder)
                    : "01 01 2026"}
              </span>
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            </button>
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );
      }

      case "select":
        if (field.disableOnEdit && formMode === "edit") {
          // Read-only display: same footprint as the Select trigger, but
          // muted, no chevron, no dropdown, not focusable or clickable.
          // The stored value is left untouched, so saving the form sends
          // the unchanged original id.
          const selectedLabel =
            field.options?.find((o) => o.value === String(rawValue || ""))
              ?.label || "—";
          return (
            <div key={field.name} className={colClass}>
              <label className="font-bold text-[var(--text)] block mb-1 text-xs">
                {t(field.label)}{" "}
                {field.required && <span className="text-red-500">*</span>}
              </label>
              <div
                aria-disabled="true"
                className="flex h-11 w-full cursor-not-allowed select-none items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-muted)]"
              >
                <span className="truncate">{selectedLabel === "—" ? selectedLabel : t(selectedLabel)}</span>
                <Lock className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </div>
              {field.helperText && (
                <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                  {t(field.helperText)}
                </span>
              )}
            </div>
          );
        }
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <Select
              value={String(rawValue || "")}
              options={(field.options || []).map((option) => ({ ...option, label: t(option.label) }))}
              onChange={(val) => handleFieldChange(field.name, val)}
              placeholder={field.placeholder ? t(field.placeholder) : t("Select {label}").replace("{label}", t(field.label))}
              fullWidth
              variant="outline"
              size="md"
              disabled={field.disabled}
              emptyText={field.createNew ? t(field.createNew.emptyMessage) : undefined}
              emptyActionLabel={field.createNew ? t(field.createNew.buttonLabel) : undefined}
              onEmptyAction={
                field.createNew ? () => handleCreateNew(field.createNew!) : undefined
              }
            />
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );

      case "multi-select": {
        const selectedIds: string[] = (
          Array.isArray(rawValue) ? rawValue : []
        ).map(String);
        const allOptions = field.options || [];
        const labelFor = (id: string) =>
          allOptions.find((o) => String(o.value) === id)?.label || id;
        const availableOptions = allOptions.filter(
          (o) => !selectedIds.includes(String(o.value))
        );
        const pendingPick = multiPick[field.name] || "";
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedIds.map((id) => (
                  <span
                    key={id}
                    className="px-2.5 py-1 bg-[var(--primary)] border border-transparent text-[var(--primary-text)] rounded-lg text-[10px] font-bold flex items-center gap-1"
                  >
                    {t(labelFor(id))}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-red-200"
                      onClick={() => handleRemoveMultiPick(field.name, id)}
                    />
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={pendingPick}
                  options={availableOptions.map((option) => ({
                    ...option,
                    label: t(option.label),
                  }))}
                  onChange={(val) =>
                    setMultiPick((prev) => ({ ...prev, [field.name]: val }))
                  }
                  placeholder={
                    field.placeholder
                      ? t(field.placeholder)
                      : t("Select {label}").replace("{label}", t(field.label))
                  }
                  fullWidth
                  variant="outline"
                  size="md"
                  disabled={field.disabled}
                  emptyText={t("No options available yet.")}
                />
              </div>
              <Button
                variant="secondary"
                size="md"
                type="button"
                disabled={!pendingPick || field.disabled}
                onClick={() => handleAddMultiPick(field.name)}
              >
                {t("Add")}
              </Button>
            </div>
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );
      }

      case "switch":
      case "checkbox":
        return (
          <div key={field.name} className={`${colClass} flex items-center gap-3 pt-4 sm:pt-6`}>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(rawValue)}
                disabled={field.disabled}
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[var(--border)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-[var(--surface)] after:border-[var(--border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--primary)]" />
            </label>
            <span className="font-bold text-[var(--text)] text-xs cursor-pointer select-none">
              {t(field.label)}
            </span>
          </div>
        );

      case "textarea":
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={field.rows || 3}
              required={field.required}
              disabled={field.disabled}
              value={rawValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder ? t(field.placeholder) : t("Enter {label}...").replace("{label}", t(field.label).toLowerCase())}
              className="w-full px-3 py-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)] resize-none transition-colors [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full"
            />
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );

      case "tags":
        const tagsList: string[] = Array.isArray(rawValue) ? rawValue : [];
        const currentTagInput = tagInputs[field.name] || "";
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)}
            </label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={currentTagInput}
                onChange={(e) =>
                  setTagInputs((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
                placeholder={field.placeholder ? t(field.placeholder) : t("Type and press Enter to add tag")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag(field.name);
                  }
                }}
                className="flex-1 min-w-0 h-[34px] px-3 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)]"
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => handleAddTag(field.name)}
                className="h-[34px]"
              >
                {t("Add")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-6">
              {tagsList.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 bg-[var(--primary)] border border-transparent text-[var(--primary-text)] rounded-lg text-[10px] font-bold flex items-center gap-1"
                >
                  <TagIcon className="w-2.5 h-2.5" />
                  {tag}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-red-200"
                    onClick={() => handleRemoveTag(field.name, tag)}
                  />
                </span>
              ))}
            </div>
          </div>
        );

      case "key-value":
        const rows: Array<{ key: string; value: string }> = Array.isArray(rawValue)
          ? rawValue
          : [];
        return (
          <div key={field.name} className={colClass}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="font-bold text-[var(--text)] text-xs">
                {t(field.label)}
              </label>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                icon={PlusCircle}
                onClick={() => handleAddKeyValueRow(field.name)}
              >
                {t("Add Row")}
              </Button>
            </div>
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full">
              {rows.map((row, idx) => (
                // One level line (Ahsan: "box uper nichy q hain —
                // brabaer karo boxes"): every element is the form's
                // standard input height (34px, matching the py-2 text
                // inputs) and the row centres them all on one axis,
                // with a single muted ":" centred between Key and Value.
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={t("Key / Attribute")}
                    value={row.key || ""}
                    onChange={(e) =>
                      handleKeyValueChange(field.name, idx, "key", e.target.value)
                    }
                    className="flex-1 min-w-0 h-[34px] px-2.5 bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--text)]"
                  />
                  <span
                    aria-hidden="true"
                    className="text-xs font-bold text-[var(--text-muted)] select-none leading-none"
                  >
                    :
                  </span>
                  <input
                    type="text"
                    placeholder={t("Value")}
                    value={row.value || ""}
                    onChange={(e) =>
                      handleKeyValueChange(field.name, idx, "value", e.target.value)
                    }
                    className="flex-1 min-w-0 h-[34px] px-2.5 bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--text)]"
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    type="button"
                    icon={Trash2}
                    onClick={() => handleRemoveKeyValueRow(field.name, idx)}
                    aria-label={t("Delete row")}
                    className="h-[34px] w-[34px] shrink-0"
                  />
                </div>
              ))}
              {rows.length === 0 && (
                <div className="text-[11px] text-[var(--text-muted)] italic py-1">
                  {t('No attributes defined yet. Click "Add Row" to add.')}
                </div>
              )}
            </div>
          </div>
        );

      case "image":
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={rawValue}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                placeholder={t("Image URL (https://...) or upload a file")}
                className="flex-1 px-3 py-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)]"
              />
              <label
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium cursor-pointer hover:border-[var(--primary)] transition-colors ${imageUpload.busy && imageUpload.field === field.name ? "opacity-50 pointer-events-none" : ""}`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {imageUpload.busy && imageUpload.field === field.name ? t("Uploading…") : t("Upload")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleImageChosen(field, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setPickerField(field.name)}
                className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium cursor-pointer hover:border-[var(--primary)] transition-colors"
              >
                <Images className="w-3.5 h-3.5" />
                {t("Select")}
              </button>
              {rawValue && (
                <span className="relative shrink-0">
                  <img
                    src={rawValue}
                    alt={t("Preview")}
                    loading="lazy"
                    decoding="async"
                    className="w-9 h-9 rounded-lg object-cover border border-[var(--border)]"
                    onError={(e) => ((e.target as HTMLElement).style.display = "none")}
                  />
                  <button
                    type="button"
                    title={t("Set image")}
                    aria-label={t("Set image")}
                    onClick={() =>
                      setCropTarget({
                        field: field.name,
                        url: String(rawValue),
                        fromPicker: false,
                      })
                    }
                    className="absolute -bottom-1.5 -right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--surface)] bg-[var(--primary)] text-white shadow transition-transform hover:scale-110 cursor-pointer"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
            </div>
            {imageUpload.field === field.name && imageUpload.error && (
              <p className="mt-1 text-[11px] text-red-500">{imageUpload.error}</p>
            )}
          </div>
        );

      case "media-gallery":
        const gallery: GalleryImage[] = Array.isArray(rawValue) ? rawValue : [];
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <ProductMediaManager
              value={gallery}
              onChange={(imgs) => handleFieldChange(field.name, imgs)}
            />
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );

      case "order-items": {
        // Create Order's line editor: any number of product lines.
        // While editing, an order's items are fixed at creation, so
        // the lines render read-only (the update endpoint accepts
        // lifecycle/payment/shipping fields only).
        const itemLines = Array.isArray(rawValue) ? rawValue : [];
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <OrderItemsField
              value={itemLines}
              options={field.options || []}
              disabled={field.disabled || formMode === "edit"}
              onChange={(next) => handleFieldChange(field.name, next)}
            />
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );
      }

      case "coupon": {
        // Create Order only: a coupon is applied when the order is
        // placed (the server validates it again and counts the use) —
        // editing an existing order never re-opens coupon entry.
        if (formMode === "edit") return null;
        return (
          <div key={field.name} className={colClass}>
            <label className="font-bold text-[var(--text)] block mb-1 text-xs">
              {t(field.label)} {field.required && <span className="text-red-500">*</span>}
            </label>
            <CouponApplyField
              value={typeof rawValue === "string" ? rawValue : ""}
              applied={formData?.couponApplied === true}
              discount={formData?.couponDiscount}
              items={Array.isArray(formData?.items) ? formData.items : []}
              userId={formData?.user ? String(formData.user) : ""}
              onFieldChange={handleFieldChange}
            />
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );
      }

      case "shipping-quote": {
        // Create Order only: the live shipping quote for the chosen
        // lines + method + delivery option + city. Editing an order
        // never re-prices its shipping, so the field is create-only.
        if (formMode === "edit") return null;
        return (
          <div key={field.name} className={colClass}>
            <ShippingQuoteField
              items={Array.isArray(formData?.items) ? formData.items : []}
              methodId={formData?.shippingMethodId ? String(formData.shippingMethodId) : ""}
              deliveryOptionId={formData?.deliveryOptionId ? String(formData.deliveryOptionId) : ""}
              city={formData?.shippingCity ? String(formData.shippingCity) : ""}
              couponDiscount={
                formData?.couponApplied === true ? Number(formData?.couponDiscount) || 0 : 0
              }
            />
          </div>
        );
      }

      case "shopping-profile": {
        // The customer form's Shopping Profile section: this field's
        // value is the favorite-category id list (max 3, enforced in
        // the component and again on the backend); the component also
        // shows the stored favorites / liked / cart read-only.
        const categoryIds: string[] = Array.isArray(rawValue)
          ? rawValue.map(String)
          : [];
        return (
          <div key={field.name} className={colClass}>
            <CustomerShoppingProfile
              customerId={
                formData?._id ? String(formData._id) : undefined
              }
              value={categoryIds}
              onChange={(ids) => handleFieldChange(field.name, ids)}
            />
            {field.helperText && (
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                {t(field.helperText)}
              </span>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) {
          onClose();
        }
        backdropPressRef.current = false;
      }}
    >
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col border border-[var(--border)]">
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[var(--surface-muted)] shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-[var(--text)] text-base">
              {formMode === "add"
                ? t("Add New {item}").replace("{item}", t(itemTypeLabel))
                : t("Edit {item} Details").replace("{item}", t(itemTypeLabel))}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {t("Configure parameters, status, and attributes for this {item}.").replace("{item}", t(itemTypeLabel).toLowerCase())}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={onClose}
            aria-label={t("Close modal")}
            className="close-x"
          />
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 shrink-0">
             <span className="font-semibold text-red-500 text-sm">{t("Error:")}</span>
             <span>{error}</span>
          </div>
        )}

        {/* MODAL DYNAMIC FORM BODY */}
        <form
          id="itemFormModal"
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-6 overflow-y-auto flex flex-col flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-[var(--surface-muted)] [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full"
        >
          {groupedSections.length > 0 ? (
            groupedSections.map((section) => (
              <div key={section.title} className="space-y-3">
                <h4 className="font-bold border-b border-[var(--border)] pb-1.5 uppercase tracking-wider text-[10px] text-[var(--primary)]">
                  {t(section.title)}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {section.fields.map(renderField)}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-xs text-[var(--text-muted)]">
              {t("No form fields configured for this page.")}
            </div>
          )}
        </form>

        {/* MODAL ACTIONS */}
        <div className="p-3 sm:p-4 border-t border-[var(--border)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 bg-[var(--surface-muted)] shrink-0">
          <Button variant="outline" size="md" type="button" onClick={onClose}>
            {t("Cancel")}
          </Button>

          <Button type="submit" form="itemFormModal" variant="primary" size="md" disabled={isSubmitting}>
            {formMode === "add" ? t("Create {item}").replace("{item}", t(itemTypeLabel)) : t("Save Changes")}
          </Button>
        </div>
      </div>

      {/* Media library picker for image fields (the Select button) —
          same single-pick flow as Settings → Logo/Favicon. */}
      <MediaPickerModal
        isOpen={pickerField !== null}
        single
        existing={[]}
        maxTotal={1}
        onClose={() => setPickerField(null)}
        onConfirm={(picked) => {
          const url = picked[0]?.url;
          if (url && pickerField) handleFieldChange(pickerField, url);
          setPickerField(null);
        }}
        onEditSelected={(item) => {
          if (pickerField && item.url) {
            setCropTarget({
              field: pickerField,
              url: item.url,
              fromPicker: true,
              name: item.originalName || item.filename || undefined,
            });
          }
        }}
      />

      {/* Single-date calendar popup for date fields (coupon Valid
          From / Valid Until) — the house DatePicker; only its Apply
          commits the ISO day string to the field. */}
      <DatePicker
        open={dateField !== null}
        value={dateField ? dateFieldIso(dateField) : null}
        title={
          dateField
            ? t(fields.find((f) => f.name === dateField)?.label || "Date")
            : undefined
        }
        onApply={(iso) => {
          if (dateField) handleFieldChange(dateField, iso);
          setDateField(null);
        }}
        onClose={() => setDateField(null)}
      />

      {/* "Set image" cropper — opened from a field's pencil or from the
          picker's Edit action. Applying uploads the cropped square and
          puts its URL in the field (from the picker it also confirms
          the cropped image as the pick and closes the picker). */}
      <ImageCropper
        isOpen={cropTarget !== null}
        imageUrl={cropTarget?.url ?? null}
        sourceName={cropTarget?.name}
        uploadPurpose={
          cropTarget
            ? fields.find((f) => f.name === cropTarget.field)?.uploadPurpose
            : undefined
        }
        onClose={() => setCropTarget(null)}
        onApply={({ url }) => {
          if (cropTarget) {
            handleFieldChange(cropTarget.field, url);
            if (cropTarget.fromPicker) setPickerField(null);
          }
          setCropTarget(null);
        }}
      />
    </div>
  );
};

export default FormModal;