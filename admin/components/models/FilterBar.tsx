"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import SearchBar, { SearchableEntityRecord } from "@/components/ui/SearchBar";
import Select, {
  SelectOption,
  SelectVariant,
  SelectSize,
  DropdownDirection,
} from "@/components/ui/Select";
import DateRangePicker, {
  DateRange,
  formatRangeDayShort,
} from "@/components/ui/DateRangePicker";
import { useLanguage } from "@/services/i18n";
import {
  dayKeyInStoreTz,
  presetRangeInStoreTz,
  useStoreTimeZone,
} from "@/services/storeTime";

export interface FilterConfigItem {
  id: string;
  placeholder?: string;
  icon?: React.ElementType;
  options: SelectOption[];
  variant?: SelectVariant;
  size?: SelectSize;
  direction?: DropdownDirection;
  /**
   * Optional bucket mapper for range/derived filters (stock level,
   * price band, media file type): returns the bucket string a record
   * belongs to, compared against the selected option value. Without
   * it, the record's own `id` field is compared as a string.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchValue?: (item: any) => string;
}

/** The bar's current criteria, reported for the Data Export flow:
 * the server re-applies exactly this search + filters + date range. */
export interface FilterCriteria {
  search: string;
  filters: Record<string, string>;
  dateRange: DateRange | null;
}

export interface FilterBarProps<TSearchData extends SearchableEntityRecord> {
  // Raw Data source
  sourceData: TSearchData[];

  // Search Props
  searchableFieldsKeys: (keyof TSearchData)[];
  searchPlaceholder?: string;
  searchVariant?: "primary" | "secondary" | "outline" | "ghost";
  searchSize?: "sm" | "md" | "lg";
  showShortcut?: boolean;

  // Filter Props
  filtersData: FilterConfigItem[];

  /**
   * By-Date filter (Ahsan's order): the record field the date range
   * tests. Every list record carries `createdAt` — on Orders that IS
   * the order/placed date (its detail panel labels it "Order Date"),
   * on Media the upload date — so the default fits every page.
   */
  dateField?: string;

  // Consolidated Emission Callback
  onDataChange: (filteredData: TSearchData[]) => void;

  /** Optional: reports the current search + filter + date criteria
   * whenever any of them changes (Data Export mirrors them server-side). */
  onCriteriaChange?: (criteria: FilterCriteria) => void;

  /**
   * The Clear button itself lives in the page header row (Ahsan's
   * order: "har page me clear btn uper ly jao") — the header renders
   * the button, FilterBar exposes the two ends of the wire: it reports
   * whether clearing is currently meaningful (any search/filter
   * applied) through `onClearActiveChange`, and it performs the reset
   * when `clearSignal` increments.
   */
  clearSignal?: number;
  onClearActiveChange?: (active: boolean) => void;

  /**
   * One-shot search hand-off (notification click-through): when the
   * nonce changes, the term is applied to the search box as if typed,
   * so it is visible and drives the same filtering.
   */
  searchHandoff?: { term: string; nonce: number } | null;
}

export const FilterBar = <TSearchData extends SearchableEntityRecord>({
  sourceData,
  searchableFieldsKeys,
  searchPlaceholder = "Search...",
  searchVariant = "secondary",
  searchSize = "md",
  showShortcut = true,
  filtersData,
  dateField = "createdAt",
  onDataChange,
  onCriteriaChange,
  clearSignal = 0,
  onClearActiveChange,
  searchHandoff = null,
}: FilterBarProps<TSearchData>) => {
  const { t } = useLanguage();
  // The store timezone drives every day computation below (preset
  // windows and record days alike): the server resolves the same
  // days in the store timezone for the dashboard and the export, so
  // the panel must too — a browser in another timezone otherwise
  // filters a different set of days than the export of the same
  // list. Subscribing re-runs the pipeline when the zone lands.
  const storeTz = useStoreTimeZone();

  // Internal State
  const [searchedData, setSearchedData] = useState<TSearchData[]>(sourceData);
  // The raw search text (SearchBar owns it; reported here so the
  // export criteria can carry it to the server).
  const [searchQuery, setSearchQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(
    () => {
      const initial: Record<string, string> = {};
      filtersData.forEach((f) => (initial[f.id] = "all"));
      return initial;
    },
  );
  // By-Date filter state (Ahsan's order: presets in a dropdown —
  // All Dates · Last 7 Days · Last 30 Days · Last 90 Days · Custom).
  // `datePreset` is the dropdown's selection; `dateRange` is the
  // effective range the pipeline below tests — a preset computes it
  // on selection, Custom takes it from the shared DateRangePicker.
  // Null range = all dates.
  const [datePreset, setDatePreset] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // "Last N Days" = the store's today − (N−1) days through the
  // store's today, inclusive — store-timezone days, the same days
  // the pipeline below compares records against.
  const presetRange = (days: number): DateRange => presetRangeInStoreTz(days);

  // When the store timezone lands after a preset was already picked,
  // recompute that preset's window in store days (it was computed on
  // the browser's day, which can be a day off). Custom ranges are the
  // picker's own day keys and are left alone.
  useEffect(() => {
    if (!storeTz) return;
    if (datePreset !== "all" && datePreset !== "custom") {
      setDateRange(presetRangeInStoreTz(Number(datePreset)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeTz]);

  // Date dropdown change: a preset applies immediately; "All Dates"
  // clears the range; "Custom" never switches by itself — it opens
  // the shared DateRangePicker (starting from the currently applied
  // range) and only its Apply commits, exactly like the Dashboard's
  // Revenue range control.
  const handleDatePresetChange = (value: string) => {
    if (value === "custom") {
      setDatePickerOpen(true);
      return;
    }
    if (value === "all") {
      setDatePreset("all");
      setDateRange(null);
      return;
    }
    setDatePreset(value);
    setDateRange(presetRange(Number(value)));
  };

  // Source data change sync
  useEffect(() => {
    setSearchedData(sourceData);
  }, [sourceData]);

  // Report the current criteria (search + dropdowns + date range)
  // whenever any part of it changes — Data Export re-applies the
  // same criteria server-side.
  useEffect(() => {
    onCriteriaChange?.({
      search: searchQuery,
      filters: filterValues,
      dateRange,
    });
  }, [searchQuery, filterValues, dateRange, onCriteriaChange]);

  // Handle single dropdown change
  const handleFilterChange = (filterId: string, selectedValue: string) => {
    setFilterValues((prev) => ({
      ...prev,
      [filterId]: selectedValue,
    }));
  };

  // Handle Clear All (triggered from the header's Clear button through
  // the clearSignal wire below — same reset as the old in-bar button).
  const handleClearFilters = useCallback(() => {
    const resetValues: Record<string, string> = {};
    filtersData.forEach((f) => (resetValues[f.id] = "all"));
    setFilterValues(resetValues);
    setSearchedData(sourceData);
    // The date selection is part of the same reset: the control
    // returns to "All Dates" (preset and range cleared) with
    // everything else.
    setDatePreset("all");
    setDateRange(null);
  }, [filtersData, sourceData]);

  // Main Combined Filter Logic
  useEffect(() => {
    let result = searchedData;
    const configById = new Map(filtersData.map((f) => [f.id, f]));

    // Apply Active Dropdown Filters
    Object.keys(filterValues).forEach((key) => {
      const selectedVal = filterValues[key];
      if (selectedVal && selectedVal !== "all") {
        const config = configById.get(key);
        result = result.filter((item) =>
          config?.matchValue
            ? config.matchValue(item) === selectedVal
            : String(item[key]) === selectedVal,
        );
      }
    });

    // Apply the By-Date range: the record's own date must fall
    // inside [from, to] inclusive. Days compare as ISO day strings
    // in the STORE's timezone — the canonical day the server uses
    // for the same range in the export and the dashboard — so the
    // list and its export always contain the same records. A record
    // with no readable date cannot be inside a range, so it drops
    // out while a range is applied.
    if (dateRange) {
      result = result.filter((item) => {
        const raw = (item as Record<string, unknown>)[dateField];
        if (raw == null) return false;
        const d = raw instanceof Date ? raw : new Date(String(raw));
        if (Number.isNaN(d.getTime())) return false;
        const day = dayKeyInStoreTz(d);
        return day >= dateRange.from && day <= dateRange.to;
      });
    }

    // Emit Final Filtered Result to Parent
    onDataChange(result);
    // storeTz is a dependency so the pipeline re-runs when the store
    // timezone lands after sign-in (the day keys can shift by one).
  }, [searchedData, filterValues, filtersData, dateRange, dateField, onDataChange, storeTz]);

  // Active Checks
  const isDropdownFilterActive = Object.values(filterValues).some(
    (value) => value && value !== "all",
  );
  const isSearchActive = searchedData.length !== sourceData.length;

  // Clear button is active only when search or filter is applied —
  // an applied date range counts, so the header Clear lights up for
  // it and resets it like everything else.
  const isClearActive =
    isDropdownFilterActive || isSearchActive || dateRange !== null;

  // Report clear availability to the page header (on mount and on every
  // change) so its Clear button enables/disables in step with this bar.
  useEffect(() => {
    onClearActiveChange?.(isClearActive);
  }, [isClearActive, onClearActiveChange]);

  // Perform the reset when the header button bumps the signal. The ref
  // keeps the mount render (and re-renders where only the handler's
  // identity changed) from clearing on their own.
  const lastClearSignalRef = useRef(clearSignal);
  useEffect(() => {
    if (lastClearSignalRef.current === clearSignal) return;
    lastClearSignalRef.current = clearSignal;
    handleClearFilters();
  }, [clearSignal, handleClearFilters]);

  return (
    <div className="flex flex-wrap items-center flex-col md:flex-row gap-3 w-full md:w-auto bg-[var(--surface)] text-[var(--text)]">
      {/* Dynamic Search Bar */}
      <SearchBar<TSearchData>
        className="w-full min-w-0 max-w-full md:min-w-40 md:max-w-76 lg:max-w-84 border-[var(--border)]"
        searchSourceData={sourceData}
        searchableFieldsKeys={searchableFieldsKeys}
        onSearchResultsUpdate={setSearchedData}
        onQueryChange={setSearchQuery}
        searchPlaceholder={t(searchPlaceholder)}
        searchVariant={searchVariant}
        searchSize={searchSize}
        showShortcut={showShortcut}
        handoffTerm={searchHandoff?.term}
        handoffNonce={searchHandoff?.nonce}
      />

      {/* Mapped Select Filters */}
      <div className="flex flex-row md:ml-auto w-full md:w-fit flex-wrap gap-3">
        {filtersData.map((item) => (
          <Select
            key={item.id}
            fullWidth={true}
            menuWide={true}
            className="flex-1 border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
            value={filterValues[item.id] || "all"}
            options={item.options.map((option) => ({
              ...option,
              label: t(option.label),
            }))}
            onChange={(selectedValue) =>
              handleFilterChange(item.id, selectedValue)
            }
            placeholder={item.placeholder ? t(item.placeholder) : item.placeholder}
            variant={item.variant || "primary"}
            size={item.size || "md"}
            direction={item.direction || "bottom"}
          />
        ))}
        {/* By-Date filter (Ahsan's order): a dropdown in the same
            group and the same dress as the other filters — the house
            Select, primary, size md — with presets All Dates ·
            Last 7 Days · Last 30 Days · Last 90 Days · Custom. A
            preset applies at once; Custom opens the SHARED
            DateRangePicker popup, the very component the Dashboard's
            Revenue Analytics Custom period uses (not a fork). The
            trigger shows the preset's name while one is active, the
            applied custom range in the component's short format
            (via triggerLabel, like the dashboard trigger), and
            "All Dates" when nothing is applied. */}
        <Select
          fullWidth={true}
          menuWide={true}
          className="flex-1 border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
          data-testid="date-filter-trigger"
          value={datePreset}
          options={[
            { label: t("All Dates"), value: "all" },
            { label: t("Last 7 Days"), value: "7" },
            { label: t("Last 30 Days"), value: "30" },
            { label: t("Last 90 Days"), value: "90" },
            { label: t("Custom"), value: "custom" },
          ]}
          onChange={handleDatePresetChange}
          variant="primary"
          size="md"
          direction="bottom"
          triggerLabel={
            datePreset === "custom" && dateRange
              ? `${formatRangeDayShort(dateRange.from)} – ${formatRangeDayShort(dateRange.to)}`
              : undefined
          }
        />

        {/* The Clear button moved up into the page header row — this
            row now ends with the last dropdown, nothing in its place. */}
      </div>

      <DateRangePicker
        open={datePickerOpen}
        value={dateRange}
        onApply={(range) => {
          // Applying in the picker commits a CUSTOM range: the
          // dropdown selection switches to "custom" and the trigger
          // shows the range itself (see triggerLabel above).
          setDateRange(range);
          setDatePreset("custom");
          setDatePickerOpen(false);
        }}
        onClose={() => setDatePickerOpen(false)}
      />
    </div>
  );
};

export default FilterBar;