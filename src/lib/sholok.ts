import locationData from "@/data/locations.json";

export const DIVISION_ORDER = [
  "Dhaka",
  "Chattogram",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
] as const;

const DISTRICT_ORDER: Record<string, string[]> = {
  Dhaka: ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
  Chattogram: ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cumilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
  Rajshahi: ["Bogura", "Joypurhat", "Naogaon", "Natore", "Chapainawabganj", "Pabna", "Rajshahi", "Sirajganj"],
  Khulna: ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  Barishal: ["Barguna", "Barishal", "Bhola", "Jhalokathi", "Patuakhali", "Pirojpur"],
  Sylhet: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
  Rangpur: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
};

export const MAX_RATE_GROUPS = 17;
export const STORAGE_KEY = "sholok.delivery-management.v1";
export const DATA_VERSION = "bangladesh-locations-763-v1";

export interface LocationDivision {
  name: string;
  districts: { name: string; upazilas: { name: string }[] }[];
}

export interface DeliveryArea {
  id: string;
  division: string;
  district: string;
  area: string;
  source: "built-in" | "custom";
}

export interface RateGroup {
  id: string;
  store: string;
  name: string;
  base: number;
  additional: number;
  slabs: Record<string, number>;
}

export interface Assignment {
  key: string;
  store: string;
  areaId: string;
  division: string;
  district: string;
  area: string;
  groupId: string;
  rateOverride?: { base: number; rate2kg: number; rate3kg: number };
}

export interface SholokState {
  groups: Record<string, RateGroup>;
  customAreas: DeliveryArea[];
  customDistricts: { id: string; division: string; name: string }[];
  assignments: Record<string, Assignment>;
  statuses: Record<string, boolean>;
  areaOverrides: Record<string, DeliveryArea>;
  districtRenames: Record<string, string>;
}

export const locations = (locationData as LocationDivision[])
  .slice()
  .sort((a, b) => DIVISION_ORDER.indexOf(a.name as (typeof DIVISION_ORDER)[number]) - DIVISION_ORDER.indexOf(b.name as (typeof DIVISION_ORDER)[number]))
  .map((division) => {
    const order = DISTRICT_ORDER[division.name] ?? [];
    const rank = new Map(order.map((name, index) => [normalize(name), index]));
    return {
      ...division,
      districts: division.districts.slice().sort((a, b) => {
        const aRank = rank.get(normalize(a.name));
        const bRank = rank.get(normalize(b.name));
        if (aRank === undefined && bRank === undefined) return 0;
        if (aRank === undefined) return 1;
        if (bRank === undefined) return -1;
        return aRank - bRank;
      }),
    };
  });

export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function districtKey(division: string, district: string): string {
  return `${normalize(division)}||${normalize(district)}`;
}

export function makeInitialState(): SholokState {
  return {
    groups: {},
    customAreas: [],
    customDistricts: [],
    assignments: {},
    statuses: {},
    areaOverrides: {},
    districtRenames: {},
  };
}

export function isValidLocationDataset(data: LocationDivision[] = locations): boolean {
  return (
    data.length === 8 &&
    data.map((division) => division.name).every((name, index) => name === DIVISION_ORDER[index]) &&
    data.reduce((sum, division) => sum + division.districts.length, 0) === 64 &&
    data.reduce(
      (sum, division) =>
        sum + division.districts.reduce((districtSum, district) => districtSum + district.upazilas.length, 0),
      0,
    ) === 763
  );
}

export function safeReadState(storage: Pick<Storage, "getItem"> | undefined): SholokState {
  if (!storage) return makeInitialState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialState();
    const parsed: unknown = JSON.parse(raw);
    return validateState(parsed);
  } catch {
    return makeInitialState();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateState(value: unknown): SholokState {
  if (!isRecord(value) || value["version"] !== 1 || !isRecord(value["data"])) {
    throw new Error("Unsupported backup format.");
  }
  const data = value["data"];
  if (
    !isRecord(data["groups"]) ||
    !Array.isArray(data["customAreas"]) ||
    !Array.isArray(data["customDistricts"]) ||
    !isRecord(data["assignments"]) ||
    !isRecord(data["statuses"]) ||
    !isRecord(data["areaOverrides"]) ||
    !isRecord(data["districtRenames"])
  ) {
    throw new Error("The backup is missing required data.");
  }
  const state = data as unknown as SholokState;
  const areas = allAreas(state);
  const areaIds = new Set(areas.map((area) => area.id));
  const groupIds = new Set(Object.keys(state.groups));
  for (const group of Object.values(state.groups)) {
    if (!group.id || !DIVISION_ORDER.includes(group.store as (typeof DIVISION_ORDER)[number]) || !group.name || group.base <= 0 || group.additional <= 0) {
      throw new Error("The backup contains an invalid rate group.");
    }
  }
  if (Object.keys(state.groups).length > MAX_RATE_GROUPS) throw new Error("The backup exceeds the 17 rate-group limit.");
  for (const assignment of Object.values(state.assignments)) {
    if (!areaIds.has(assignment.areaId) || !groupIds.has(assignment.groupId)) {
      throw new Error("The backup contains an assignment with a missing area or rate group.");
    }
    if (state.groups[assignment.groupId]?.store !== assignment.store) {
      throw new Error("The backup contains an assignment with a mismatched store and rate group.");
    }
  }
  return state;
}

export function serializeBackup(state: SholokState, timestamp = new Date().toISOString()): string {
  return JSON.stringify({ version: 1, dataset: DATA_VERSION, timestamp, data: state }, null, 2);
}

export function allAreas(state: SholokState): DeliveryArea[] {
  const builtIn = locations.flatMap((division) =>
    division.districts.flatMap((district) =>
      district.upazilas.map((entry) => {
        const id = `D-${division.name}-${district.name}-${entry.name}`;
        return (
          state.areaOverrides[id] ?? {
            id,
            division: division.name,
            district: state.districtRenames[districtKey(division.name, district.name)] ?? district.name,
            area: entry.name,
            source: "built-in" as const,
          }
        );
      }),
    ),
  );
  return [...builtIn, ...state.customAreas];
}

export function countDistricts(state: SholokState): number {
  return 64 + state.customDistricts.length;
}

export function statusFor(state: SholokState, areaId: string): boolean {
  return state.statuses[areaId] !== false;
}

export function validAssignments(state: SholokState): Assignment[] {
  const areaIds = new Set(allAreas(state).map((area) => area.id));
  return Object.values(state.assignments).filter((assignment) => {
    const group = state.groups[assignment.groupId];
    return Boolean(group && group.store === assignment.store && areaIds.has(assignment.areaId));
  });
}

export function rateForWeight(group: RateGroup | undefined, weight: number): number {
  if (!group) return 0;
  const slab = group.slabs[String(weight)];
  return slab ?? group.base + Math.max(0, weight - 1) * group.additional;
}

export function assignmentRate(assignment: Assignment, group: RateGroup | undefined, weight: number): number {
  if (weight === 1 && assignment.rateOverride) return assignment.rateOverride.base;
  if (weight === 2 && assignment.rateOverride) return assignment.rateOverride.rate2kg;
  if (weight === 3 && assignment.rateOverride) return assignment.rateOverride.rate3kg;
  return rateForWeight(group, weight);
}

export function parseSlabs(input: string): Record<string, number> {
  const slabs: Record<string, number> = {};
  if (!input.trim()) return slabs;
  for (const part of input.split(",")) {
    const match = part.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!match) throw new Error("Use weight:rate pairs, such as 1:60, 2:80.");
    const [, rawWeight, rawRate] = match;
    const weight = Number(rawWeight);
    const rate = Number(rawRate);
    const key = String(weight);
    if (weight <= 0 || rate <= 0 || !Number.isFinite(weight) || !Number.isFinite(rate)) {
      throw new Error("Weight and slab rate must be greater than zero.");
    }
    if (Object.hasOwn(slabs, key)) throw new Error("Duplicate weight slabs are not allowed.");
    slabs[key] = rate;
  }
  return slabs;
}

export function slabText(slabs: Record<string, number>): string {
  return Object.entries(slabs)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([weight, rate]) => `${weight}:${rate}`)
    .join(", ");
}

export function validateRateGroup(
  group: Omit<RateGroup, "id">,
  existing: RateGroup[],
  currentId?: string,
): void {
  if (!group.name.trim() || !group.store) throw new Error("Rate Group name and Store Location are required.");
  if (group.base <= 0 || group.additional <= 0 || !Number.isFinite(group.base) || !Number.isFinite(group.additional)) {
    throw new Error("Base Rate and Additional Per KG must be greater than zero.");
  }
  if (existing.length >= MAX_RATE_GROUPS && !currentId) throw new Error("A maximum of 17 Rate Groups is allowed.");
  if (
    existing.some(
      (item) => item.id !== currentId && normalize(item.store) === normalize(group.store) && normalize(item.name) === normalize(group.name),
    )
  ) {
    throw new Error("A Rate Group with this name already exists at this Store Location.");
  }
}

export function locationCounts(data: LocationDivision[] = locations) {
  return {
    divisions: data.length,
    districts: data.reduce((sum, division) => sum + division.districts.length, 0),
    areas: data.reduce(
      (sum, division) => sum + division.districts.reduce((districtSum, district) => districtSum + district.upazilas.length, 0),
      0,
    ),
  };
}