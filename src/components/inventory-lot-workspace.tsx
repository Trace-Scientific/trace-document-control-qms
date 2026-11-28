"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { MaterialLotStatus } from "@/lib/inventory/inventory";
import { type CatalogMaterial, type RegisterLot, filterLotRegister, lotStatusLabels } from "@/lib/inventory/lot-register";
import { availableReceiptDepartments, type ReceiptLocations } from "@/lib/inventory/receipt-locations";

const pageSize = 25;
const materialsUrl = "/api/inventory/materials";
const lotsUrl = "/api/inventory/lots";

async function readList<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Inventory list unavailable");
  const { data } = await response.json();
  if (!Array.isArray(data)) throw new Error("Invalid inventory list");
  return data;
}

async function readLocations(signal: AbortSignal): Promise<ReceiptLocations> {
  const response = await fetch("/api/inventory/locations", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Receipt locations unavailable");
  const { data } = await response.json();
  if (!Array.isArray(data?.sites) || !Array.isArray(data?.departments)) throw new Error("Invalid receipt location directory");
  return data;
}

export function InventoryLotWorkspace({ canManage, today }: { canManage: boolean; today: string }) {
  const [inventory, setInventory] = useState<{ materials: CatalogMaterial[]; lots: RegisterLot[]; locations: ReceiptLocations } | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptMaterialId, setReceiptMaterialId] = useState("");
  const [receiptSiteId, setReceiptSiteId] = useState("");
  const [receiptDepartmentId, setReceiptDepartmentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [view, setView] = useState<"lots" | "materials">("lots");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MaterialLotStatus | "">("");
  const [materialId, setMaterialId] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [page, setPage] = useState(1);
  const materialsById = useMemo(() => new Map(inventory?.materials.map(material => [material.id, material])), [inventory]);
  const sitesById = useMemo(() => new Map(inventory?.locations.sites.map(site => [site.id, site])), [inventory]);
  const departmentsById = useMemo(() => new Map(inventory?.locations.departments.map(department => [department.id, department])), [inventory]);
  const activeMaterials = inventory?.materials.filter(material => material.status === "ACTIVE") ?? [];
  const activeSites = inventory?.locations.sites.filter(site => site.active) ?? [];
  const activeDepartments = inventory ? availableReceiptDepartments(inventory.locations, receiptSiteId || null) : [];
  const siteUnavailable = Boolean(receiptSiteId && !sitesById.get(receiptSiteId)?.active);
  const departmentUnavailable = Boolean(receiptDepartmentId && !activeDepartments.some(department => department.id === receiptDepartmentId));
  const locationUnavailable = siteUnavailable || departmentUnavailable;
  const visibleLots = inventory ? filterLotRegister(inventory.lots, materialsById, {
    query, status, materialId, receiptSiteId: siteFilter === "unassigned" ? null : siteFilter,
  }) : [];
  const pageCount = Math.max(1, Math.ceil(visibleLots.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageLots = visibleLots.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      readList<CatalogMaterial>(materialsUrl, controller.signal),
      readList<RegisterLot>(lotsUrl, controller.signal),
      readLocations(controller.signal),
    ]).then(([materials, lots, locations]) => {
      if (!controller.signal.aborted) setInventory({ materials, lots, locations });
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);

  function refresh() {
    setLoadError(false);
    setLoading(true);
    setRevision(current => current + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>, kind: "material" | "receipt") {
    event.preventDefault();
    if (!canManage || saving || loading || loadError) return;
    if (kind === "receipt" && locationUnavailable) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? "").trim();
    const material = kind === "material";
    const payload = material
      ? { materialNumber: field("materialNumber"), name: field("name"),
          manufacturer: field("manufacturer") || null, catalogNumber: field("catalogNumber") || null }
      : { materialId: field("materialId"), lotNumber: field("lotNumber"), receivedAt: field("receivedAt"),
          expirationDate: field("expirationDate") || null, quantityReceived: quantity === "" ? null : Number(quantity),
          unitOfMeasure: field("unitOfMeasure") || null, siteId: receiptSiteId || null, departmentId: receiptDepartmentId || null };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(material ? materialsUrl : lotsUrl, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? (material ? "Could not register the material." : "Could not record the receipt."));
        return;
      }
      form.reset();
      if (material) {
        const body = await response.json().catch(() => null);
        if (typeof body?.data?.id === "string" && !receiptMaterialId) setReceiptMaterialId(body.data.id);
        setNotice("Material registered.");
      } else {
        setQuantity("");
        setReceiptSiteId("");
        setReceiptDepartmentId("");
        setView("lots");
        setQuery("");
        setStatus("");
        setMaterialId("");
        setSiteFilter("");
        setPage(1);
        setNotice("Lot receipt recorded with status Received.");
      }
      refresh();
    } catch {
      setError("The save could not be confirmed. Refresh the register and check for the record before retrying.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="workspace-section" aria-labelledby="inventory-heading">
    <div className="workspace-heading"><h2 id="inventory-heading">Inventory</h2></div>
    <div className="form-stack">
      <div>
        <button type="button" className="secondary-button" disabled={loading || saving} onClick={refresh}>Refresh inventory</button>
      </div>
      {loading && <p role="status">Loading inventory…</p>}
      {loadError && <p role="alert">Unable to load current inventory. Refresh inventory to try again.</p>}
      {canManage && inventory && <div className="form-stack">
        <details className="card">
          <summary>Register material</summary>
          <form onSubmit={event => void submit(event, "material")}>
            <fieldset className="admin-form" disabled={saving || loading || loadError} aria-label="Register material">
              <label>Material number<input name="materialNumber" required maxLength={80} /></label>
              <label>Material name<input name="name" required maxLength={240} /></label>
              <label>Manufacturer<input name="manufacturer" maxLength={240} /></label>
              <label>Catalog number<input name="catalogNumber" maxLength={240} /></label>
              <button type="submit">Register material</button>
            </fieldset>
          </form>
        </details>
        <details className="card">
          <summary>Receive lot</summary>
          {activeMaterials.length === 0 && <p>Register an active material before receiving a lot.</p>}
          <form onSubmit={event => void submit(event, "receipt")}>
            <fieldset className="admin-form" disabled={saving || loading || loadError || activeMaterials.length === 0}
              aria-label="Receive lot">
              <label>Material
                <select name="materialId" required value={receiptMaterialId} onChange={event => setReceiptMaterialId(event.target.value)}>
                  <option value="">Select an active material</option>
                  {activeMaterials.map(material => <option key={material.id} value={material.id}>
                    {material.materialNumber} · {material.name}
                  </option>)}
                </select>
              </label>
              <label>Lot number<input name="lotNumber" required maxLength={120} /></label>
              <label>Received date<input name="receivedAt" type="date" defaultValue={today} required /></label>
              <label>Expiration date<input name="expirationDate" type="date" /></label>
              <label>Receipt site
                <select value={receiptSiteId} onChange={event => {
                  setReceiptSiteId(event.target.value);
                  setReceiptDepartmentId("");
                }}>
                  <option value="">No site assigned</option>
                  {siteUnavailable && <option value={receiptSiteId} disabled>Previously selected site is unavailable</option>}
                  {activeSites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </label>
              <label>Receipt department
                <select value={receiptDepartmentId} onChange={event => setReceiptDepartmentId(event.target.value)}>
                  <option value="">No department assigned</option>
                  {departmentUnavailable && <option value={receiptDepartmentId} disabled>Previously selected department is unavailable</option>}
                  {activeDepartments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
              <label>Quantity received<input name="quantityReceived" type="number" min={0} step="0.0001" value={quantity}
                onChange={event => setQuantity(event.target.value)} /></label>
              <label>Unit of measure<input name="unitOfMeasure" maxLength={80} required={quantity !== ""} /></label>
              {locationUnavailable && <p role="alert">The selected receipt location is unavailable. Select a current site and department or clear the selection.</p>}
              <button type="submit" disabled={locationUnavailable}>Record receipt</button>
            </fieldset>
          </form>
        </details>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
      </div>}
      {inventory && <div className="module-section-stack">
        <nav className="section-nav" aria-label="Inventory records">
          <button type="button" aria-current={view === "lots" ? "page" : undefined} onClick={() => setView("lots")}>Lot register</button>
          <button type="button" aria-current={view === "materials" ? "page" : undefined} onClick={() => setView("materials")}>Material catalog</button>
        </nav>
        {view === "lots" ? <>
          <div className="admin-form">
            <label>Search lots<input type="search" placeholder="Lot number, material number, or name" value={query}
              onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
            <label>Material<select value={materialId} onChange={event => { setMaterialId(event.target.value); setPage(1); }}>
              <option value="">All materials</option>
              {inventory.materials.map(material => <option key={material.id} value={material.id}>{material.materialNumber} · {material.name}</option>)}
            </select></label>
            <label>Status<select value={status} onChange={event => { setStatus(event.target.value as MaterialLotStatus | ""); setPage(1); }}>
              <option value="">All statuses</option>
              {Object.entries(lotStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Receipt site<select value={siteFilter} onChange={event => { setSiteFilter(event.target.value); setPage(1); }}>
              <option value="">All sites</option>
              <option value="unassigned">No site assigned</option>
              {inventory.locations.sites.map(site => <option key={site.id} value={site.id}>
                {site.active ? site.name : `${site.name} (inactive)`}
              </option>)}
            </select></label>
          </div>
          <p role="status">Showing {pageLots.length} of {visibleLots.length} matching lots</p>
          <div className="table-wrap"><table aria-label="Lot register">
            <thead><tr>{["Lot number", "Material", "Status", "Received", "Receipt location", "Expires", "Quantity received"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {pageLots.map(lot => {
                const material = materialsById.get(lot.materialId);
                const site = lot.siteId ? sitesById.get(lot.siteId)?.name ?? "Unknown site" : null;
                const department = lot.departmentId ? departmentsById.get(lot.departmentId)?.name ?? "Unknown department" : null;
                return <tr key={lot.id}>
                  <th scope="row">{lot.lotNumber}</th>
                  <td>{material ? `${material.materialNumber} · ${material.name}` : "Material unavailable"}</td>
                  <td>{lotStatusLabels[lot.status]}</td>
                  <td>{lot.receivedAt.slice(0, 10)}</td>
                  <td>{[site, department].filter(Boolean).join(" · ") || "Unassigned"}</td>
                  <td>{lot.expirationDate?.slice(0, 10) ?? "—"}</td>
                  <td>{lot.quantityReceived === null ? "—" : [lot.quantityReceived, lot.unitOfMeasure].filter(value => value !== null).join(" ")}</td>
                </tr>;
              })}
              {pageLots.length === 0 && <tr><td colSpan={7}>{inventory.lots.length === 0 ? "No lots have been received." : "No lots match these filters."}</td></tr>}
            </tbody>
          </table></div>
          {pageCount > 1 && <div className="section-nav" aria-label="Lot register pages">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <span>Page {currentPage} of {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>}
        </> : <div className="table-wrap"><table aria-label="Material catalog">
          <thead><tr>{["Material number", "Name", "Manufacturer", "Catalog number", "Status"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>
            {inventory.materials.map(material => <tr key={material.id}>
              <th scope="row">{material.materialNumber}</th><td>{material.name}</td><td>{material.manufacturer ?? "—"}</td>
              <td>{material.catalogNumber ?? "—"}</td><td>{material.status === "ACTIVE" ? "Active" : "Inactive"}</td>
            </tr>)}
            {inventory.materials.length === 0 && <tr><td colSpan={5}>No materials have been registered.</td></tr>}
          </tbody>
        </table></div>}
      </div>}
    </div>
  </section>;
}
