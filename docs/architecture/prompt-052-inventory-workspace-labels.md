# Prompt 052 — Inventory Workspace and Governed Labels

## Scope
Add operational inventory analytics and governed lot-label issuance without weakening the append-only inventory ledger or lot identity controls.

## Controls
- inventory.read users can retrieve tenant-scoped operational summary metrics;
- workspace metrics are derived from governed materials, lots, balances, reservations, low-stock events, and recall-impact evidence;
- label issuance requires inventory.manage;
- labels can only be issued for a lot with an assigned governed barcode;
- every label issuance records append-only evidence containing the exact barcode, material identity, lot number, status, expiration date, issuer, and timestamp;
- label issuance appends audit history and does not mutate the underlying lot identity or barcode assignment.

## Boundary
Procurement and supplier ordering remain the final Prompt 052 bounded-context slice. Physical printer integration remains an external delivery concern; this slice produces the governed label payload and issuance evidence that a printer adapter can consume.

## Inventory workspace

Open **Laboratory operations → Inventory** with `inventory.read` to browse the material catalog and search lots by lot number, material number, or material name. Search can be combined with material and status filters. The register displays recorded status and quantity received. Quantity on hand continues to come from the inventory ledger.

Users who also have `inventory.manage` can register materials and record receipts against active materials. The receipt form records the lot number, receipt date, optional expiration date, optional quantity and unit, and optional site and department. Active departments are filtered by the selected active site. When the site is blank, active departments without a site can be selected. The lot register shows the recorded location and can filter by site, including historical sites and lots with no site assigned.

Receipt evidence attachments remain available through the governed API. New lots enter **Received** status. The existing receipt service validates the location and records it in the receipt audit event. A receipt with a positive quantity posts stock at that recorded location when the lot is accepted with a governed acceptance certificate.
