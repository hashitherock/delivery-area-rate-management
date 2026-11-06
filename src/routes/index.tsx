import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Download,
  FileUp,
  LayoutDashboard,
  MapPin,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  allAreas,
  assignmentRate,
  countDistricts,
  districtKey,
  isValidLocationDataset,
  locations,
  makeInitialState,
  MAX_RATE_GROUPS,
  normalize,
  parseSlabs,
  rateForWeight,
  serializeBackup,
  slabText,
  statusFor,
  STORAGE_KEY,
  validateRateGroup,
  validateState,
  validAssignments,
  type Assignment,
  type DeliveryArea,
  type RateGroup,
  type SholokState,
} from "@/lib/sholok";

type Section = "dashboard" | "areas" | "groups" | "assign" | "rates" | "backup";
type SortableArea = "division" | "district" | "area" | "status" | "assignments";
type SortableAssignment = "store" | "group" | "division" | "district" | "area" | "base";
type SortState<T extends string> = { key: T; direction: 1 | -1 };
type ModalState =
  | { type: "area"; area?: DeliveryArea }
  | { type: "group"; group?: RateGroup }
  | { type: "district"; division: string; district: string }
  | { type: "override"; assignment: Assignment }
  | { type: "switch"; assignment: Assignment }
  | null;

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const NAV_ITEMS: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "areas", label: "Delivery Areas", icon: MapPin },
  { id: "groups", label: "Rate Groups", icon: Activity },
  { id: "assign", label: "Delivery Area Assignment", icon: Truck },
  { id: "rates", label: "Assigned Zone Rates", icon: BarChart3 },
  { id: "backup", label: "Data Backup & Restore", icon: Archive },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sholok | Delivery Area & Rate Management" },
      { name: "description", content: "Manage Bangladesh delivery areas, rate groups, and zone assignments for Sholok." },
      { property: "og:title", content: "Sholok | Delivery Area & Rate Management" },
      { property: "og:description", content: "Bangladesh delivery area and rate management workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SholokApp,
});

function SholokApp() {
  const [state, setState] = useState<SholokState>(() => makeInitialState());
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [showUnassigned, setShowUnassigned] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState(validateState(JSON.parse(raw) as unknown));
    } catch {
      setStorageWarning("Saved browser data could not be validated. Your current saved copy is being left untouched; import a backup or reset only if you choose.");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || storageWarning) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: state }));
    } catch {
      toast.error("Your browser could not save this change. Export a backup and free some browser storage.");
    }
  }, [state, ready, storageWarning]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const target = (event as CustomEvent<Section>).detail;
      if (NAV_ITEMS.some((item) => item.id === target)) changeSection(target);
    };
    const handleGroupFilter = (event: Event) => {
      const groupId = (event as CustomEvent<string>).detail;
      setSection("rates");
      window.setTimeout(() => document.dispatchEvent(new CustomEvent("sholok:filter-group", { detail: groupId })), 30);
    };
    document.addEventListener("sholok:navigate", handleNavigate);
    document.addEventListener("sholok:group-view", handleGroupFilter);
    return () => {
      document.removeEventListener("sholok:navigate", handleNavigate);
      document.removeEventListener("sholok:group-view", handleGroupFilter);
    };
  }, []);

  const areas = useMemo(() => allAreas(state), [state]);
  const assignments = useMemo(() => validAssignments(state), [state]);
  const title = NAV_ITEMS.find((item) => item.id === section)?.label ?? "Dashboard";
  const changeSection = (next: Section) => {
    setSection(next);
    setMobileNavOpen(false);
    setShowUnassigned(false);
  };

  if (!isValidLocationDataset()) {
    return <main className="fatal-state">The bundled Bangladesh location list did not pass its 8 / 64 / 763 integrity check.</main>;
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed"}`}>
      <Toaster position="bottom-right" />
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">S</div>
          <div className="brand-copy"><strong>SHOLOK</strong><span>Delivery operations</span></div>
          <Button className="sidebar-collapse" variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={() => setSidebarOpen((value) => !value)}>
            <ChevronsUpDown />
          </Button>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <Button key={id} variant="ghost" className={`nav-item ${section === id ? "active" : ""}`} onClick={() => changeSection(id)} title={label}>
              <Icon /><span>{label}</span>{id === "rates" && assignments.length > 0 ? <span className="nav-count">{assignments.length}</span> : null}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-data"><div className="status-dot" /> <span>Local workspace</span></div>
          <small>8 divisions · {countDistricts(state)} districts · {areas.length.toLocaleString()} areas</small>
        </div>
      </aside>
      {mobileNavOpen ? <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}

      <main className="main-shell">
        <header className="topbar">
          <div className="heading-group">
            <Button className="mobile-menu" variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu /></Button>
            <div>
              <div className="breadcrumb"><span>Operations</span><ChevronRight /><strong>{title}</strong></div>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="topbar-meta"><span className="local-badge"><ShieldCheck /> Data stored in this browser</span><span className="avatar-mark">S</span></div>
        </header>

        <div className="page-content">
          {storageWarning ? <div className="storage-warning" role="alert"><ShieldCheck /><span><strong>Saved data was protected.</strong><small>{storageWarning}</small></span><Button variant="outline" size="sm" onClick={() => setSection("backup")}>Backup & restore</Button></div> : null}
          {section === "dashboard" ? <Dashboard state={state} areas={areas} assignments={assignments} onReport={() => setShowUnassigned(true)} /> : null}
          {section === "areas" ? <AreasSection state={state} areas={areas} assignments={assignments} setState={setState} openModal={setModal} /> : null}
          {section === "groups" ? <GroupsSection state={state} assignments={assignments} setState={setState} openModal={setModal} onView={(group) => document.dispatchEvent(new CustomEvent("sholok:group-view", { detail: group.id }))} /> : null}
          {section === "assign" ? <AssignmentSection state={state} areas={areas} assignments={assignments} setState={setState} /> : null}
          {section === "rates" ? <RatesSection state={state} assignments={assignments} openModal={setModal} setState={setState} /> : null}
          {section === "backup" ? <BackupSection state={state} setState={setState} /> : null}
        </div>
        <footer className="app-footer"><span>SHOLOK · Delivery operations</span><span>Changes are stored in this browser only</span></footer>
      </main>

      {showUnassigned ? <UnassignedDialog areas={areas} assignments={assignments} state={state} onClose={() => setShowUnassigned(false)} /> : null}
      {modal ? <ModalHost modal={modal} state={state} areas={areas} assignments={assignments} setState={setState} close={() => setModal(null)} /> : null}
    </div>
  );
}

function Dashboard({ state, areas, assignments, onReport }: { state: SholokState; areas: DeliveryArea[]; assignments: Assignment[]; onReport: () => void }) {
  const assigned = new Set(assignments.map((assignment) => assignment.areaId));
  const enabled = areas.filter((area) => statusFor(state, area.id)).length;
  const coverage = areas.length ? (assigned.size / areas.length) * 100 : 0;
  const metrics = [
    { label: "Divisions", value: "08", note: "Bangladesh regions", icon: MapPin, color: "mint" },
    { label: "Districts", value: countDistricts(state).toLocaleString(), note: `${state.customDistricts.length} custom`, icon: Store, color: "blue" },
    { label: "Delivery areas", value: areas.length.toLocaleString(), note: `${enabled.toLocaleString()} enabled`, icon: Truck, color: "gold" },
    { label: "Rate groups", value: Object.keys(state.groups).length.toString(), note: `of ${MAX_RATE_GROUPS} available`, icon: Users, color: "rose" },
  ];
  const unassigned = areas.filter((area) => !assigned.has(area.id)).length;
  return <>
    <section className="welcome-band">
      <div><span className="eyebrow">DELIVERY OPERATIONS · BANGLADESH</span><h2>Good day. Let’s keep every route moving.</h2><p>Your area coverage and pricing controls, all in one place.</p></div>
      <div className="welcome-stamp"><span>DATASET VERIFIED</span><strong>08 / 64 / 763</strong><small>Divisions · districts · areas</small></div>
    </section>
    <section className="metric-grid" aria-label="Summary statistics">
      {metrics.map(({ label, value, note, icon: Icon, color }) => <article className="metric-card" key={label}><div className={`metric-icon ${color}`}><Icon /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div><span className="metric-mark">↗</span></article>)}
    </section>
    <section className="dashboard-grid">
      <article className="surface coverage-panel">
        <div className="section-heading"><div><span className="eyebrow">NETWORK HEALTH</span><h2>Assignment coverage</h2><p>Delivery areas with at least one active rate group.</p></div><div className="coverage-figure"><strong>{coverage.toFixed(1)}<small>%</small></strong><span>covered</span></div></div>
        <div className="progress-track"><div className="progress-value" style={{ width: `${Math.min(coverage, 100)}%` }} /></div>
        <div className="coverage-stats"><div><span className="legend-mark assigned" />Assigned<strong>{assigned.size.toLocaleString()}</strong></div><div><span className="legend-mark unassigned" />Unassigned<strong>{unassigned.toLocaleString()}</strong></div><div><span className="legend-mark enabled" />Enabled<strong>{enabled.toLocaleString()}</strong></div><div><span className="legend-mark disabled" />Disabled<strong>{(areas.length - enabled).toLocaleString()}</strong></div></div>
        <Button variant="outline" className="report-button" onClick={onReport}>View unassigned areas <ArrowRight /></Button>
      </article>
      <article className="surface quick-panel"><div className="section-heading"><div><span className="eyebrow">QUICK ACCESS</span><h2>Work faster</h2></div><Settings2 className="muted-icon" /></div>
        <QuickLink icon={MapPin} label="Manage delivery areas" detail="Update zones and availability" target="areas" />
        <QuickLink icon={Activity} label="Set up rate groups" detail="Create your store pricing rules" target="groups" />
        <QuickLink icon={Truck} label="Assign delivery zones" detail="Connect areas to a store rate" target="assign" />
        <div className="quick-note"><CircleHelp /><span>No rate groups are pre-created. Add your own before assigning zones.</span></div>
      </article>
    </section>
    <section className="surface district-overview"><div className="section-heading"><div><span className="eyebrow">NATIONAL FOOTPRINT</span><h2>Delivery areas by division</h2></div><span className="table-context">{areas.length.toLocaleString()} total zones</span></div>
      <div className="division-grid">{locations.map((division, index) => { const total = division.districts.reduce((sum, district) => sum + district.upazilas.length, 0); return <div className="division-item" key={division.name}><span className="division-index">0{index + 1}</span><span className="division-name">{division.name}</span><div className="division-meter"><i style={{ width: `${Math.max(6, total / 3.06)}%` }} /></div><strong>{total}</strong></div>; })}</div>
    </section>
  </>;
}

function QuickLink({ icon: Icon, label, detail, target }: { icon: typeof MapPin; label: string; detail: string; target: Section }) {
  return <Button variant="ghost" className="quick-link" onClick={() => document.dispatchEvent(new CustomEvent("sholok:navigate", { detail: target }))}><span className="quick-icon"><Icon /></span><span><b>{label}</b><small>{detail}</small></span><ArrowRight /></Button>;
}

function AreasSection({ state, areas, assignments, setState, openModal }: { state: SholokState; areas: DeliveryArea[]; assignments: Assignment[]; setState: React.Dispatch<React.SetStateAction<SholokState>>; openModal: (modal: ModalState) => void }) {
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("*");
  const [district, setDistrict] = useState("*");
  const [sort, setSort] = useState<SortState<SortableArea>>({ key: "division", direction: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<string[]>([]);
  const districtOptions = useDistrictChoices(state, division);
  const rows = useMemo(() => {
    const query = normalize(search);
    return areas.filter((area) => (!query || normalize(`${area.district} ${area.area} ${area.division}`).includes(query)) && (division === "*" || area.division === division) && (district === "*" || districtKey(area.division, area.district) === district));
  }, [areas, search, division, district]);
  const assignmentCount = (areaId: string) => assignments.filter((item) => item.areaId === areaId).length;
  const sorted = [...rows].sort((a, b) => {
    const av: string | number = sort.key === "status" ? Number(statusFor(state, a.id)) : sort.key === "assignments" ? assignmentCount(a.id) : String(a[sort.key] ?? "");
    const bv: string | number = sort.key === "status" ? Number(statusFor(state, b.id)) : sort.key === "assignments" ? assignmentCount(b.id) : String(b[sort.key] ?? "");
    return (typeof av === "number" ? av - Number(bv) : String(av).localeCompare(String(bv))) * sort.direction;
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const setStatus = (ids: string[], active: boolean) => setState((old) => ({ ...old, statuses: { ...old.statuses, ...Object.fromEntries(ids.map((id) => [id, active])) } }));
  const toggleSort = (key: SortableArea) => { setSort((old) => ({ key, direction: old.key === key ? (old.direction === 1 ? -1 : 1) : 1 })); setPage(1); };

  return <>
    <PageIntro eyebrow="GEOGRAPHIC CATALOG" title="Delivery areas" description="Manage the Bangladesh delivery hierarchy, custom zones, and area availability." action={<Button onClick={() => openModal({ type: "area" })}><Plus /> Add delivery area</Button>} />
    <div className="table-toolbar"><div className="search-field"><Search /><input aria-label="Search district or area" placeholder="Search district or area…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><select aria-label="Filter division" value={division} onChange={(event) => { setDivision(event.target.value); setDistrict("*"); setPage(1); }}><option value="*">All divisions</option>{locations.map((item) => <option key={item.name}>{item.name}</option>)}</select><select aria-label="Filter district" value={district} onChange={(event) => { setDistrict(event.target.value); setPage(1); }}><option value="*">All districts</option>{districtOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><Button variant="outline" onClick={() => downloadCsv("sholok_delivery_areas.csv", ["Division", "District", "Area", "Status", "Assignment Count"], areas.map((area) => [area.division, area.district, area.area, statusFor(state, area.id) ? "Enabled" : "Disabled", assignmentCount(area.id)]))}><Download /> Export CSV</Button></div>
    <div className="selection-toolbar"><div><b>{selected.length}</b> selected <span>· {rows.length.toLocaleString()} matching areas</span></div><div className="toolbar-actions"><Button variant="ghost" size="sm" onClick={() => setSelected(pageRows.map((area) => area.id))}>Select page</Button><Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button><Button variant="outline" size="sm" disabled={!selected.length} onClick={() => { setStatus(selected, true); toast.success(`${selected.length} areas enabled`); }}>Enable</Button><Button variant="outline" size="sm" disabled={!selected.length} onClick={() => { setStatus(selected, false); toast.success(`${selected.length} areas disabled`); }}>Disable</Button></div></div>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Select visible areas" checked={pageRows.length > 0 && pageRows.every((area) => selected.includes(area.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...pageRows.map((area) => area.id)])] : selected.filter((id) => !pageRows.some((area) => area.id === id)))} /></th>{(["division", "district", "area", "status", "assignments"] as SortableArea[]).map((key) => <th key={key}><button className="sort-button" onClick={() => toggleSort(key)}>{key === "area" ? "Delivery area" : key === "assignments" ? "Assignments" : key.charAt(0).toUpperCase() + key.slice(1)}<ArrowDownUp /></button></th>)}<th>Actions</th></tr></thead><tbody>
      {pageRows.map((area) => <tr key={area.id}><td><input type="checkbox" aria-label={`Select ${area.area}`} checked={selected.includes(area.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, area.id] : old.filter((id) => id !== area.id))} /></td><td>{area.division}</td><td><button className="text-action" onClick={() => openModal({ type: "district", division: area.division, district: area.district })}>{area.district}</button>{state.customDistricts.some((item) => normalize(item.name) === normalize(area.district) && normalize(item.division) === normalize(area.division)) ? <span className="soft-tag">Custom</span> : null}</td><td><strong className="area-name">{area.area}</strong>{area.source === "custom" ? <span className="soft-tag">Custom</span> : null}</td><td><span className={`status-label ${statusFor(state, area.id) ? "is-enabled" : "is-disabled"}`}><i />{statusFor(state, area.id) ? "Enabled" : "Disabled"}</span></td><td>{assignmentCount(area.id)} <span className="table-muted">assignments</span></td><td><div className="row-actions"><Button variant="ghost" size="icon" aria-label={`Edit ${area.area}`} title="Edit area" onClick={() => openModal({ type: "area", area })}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`${statusFor(state, area.id) ? "Disable" : "Enable"} ${area.area}`} title={statusFor(state, area.id) ? "Disable" : "Enable"} onClick={() => setStatus([area.id], !statusFor(state, area.id))}>{statusFor(state, area.id) ? <X /> : <Check />}</Button>{area.source === "custom" ? <Button variant="ghost" size="icon" aria-label={`Remove ${area.area}`} title="Remove custom area" onClick={() => { const count = assignmentCount(area.id); if (!window.confirm(`Remove ${area.area}? This will also remove ${count} related assignment(s).`)) return; setState((old) => { const customAreas = old.customAreas.filter((item) => item.id !== area.id); const usedDistricts = new Set(customAreas.map((item) => districtKey(item.division, item.district))); return { ...old, customAreas, customDistricts: old.customDistricts.filter((item) => usedDistricts.has(districtKey(item.division, item.name))), assignments: Object.fromEntries(Object.entries(old.assignments).filter(([, item]) => item.areaId !== area.id)) }; }); toast.success("Delivery area removed"); }}><Trash2 /></Button> : null}</div></td></tr>)}
      {!pageRows.length ? <tr><td className="empty-cell" colSpan={8}>No delivery areas match these filters.</td></tr> : null}
    </tbody></table></div>
    <Pagination page={page} pageCount={pageCount} total={sorted.length} pageSize={pageSize} setPage={setPage} setPageSize={(value) => { setPageSize(value); setPage(1); }} />
  </>;
}

function GroupsSection({ state, assignments, setState, openModal, onView }: { state: SholokState; assignments: Assignment[]; setState: React.Dispatch<React.SetStateAction<SholokState>>; openModal: (modal: ModalState) => void; onView: (group: RateGroup) => void }) {
  const groups = Object.values(state.groups);
  return <>
    <PageIntro eyebrow="STORE PRICING" title="Rate groups" description="Create reusable delivery charges for each store location. Groups are never created automatically." action={<Button disabled={groups.length >= MAX_RATE_GROUPS} onClick={() => openModal({ type: "group" })}><Plus /> New rate group <span className="limit-count">{groups.length}/{MAX_RATE_GROUPS}</span></Button>} />
    <div className="group-summary"><div><span>Rate groups created</span><strong>{groups.length}<small> / {MAX_RATE_GROUPS}</small></strong></div><div className="limit-track"><i style={{ width: `${groups.length / MAX_RATE_GROUPS * 100}%` }} /></div><span className="table-context">{MAX_RATE_GROUPS - groups.length} remaining</span></div>
    {groups.length ? <div className="rate-group-grid">{groups.map((group) => { const useCount = assignments.filter((item) => item.groupId === group.id).length; return <article className="rate-group-card" id={`rate-group-${group.id}`} key={group.id}><div className="group-card-top"><div className="group-type-icon"><Activity /></div><div><h2>{group.name}</h2><span><Store /> {group.store}</span></div><Button variant="ghost" size="icon" aria-label={`Edit ${group.name}`} onClick={() => openModal({ type: "group", group })}><Pencil /></Button></div><div className="rate-highlight"><span>Base delivery · 1 KG</span><strong>৳{rateForWeight(group, 1).toLocaleString()}</strong></div><div className="rate-triplet"><div><small>2 KG</small><b>৳{rateForWeight(group, 2).toLocaleString()}</b></div><div><small>3 KG</small><b>৳{rateForWeight(group, 3).toLocaleString()}</b></div><div><small>Additional / KG</small><b>৳{group.additional.toLocaleString()}</b></div></div>{Object.keys(group.slabs).length ? <div className="slab-details"><small>WEIGHT SLABS</small><p>{slabText(group.slabs)}</p></div> : <div className="slab-details subdued"><small>WEIGHT SLABS</small><p>Formula pricing</p></div>}<div className="group-card-footer"><span><Users /> {useCount} assigned area{useCount === 1 ? "" : "s"}</span><div><Button variant="ghost" size="sm" onClick={() => onView(group)}>View assignments</Button><Button variant="ghost" size="icon" aria-label={`Delete ${group.name}`} disabled={useCount > 0} title={useCount ? `${useCount} assignments still use this rate group` : "Delete rate group"} onClick={() => { if (useCount) { toast.error(`Cannot delete: ${useCount} assignment(s) use this group. View assignments first.`); onView(group); return; } if (!window.confirm(`Delete the “${group.name}” rate group?`)) return; setState((old) => { const next = { ...old.groups }; delete next[group.id]; return { ...old, groups: next }; }); toast.success("Rate group deleted"); }}><Trash2 /></Button></div></div></article>; })}</div> : <div className="empty-state"><div className="empty-symbol"><Activity /></div><h2>No rate groups yet</h2><p>Rate groups are created by your team and tied to a store location.</p><Button onClick={() => openModal({ type: "group" })}><Plus /> Create your first group</Button></div>}
    <div className="formula-note"><span className="formula-icon">৳</span><div><strong>How delivery charges are calculated</strong><p>Base rate + Additional per KG × (weight − 1). A matching weight slab takes precedence over the formula.</p></div></div>
  </>;
}

function AssignmentSection({ state, areas, assignments, setState }: { state: SholokState; areas: DeliveryArea[]; assignments: Assignment[]; setState: React.Dispatch<React.SetStateAction<SholokState>> }) {
  const [store, setStore] = useState("");
  const [division, setDivision] = useState("*");
  const [district, setDistrict] = useState("*");
  const [groupId, setGroupId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const groups = Object.values(state.groups).filter((group) => group.store === store);
  const districtChoices = useDistrictChoices(state, division);
  const group = state.groups[groupId];
  const visible = areas.filter((area) => (division === "*" || area.division === division) && (district === "*" || districtKey(area.division, area.district) === district) && (!normalize(query) || normalize(`${area.area} ${area.district} ${area.division}`).includes(normalize(query))));
  const assignedByStore = new Set(assignments.filter((item) => item.store === store).map((item) => item.areaId));
  const available = visible.filter((area) => statusFor(state, area.id) && !assignedByStore.has(area.id));
  const assignSelected = () => {
    if (!store || !groupId || group?.store !== store || !selected.length) { toast.error("Choose a store, matching rate group, and at least one available delivery area."); return; }
    const areaById = new Map(areas.map((area) => [area.id, area]));
    const added: Assignment[] = [];
    for (const areaId of selected) {
      const area = areaById.get(areaId);
      if (!area || !statusFor(state, area.id) || assignedByStore.has(area.id)) continue;
      const key = `${store}||${area.id}`;
      added.push({ key, store, areaId, division: area.division, district: area.district, area: area.area, groupId });
    }
    if (!added.length) { toast.error("No new eligible areas were selected."); return; }
    setState((old) => ({ ...old, assignments: { ...old.assignments, ...Object.fromEntries(added.map((item) => [item.key, item])) } }));
    setSelected([]);
    toast.success(`${added.length} delivery area${added.length === 1 ? "" : "s"} assigned to ${group.name}.`);
  };
  return <>
    <PageIntro eyebrow="ZONE CONFIGURATION" title="Delivery area assignment" description="Choose a store and rate group, then assign eligible delivery zones." />
    {!Object.keys(state.groups).length ? <div className="inline-empty"><Activity /><div><strong>Create a rate group to get started</strong><p>Only groups created for a store location can be selected here.</p></div></div> : null}
    <section className="surface assignment-builder"><div className="assignment-form-grid"><label>Store location<select value={store} onChange={(event) => { setStore(event.target.value); setGroupId(""); setSelected([]); }}><option value="">Select a store</option>{locations.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Division / region<select value={division} onChange={(event) => { setDivision(event.target.value); setDistrict("*"); setSelected([]); }}><option value="*">All divisions</option>{locations.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>City / district<select value={district} onChange={(event) => { setDistrict(event.target.value); setSelected([]); }}><option value="*">All districts</option>{districtChoices.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Rate group<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Select a rate group</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      {group ? <div className="preview-strip"><span className="preview-label">RATE PREVIEW <b>{group.name}</b> · {store}</span>{[1, 2, 3].map((weight) => <span key={weight}>{weight} KG <b>৳{rateForWeight(group, weight).toLocaleString()}</b></span>)}{Object.keys(group.slabs).length ? <small>Slabs: {slabText(group.slabs)}</small> : null}</div> : null}
      <div className="area-picker-head"><div><h2>Available delivery areas</h2><p>{available.length.toLocaleString()} unassigned and enabled in this view</p></div><div className="picker-tools"><div className="search-field compact"><Search /><input aria-label="Search all delivery areas" placeholder="Search areas…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Button variant="outline" size="sm" onClick={() => setSelected(available.map((area) => area.id))}>Select available</Button><Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button></div></div>
      <div className="area-picker-grid">{visible.map((area) => { const isDisabled = !statusFor(state, area.id); const isAssigned = assignedByStore.has(area.id); const isSelected = selected.includes(area.id); const current = assignments.find((item) => item.store === store && item.areaId === area.id); return <label key={area.id} className={`pick-area ${isDisabled ? "pick-disabled" : ""} ${isAssigned ? "pick-assigned" : ""}`}><input type="checkbox" disabled={isDisabled || isAssigned || !store || !groupId} checked={isSelected || Boolean(isAssigned)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, area.id] : old.filter((id) => id !== area.id))} /><span className="pick-copy"><b>{area.area}</b><small>{area.district} · {area.division}</small></span><span className="pick-state">{isDisabled ? "Disabled" : isAssigned ? current ? state.groups[current.groupId]?.name ?? "Assigned" : "Assigned" : "Available"}</span></label>; })}{!visible.length ? <p className="empty-cell">No matching areas found.</p> : null}</div>
      <div className="assign-footer"><span>{selected.length} areas selected</span><Button onClick={assignSelected} disabled={!selected.length || !store || !groupId}>Assign selected zones <ArrowRight /></Button></div>
    </section>
  </>;
}

function RatesSection({ state, assignments, openModal, setState }: { state: SholokState; assignments: Assignment[]; openModal: (modal: ModalState) => void; setState: React.Dispatch<React.SetStateAction<SholokState>> }) {
  const [search, setSearch] = useState("");
  const [store, setStore] = useState("*");
  const [division, setDivision] = useState("*");
  const [district, setDistrict] = useState("*");
  const [groupId, setGroupId] = useState("*");
  const [sort, setSort] = useState<SortState<SortableAssignment>>({ key: "division", direction: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const handleGroupView = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      setGroupId(target);
      setPage(1);
    };
    document.addEventListener("sholok:filter-group", handleGroupView);
    return () => document.removeEventListener("sholok:filter-group", handleGroupView);
  }, []);
  const districtChoices = useDistrictChoices(state, division);
  const filtered = assignments.filter((assignment) => {
    const group = state.groups[assignment.groupId];
    const q = normalize(`${assignment.store} ${group?.name ?? ""} ${assignment.division} ${assignment.district} ${assignment.area}`);
    return (store === "*" || assignment.store === store) && (division === "*" || assignment.division === division) && (district === "*" || districtKey(assignment.division, assignment.district) === district) && (groupId === "*" || assignment.groupId === groupId) && (!normalize(search) || q.includes(normalize(search)));
  });
  const sorted = [...filtered].sort((a, b) => {
    const groupA = state.groups[a.groupId]; const groupB = state.groups[b.groupId];
    const av = sort.key === "group" ? groupA?.name ?? "" : sort.key === "base" ? assignmentRate(a, groupA, 1) : a[sort.key];
    const bv = sort.key === "group" ? groupB?.name ?? "" : sort.key === "base" ? assignmentRate(b, groupB, 1) : b[sort.key];
    return (typeof av === "number" ? av - Number(bv) : String(av).localeCompare(String(bv))) * sort.direction;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const removeAssignments = (keys: string[]) => {
    if (!keys.length) return;
    if (!window.confirm(`Remove ${keys.length} selected assignment${keys.length === 1 ? "" : "s"}? Delivery areas will remain in the catalog.`)) return;
    setState((old) => ({ ...old, assignments: Object.fromEntries(Object.entries(old.assignments).filter(([key]) => !keys.includes(key))) }));
    setSelected([]); toast.success(`${keys.length} assignment${keys.length === 1 ? "" : "s"} removed`);
  };
  const exportRows = assignments.map((item) => { const group = state.groups[item.groupId]; return [item.store, group?.name ?? "", item.division, item.district, item.area, assignmentRate(item, group, 1), assignmentRate(item, group, 2), assignmentRate(item, group, 3)]; });
  return <>
    <PageIntro eyebrow="ACTIVE PRICING" title="Assigned zone rates" description="Review store-area assignments, delivery charges, and individual rate overrides." />
    <div className="table-toolbar rates-toolbar"><div className="search-field"><Search /><input aria-label="Search assigned rates" placeholder="Search store, group, district, area…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><select aria-label="Filter store location" value={store} onChange={(event) => { setStore(event.target.value); setPage(1); }}><option value="*">All store locations</option>{locations.map((item) => <option key={item.name}>{item.name}</option>)}</select><select aria-label="Filter division" value={division} onChange={(event) => { setDivision(event.target.value); setDistrict("*"); setPage(1); }}><option value="*">All divisions</option>{locations.map((item) => <option key={item.name}>{item.name}</option>)}</select><select aria-label="Filter district" value={district} onChange={(event) => { setDistrict(event.target.value); setPage(1); }}><option value="*">All districts</option>{districtChoices.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><select aria-label="Filter rate group" value={groupId} onChange={(event) => { setGroupId(event.target.value); setPage(1); }}><option value="*">All rate groups</option>{Object.values(state.groups).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><Button variant="outline" onClick={() => downloadCsv("sholok_assigned_zone_rates.csv", ["Store Location", "Rate Group", "Division", "District", "Delivery Area", "1 KG Charge", "2 KG Charge", "3 KG Charge"], exportRows)}><Download /> Export CSV</Button></div>
    <div className="selection-toolbar"><div><b>{selected.length}</b> selected <span>· {filtered.length.toLocaleString()} assignments</span></div><div className="toolbar-actions"><Button variant="ghost" size="sm" onClick={() => setSelected(pageRows.map((item) => item.key))}>Select page</Button><Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button><Button variant="outline" size="sm" disabled={!selected.length} onClick={() => removeAssignments(selected)}><Trash2 /> Remove selected</Button></div></div>
    <div className="data-table-wrap"><table className="data-table rate-table"><thead><tr><th><input type="checkbox" aria-label="Select visible assignments" checked={pageRows.length > 0 && pageRows.every((item) => selected.includes(item.key))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...pageRows.map((item) => item.key)])] : selected.filter((key) => !pageRows.some((item) => item.key === key)))} /></th>{(["store", "group", "division", "district", "area", "base"] as SortableAssignment[]).map((key) => <th key={key}><button className="sort-button" onClick={() => setSort((old) => ({ key, direction: old.key === key ? old.direction === 1 ? -1 : 1 : 1 }))}>{key === "base" ? "Base · 1 KG" : key === "area" ? "Delivery area" : key.charAt(0).toUpperCase() + key.slice(1)}<ArrowDownUp /></button></th>)}<th>2 KG</th><th>3 KG</th><th>Actions</th></tr></thead><tbody>
      {pageRows.map((assignment) => { const group = state.groups[assignment.groupId]; return <tr key={assignment.key}><td><input type="checkbox" aria-label={`Select ${assignment.area}`} checked={selected.includes(assignment.key)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, assignment.key] : old.filter((key) => key !== assignment.key))} /></td><td>{assignment.store}</td><td><span className="group-pill">{group?.name}</span></td><td>{assignment.division}</td><td>{assignment.district}</td><td><strong>{assignment.area}</strong></td><td><strong className="money">৳{assignmentRate(assignment, group, 1).toLocaleString()}</strong></td><td>৳{assignmentRate(assignment, group, 2).toLocaleString()}</td><td>৳{assignmentRate(assignment, group, 3).toLocaleString()}</td><td><div className="row-actions"><Button variant="ghost" size="icon" aria-label={`Edit rates for ${assignment.area}`} title="Edit this assignment’s rates" onClick={() => openModal({ type: "override", assignment })}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Change group for ${assignment.area}`} title="Change rate group" onClick={() => openModal({ type: "switch", assignment })}><ArrowRight /></Button><Button variant="ghost" size="icon" aria-label={`Remove assignment for ${assignment.area}`} title="Remove assignment" onClick={() => removeAssignments([assignment.key])}><Trash2 /></Button></div></td></tr>; })}
      {!pageRows.length ? <tr><td colSpan={11} className="empty-cell">No assigned zone rates match these filters.</td></tr> : null}
    </tbody></table></div><Pagination page={page} pageCount={pages} total={sorted.length} pageSize={pageSize} setPage={setPage} setPageSize={(value) => { setPageSize(value); setPage(1); }} />
  </>;
}

function BackupSection({ state, setState }: { state: SholokState; setState: React.Dispatch<React.SetStateAction<SholokState>> }) {
  const [importing, setImporting] = useState(false);
  const exportBackup = () => {
    downloadText(`sholok-backup-${new Date().toISOString().slice(0, 10)}.json`, serializeBackup(state), "application/json;charset=utf-8");
    toast.success("Backup exported");
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const validated = validateState(parsed);
      if (!window.confirm("Replace the data currently saved in this browser with the validated backup?")) return;
      setState(validated); toast.success("Backup restored successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This backup could not be read.");
    } finally { setImporting(false); }
  };
  return <>
    <PageIntro eyebrow="DATA SAFETY" title="Backup & restore" description="Export a complete copy of your local settings or restore a previously exported backup." />
    <section className="backup-grid"><article className="surface backup-card"><div className="backup-icon export"><Download /></div><span className="eyebrow">SAVE A COPY</span><h2>Export backup</h2><p>Download your rate groups, custom areas and districts, assignments, status settings, and rate overrides as a JSON file.</p><div className="backup-includes"><span><Check /> {Object.keys(state.groups).length} rate groups</span><span><Check /> {state.customAreas.length} custom areas</span><span><Check /> {Object.keys(state.assignments).length} assignments</span></div><Button onClick={exportBackup}><Download /> Export JSON backup</Button></article>
      <article className="surface backup-card"><div className="backup-icon import"><FileUp /></div><span className="eyebrow">RESTORE A COPY</span><h2>Import backup</h2><p>Choose a Sholok JSON backup. The file is checked before it replaces your current browser data.</p><div className="file-drop"><FileUp /><strong>{importing ? "Choose a backup file…" : "Select a backup file"}<small>JSON files exported from Sholok</small></strong><input aria-label="Import JSON backup" type="file" accept="application/json,.json" onChange={(event) => { setImporting(true); void importBackup(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div><span className="warning-copy"><CircleHelp /> Importing replaces the current saved settings in this browser.</span></article></section>
    <section className="surface reset-panel"><div className="reset-icon"><Trash2 /></div><div><h2>Reset application data</h2><p>Remove locally saved rate groups, custom areas, assignments, status changes, and overrides. The built-in Bangladesh location list remains intact.</p></div><Button variant="outline" onClick={() => { if (!window.confirm("Reset all Sholok application data in this browser? Built-in Bangladesh locations will remain.")) return; try { window.localStorage.removeItem(STORAGE_KEY); setState(makeInitialState()); toast.success("Application data reset"); } catch { toast.error("Your browser could not clear the saved data."); } }}>Reset local data</Button></section>
    <div className="browser-note"><ShieldCheck /><span><strong>Local to this browser</strong><small>Saved changes do not sync to other devices or browsers. Keep a backup if you need to transfer your settings.</small></span></div>
  </>;
}

function ModalHost({ modal, state, areas, assignments, setState, close }: { modal: Exclude<ModalState, null>; state: SholokState; areas: DeliveryArea[]; assignments: Assignment[]; setState: React.Dispatch<React.SetStateAction<SholokState>>; close: () => void }) {
  if (modal.type === "area") return <AreaModal area={modal.area} state={state} areas={areas} assignments={assignments} setState={setState} close={close} />;
  if (modal.type === "group") return <GroupModal group={modal.group} state={state} assignments={assignments} setState={setState} close={close} />;
  if (modal.type === "district") return <DistrictModal division={modal.division} district={modal.district} state={state} areas={areas} assignments={assignments} setState={setState} close={close} />;
  if (modal.type === "override") return <OverrideModal assignment={modal.assignment} state={state} setState={setState} close={close} />;
  return <SwitchGroupModal assignment={modal.assignment} state={state} setState={setState} close={close} />;
}

function AreaModal({ area, state, areas, assignments, setState, close }: { area: DeliveryArea | undefined; state: SholokState; areas: DeliveryArea[]; assignments: Assignment[]; setState: React.Dispatch<React.SetStateAction<SholokState>>; close: () => void }) {
  const [division, setDivision] = useState(area?.division ?? "Dhaka");
  const [district, setDistrict] = useState(area?.district ?? "");
  const [newDistrict, setNewDistrict] = useState("");
  const [name, setName] = useState(area?.area ?? "");
  const districtChoices = useDistrictChoices(state, division);
  const count = area ? assignments.filter((item) => item.areaId === area.id).length : 0;
  const save = () => {
    const finalDistrict = area ? area.district : newDistrict.trim() || district;
    if (!division || !finalDistrict || !name.trim()) { toast.error("Division, district, and delivery area are required."); return; }
    const duplicate = areas.some((item) => item.id !== area?.id && normalize(item.division) === normalize(division) && normalize(item.district) === normalize(finalDistrict) && normalize(item.area) === normalize(name));
    if (duplicate) { toast.error("This delivery area already exists in the selected district."); return; }
    if (area && count > 0 && area.area !== name.trim() && !window.confirm(`Renaming this area will update ${count} existing assignment(s). Continue?`)) return;
    setState((old) => {
      if (area) {
        const nextAreas = old.customAreas.map((item) => item.id === area.id ? { ...item, area: name.trim() } : item);
        const overrides = area.source === "built-in" ? { ...old.areaOverrides, [area.id]: { ...area, area: name.trim() } } : old.areaOverrides;
        const nextAssignments = Object.fromEntries(Object.entries(old.assignments).map(([key, item]) => [key, item.areaId === area.id ? { ...item, area: name.trim() } : item]));
        return { ...old, customAreas: nextAreas, areaOverrides: overrides, assignments: nextAssignments };
      }
      let customDistricts = old.customDistricts;
      const typed = newDistrict.trim();
      let actualDistrict = finalDistrict;
      if (typed) {
        const existingCustom = customDistricts.find((item) => normalize(item.name) === normalize(typed) && normalize(item.division) === normalize(division));
        const builtIn = locations.find((item) => normalize(item.name) === normalize(division))?.districts.find((item) => normalize(item.name) === normalize(typed));
        if (existingCustom) actualDistrict = existingCustom.name;
        else if (builtIn) actualDistrict = builtIn.name;
        else { customDistricts = [...customDistricts, { id: createId("district"), division, name: typed }]; actualDistrict = typed; }
      }
      const created: DeliveryArea = { id: createId("area"), division, district: actualDistrict, area: name.trim(), source: "custom" };
      return { ...old, customDistricts, customAreas: [...old.customAreas, created] };
    });
    toast.success(area ? "Delivery area updated" : "Delivery area added"); close();
  };
  return <DialogFrame title={area ? "Edit delivery area" : "Add delivery area"} description={area ? "The district remains unchanged. Rename a district separately." : "Choose an existing district or add a custom one."} close={close}>
    {area && count ? <div className="impact-warning"><CircleHelp /><span>This area has {count} assignment(s). Renaming it updates the area name in those assignments.</span></div> : null}
    <div className="modal-form-grid"><label>Division / region<select disabled={Boolean(area)} value={division} onChange={(event) => { setDivision(event.target.value); setDistrict(""); }}><option value="">Select division</option>{locations.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>City / district<select disabled={Boolean(area)} value={district} onChange={(event) => setDistrict(event.target.value)}><option value="">Select district</option>{districtChoices.map((item) => <option key={item.key} value={item.name}>{item.name}{item.custom ? " · Custom" : ""}</option>)}</select></label>{!area ? <label className="full-field">Or create a new district<input value={newDistrict} onChange={(event) => setNewDistrict(event.target.value)} placeholder="Enter a custom district name" /></label> : null}<label className="full-field">Delivery area<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter delivery area name" /></label></div>
    <div className="modal-actions"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save}>{area ? "Save changes" : "Add area"}</Button></div>
  </DialogFrame>;
}

function GroupModal({ group, state, assignments, setState, close }: { group: RateGroup | undefined; state: SholokState; assignments: Assignment[]; setState: React.Dispatch<React.SetStateAction<SholokState>>; close: () => void }) {
  const [store, setStore] = useState(group?.store ?? "");
  const [name, setName] = useState(group?.name ?? "");
  const [base, setBase] = useState(group ? String(group.base) : "");
  const [additional, setAdditional] = useState(group ? String(group.additional) : "");
  const [slabs, setSlabs] = useState(group ? slabText(group.slabs) : "");
  const useCount = group ? assignments.filter((item) => item.groupId === group.id).length : 0;
  const save = () => {
    let slabData: Record<string, number>;
    try { slabData = parseSlabs(slabs); } catch (error) { toast.error(error instanceof Error ? error.message : "Invalid weight slabs."); return; }
    const parsedBase = Number(base); const parsedAdditional = Number(additional);
    try { validateRateGroup({ store, name, base: parsedBase, additional: parsedAdditional, slabs: slabData }, Object.values(state.groups), group?.id); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Invalid rate group."); return; }
    if (group && useCount && (group.base !== parsedBase || group.additional !== parsedAdditional || JSON.stringify(group.slabs) !== JSON.stringify(slabData)) && !window.confirm(`Changing these rates will affect all ${useCount} assignments using “${group.name}”. Continue?`)) return;
    const updated: RateGroup = { id: group?.id ?? createId("group"), store, name: name.trim(), base: parsedBase, additional: parsedAdditional, slabs: slabData };
    setState((old) => ({ ...old, groups: { ...old.groups, [updated.id]: updated } })); toast.success(group ? "Rate group updated" : "Rate group created"); close();
  };
  return <DialogFrame title={group ? "Edit rate group" : "Create rate group"} description={`Rate groups are store-specific. ${MAX_RATE_GROUPS - Object.keys(state.groups).length + (group ? 1 : 0)} of ${MAX_RATE_GROUPS} creation slots remain.`} close={close}>
    {group && useCount ? <div className="impact-warning"><CircleHelp /><span>Rate changes affect {useCount} linked assignment(s). Individual overrides remain unchanged.</span></div> : null}
    <div className="modal-form-grid"><label>Store location<select disabled={Boolean(group)} value={store} onChange={(event) => setStore(event.target.value)}><option value="">Select store location</option>{locations.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Rate group name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Inside Dhaka" /></label><label>Base rate · first 1 KG<input type="number" min="0.01" step="0.01" value={base} onChange={(event) => setBase(event.target.value)} placeholder="60" /></label><label>Additional per KG<input type="number" min="0.01" step="0.01" value={additional} onChange={(event) => setAdditional(event.target.value)} placeholder="20" /></label><label className="full-field">Optional weight slabs<input value={slabs} onChange={(event) => setSlabs(event.target.value)} placeholder="1:60, 2:80, 3:100, 5:140" /><small>Format: weight:rate. Matching weights override the formula.</small></label></div>
    <div className="rate-example"><span>RATE PREVIEW</span>{[1, 2, 3].map((weight) => { let value = Number(base || 0) + Math.max(0, weight - 1) * Number(additional || 0); try { const parsed = parseSlabs(slabs); value = parsed[String(weight)] ?? value; } catch { /* inline validation appears on save */ } return <div key={weight}>{weight} KG <strong>৳{value.toLocaleString()}</strong></div>; })}</div>
    <div className="modal-actions"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save}>{group ? "Save rate changes" : "Create rate group"}</Button></div>
  </DialogFrame>;
}

function DistrictModal({ division, district, state, areas, assignments, setState, close }: { division: string; district: string; state: SholokState; areas: DeliveryArea[]; assignments: Assignment[]; setState: React.Dispatch<React.SetStateAction<SholokState>>; close: () => void }) {
  const [name, setName] = useState(district);
  const affected = areas.filter((area) => normalize(area.division) === normalize(division) && normalize(area.district) === normalize(district));
  const impact = assignments.filter((item) => affected.some((area) => area.id === item.areaId)).length;
  const save = () => {
    if (!name.trim()) { toast.error("Enter a district name."); return; }
    if (normalize(name) === normalize(district)) { close(); return; }
    if (areas.some((area) => normalize(area.division) === normalize(division) && normalize(area.district) === normalize(name) && normalize(area.district) !== normalize(district))) { toast.error("A district with this name already exists in this division."); return; }
    if (!window.confirm(`Rename “${district}” to “${name.trim()}”? ${affected.length} areas and ${impact} assignments will be updated. The district identity will remain the same.`)) return;
    setState((old) => {
      const original = locations.find((item) => normalize(item.name) === normalize(division))?.districts.find((item) => normalize(old.districtRenames[districtKey(division, item.name)] ?? item.name) === normalize(district));
      const districtRecord = old.customDistricts.find((item) => normalize(item.division) === normalize(division) && normalize(item.name) === normalize(district));
      const customDistricts = districtRecord ? old.customDistricts.map((item) => item.id === districtRecord.id ? { ...item, name: name.trim() } : item) : old.customDistricts;
      const customAreas = old.customAreas.map((area) => normalize(area.division) === normalize(division) && normalize(area.district) === normalize(district) ? { ...area, district: name.trim() } : area);
      const areaOverrides = Object.fromEntries(Object.entries(old.areaOverrides).map(([id, area]) => [id, affected.some((item) => item.id === id) ? { ...area, district: name.trim() } : area]));
      const nextAssignments = Object.fromEntries(Object.entries(old.assignments).map(([key, assignment]) => [key, affected.some((item) => item.id === assignment.areaId) ? { ...assignment, district: name.trim() } : assignment]));
      const districtRenames = original ? { ...old.districtRenames, [districtKey(division, original.name)]: name.trim() } : old.districtRenames;
      return { ...old, customDistricts, customAreas, areaOverrides, assignments: nextAssignments, districtRenames };
    });
    toast.success("District renamed"); close();
  };
  return <DialogFrame title="Edit district" description="Rename the district without changing its identity or area assignments." close={close}><div className="modal-form-grid"><label>Division / region<input value={division} readOnly /></label><label>Current district<input value={district} readOnly /></label><label className="full-field">New district name<input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label></div><div className="impact-warning"><CircleHelp /><span>{affected.length} delivery areas and {impact} assignments are linked to this district.</span></div><div className="modal-actions"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save}>Rename district</Button></div></DialogFrame>;
}

function OverrideModal({ assignment, state, setState, close }: { assignment: Assignment; state: SholokState; setState: React.Dispatch<React.SetStateAction<SholokState>>; close: () => void }) {
  const group = state.groups[assignment.groupId];
  const [values, setValues] = useState([1, 2, 3].map((weight) => String(assignmentRate(assignment, group, weight))));
  const save = () => {
    if (!group) { toast.error("The rate group for this assignment no longer exists."); return; }
    const rates = values.map(Number);
    if (!rates.every((rate) => Number.isFinite(rate) && rate > 0)) { toast.error("All three charges must be greater than zero."); return; }
    if (!window.confirm(`Update rates only for “${assignment.area}”? The “${group.name}” rate group will not change.`)) return;
    const [base, rate2kg, rate3kg] = rates;
    if (base === undefined || rate2kg === undefined || rate3kg === undefined) return;
    setState((old) => ({ ...old, assignments: { ...old.assignments, [assignment.key]: { ...assignment, rateOverride: { base, rate2kg, rate3kg } } } })); toast.success("Assignment rates updated"); close();
  };
  return <DialogFrame title="Edit assigned rates" description={`${assignment.area} · ${assignment.district}, ${assignment.division} · ${group?.name ?? "Rate group"}`} close={close}><div className="modal-form-grid three-fields">{["Base charge · 1 KG", "Charge · 2 KG", "Charge · 3 KG"].map((label, index) => <label key={label}>{label}<input type="number" min="0.01" step="0.01" value={values[index]} onChange={(event) => setValues((old) => old.map((value, i) => i === index ? event.target.value : value))} /></label>)}</div><p className="modal-note">This override applies to this assignment only. Changing its rate group clears these custom rates.</p><div className="modal-actions"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save}>Save rates</Button></div></DialogFrame>;
}

function SwitchGroupModal({ assignment, state, setState, close }: { assignment: Assignment; state: SholokState; setState: React.Dispatch<React.SetStateAction<SholokState>>; close: () => void }) {
  const [groupId, setGroupId] = useState("");
  const available = Object.values(state.groups).filter((group) => group.store === assignment.store && group.id !== assignment.groupId);
  const oldGroup = state.groups[assignment.groupId]; const newGroup = state.groups[groupId];
  const save = () => {
    if (!newGroup) { toast.error("Choose another rate group for this store."); return; }
    if (!window.confirm(`Change “${oldGroup?.name}” → “${newGroup.name}”? This assignment’s individual rate overrides will be cleared.`)) return;
    const { rateOverride: _previousOverride, ...assignmentWithoutOverride } = assignment;
    setState((old) => ({ ...old, assignments: { ...old.assignments, [assignment.key]: { ...assignmentWithoutOverride, groupId: newGroup.id } } })); toast.success("Rate group changed"); close();
  };
  return <DialogFrame title="Change rate group" description={`${assignment.area} · ${assignment.store}`} close={close}><div className="change-flow"><span>{oldGroup?.name}</span><ArrowRight /><strong>{newGroup?.name ?? "Choose a group"}</strong></div><label className="full-field">New rate group<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Select another rate group</option>{available.map((group) => <option key={group.id} value={group.id}>{group.name} · ৳{rateForWeight(group, 1)} base</option>)}</select></label><p className="modal-note">The store and delivery area stay the same. Any individual rate overrides will be cleared.</p><div className="modal-actions"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={!newGroup}>Change group</Button></div></DialogFrame>;
}

function UnassignedDialog({ areas, assignments, state, onClose }: { areas: DeliveryArea[]; assignments: Assignment[]; state: SholokState; onClose: () => void }) {
  const assigned = new Set(assignments.map((item) => item.areaId));
  const unassigned = areas.filter((area) => !assigned.has(area.id));
  return <DialogFrame title="Unassigned delivery areas" description={`${unassigned.length.toLocaleString()} areas have no valid rate-group assignment.`} close={onClose} wide><div className="data-table-wrap dialog-table"><table className="data-table"><thead><tr><th>Division</th><th>District</th><th>Delivery area</th><th>Status</th><th>Assignments</th></tr></thead><tbody>{unassigned.slice(0, 100).map((area) => <tr key={area.id}><td>{area.division}</td><td>{area.district}</td><td>{area.area}</td><td><span className={`status-label ${statusFor(state, area.id) ? "is-enabled" : "is-disabled"}`}>{statusFor(state, area.id) ? "Enabled" : "Disabled"}</span></td><td>{assignments.filter((item) => item.areaId === area.id).length}</td></tr>)}{unassigned.length > 100 ? <tr><td colSpan={5} className="empty-cell">Showing the first 100 of {unassigned.length.toLocaleString()} unassigned areas.</td></tr> : null}{!unassigned.length ? <tr><td colSpan={5} className="empty-cell">All delivery areas have at least one valid assignment.</td></tr> : null}</tbody></table></div><div className="modal-actions"><Button variant="outline" onClick={onClose}>Close report</Button></div></DialogFrame>;
}

function DialogFrame({ title, description, close, children, wide = false }: { title: string; description: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [close]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`dialog-panel ${wide ? "dialog-wide" : ""}`}><header className="dialog-heading"><div><span className="eyebrow">SHOLOK OPERATIONS</span><h2 id="dialog-title">{title}</h2><p>{description}</p></div><Button variant="ghost" size="icon" aria-label="Close dialog" onClick={close}><X /></Button></header>{children}</section></div>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function Pagination({ page, pageCount, total, pageSize, setPage, setPageSize }: { page: number; pageCount: number; total: number; pageSize: number; setPage: (page: number) => void; setPageSize: (size: number) => void }) {
  const from = total ? (page - 1) * pageSize + 1 : 0; const to = Math.min(page * pageSize, total);
  return <div className="pagination-bar"><span>Showing <b>{from}–{to}</b> of <b>{total.toLocaleString()}</b></span><div className="pagination-controls"><label>Rows<select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></label><Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><span>Page <b>{page}</b> of {pageCount}</span><Button variant="outline" size="icon" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div></div>;
}

function useDistrictChoices(state: SholokState, division: string) {
  return useMemo(() => {
    const districts = locations.filter((item) => division === "*" || item.name === division).flatMap((item) => item.districts.map((district) => ({ name: state.districtRenames[districtKey(item.name, district.name)] ?? district.name, division: item.name, custom: false })));
    const custom = state.customDistricts.filter((item) => division === "*" || item.division === division).map((item) => ({ name: item.name, division: item.division, custom: true }));
    return [...districts, ...custom].map((item) => ({ ...item, key: districtKey(item.division, item.name), label: division === "*" ? `${item.name} · ${item.division}` : item.name }));
  }, [state.customDistricts, state.districtRenames, division]);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  downloadText(filename, `\ufeff${csv}`, "text/csv;charset=utf-8");
}
