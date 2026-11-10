import { describe, expect, it } from "vitest";
import {
  locations,
  locationCounts,
  isValidLocationDataset,
  makeInitialState,
  MAX_RATE_GROUPS,
  parseSlabs,
  removeCustomArea,
  rateForWeight,
  validateState,
  validateRateGroup,
  type RateGroup,
} from "@/lib/sholok";

describe("Sholok location catalog", () => {
  it("ships the eight divisions in the requested order with 64 districts and 763 areas", () => {
    expect(locationCounts()).toEqual({ divisions: 8, districts: 64, areas: 763 });
    expect(locations.map((division) => division.name)).toEqual([
      "Dhaka", "Chattogram", "Rajshahi", "Khulna", "Barishal", "Sylhet", "Rangpur", "Mymensingh",
    ]);
    expect(isValidLocationDataset()).toBe(true);
  });
});

describe("Sholok rate-group rules", () => {
  const group = { store: "Dhaka", name: "Inside Dhaka", base: 60, additional: 20, slabs: {} };

  it("calculates 1, 2, 3, 4, and 5 KG using the requested formula", () => {
    const rateGroup: RateGroup = { id: "g1", ...group };
    expect([1, 2, 3, 4, 5].map((weight) => rateForWeight(rateGroup, weight))).toEqual([60, 80, 100, 120, 140]);
  });

  it("lets a matching configured weight slab override the formula", () => {
    const rateGroup: RateGroup = { id: "g1", ...group, slabs: parseSlabs("1:60, 2:80, 3:100, 5:140") };
    expect(rateForWeight(rateGroup, 5)).toBe(140);
    expect(rateForWeight(rateGroup, 4)).toBe(120);
  });

  it("rejects duplicate weights, malformed slabs, and non-positive slab values", () => {
    expect(() => parseSlabs("1:60, 1:75")).toThrow("Duplicate weight slabs");
    expect(() => parseSlabs("one:60")).toThrow("weight:rate");
    expect(() => parseSlabs("1:0")).toThrow("greater than zero");
  });

  it("keeps rate groups empty initially and enforces the 17-group maximum", () => {
    expect(Object.keys(makeInitialState().groups)).toHaveLength(0);
    const groups: RateGroup[] = Array.from({ length: MAX_RATE_GROUPS }, (_, index) => ({
      id: `g${index}`,
      store: "Dhaka",
      name: `Group ${index}`,
      base: 60,
      additional: 20,
      slabs: {},
    }));
    expect(() => validateRateGroup({ store: "Dhaka", name: "One more", base: 60, additional: 20, slabs: {} }, groups)).toThrow("maximum of 17");
  });

  it("rejects duplicate group names at the same store after normalization", () => {
    const groups: RateGroup[] = [{ id: "g1", store: "Dhaka", name: "Inside Dhaka", base: 60, additional: 20, slabs: {} }];
    expect(() => validateRateGroup({ store: "dhaka", name: "  INSIDE   DHAKA ", base: 65, additional: 25, slabs: {} }, groups)).toThrow("already exists");
  });
});

describe("Sholok custom-area removal", () => {
  it("cleans area status, assignments, and unused custom districts from saved data", () => {
    const area = { id: "custom-1", division: "Dhaka", district: "New District", area: "New Area", source: "custom" as const };
    const group: RateGroup = { id: "group-1", store: "Dhaka", name: "Dhaka rates", base: 60, additional: 20, slabs: {} };
    const initial = makeInitialState();
    const state = {
      ...initial,
      groups: { [group.id]: group },
      customAreas: [area],
      customDistricts: [{ id: "district-1", division: "Dhaka", name: "New District" }],
      assignments: { "Dhaka||custom-1": { key: "Dhaka||custom-1", store: "Dhaka", areaId: area.id, division: area.division, district: area.district, area: area.area, groupId: group.id } },
      statuses: { [area.id]: false },
    };

    const result = removeCustomArea(state, area.id);

    expect(result.statuses).not.toHaveProperty(area.id);
    expect(result.assignments).toEqual({});
    expect(result.customDistricts).toEqual([]);
    expect(() => validateState({ version: 1, data: result })).not.toThrow();
  });
});