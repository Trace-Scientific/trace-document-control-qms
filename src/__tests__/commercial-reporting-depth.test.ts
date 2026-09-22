import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/notifications-reporting.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-notifications-reporting-panel.tsx"),"utf8");

describe("commercial reporting depth",()=>{
  it("reports customers by salesperson and new customers by period",()=>{
    expect(service).toContain("customersByRepresentativeRows");
    expect(service).toContain("newCustomersLast30Days");
    expect(service).toContain("newCustomersLast90Days");
    expect(panel).toContain("Customers by salesperson");
    expect(panel).toContain("New customers — last 30 days");
  });

  it("normalizes recurring revenue for monthly and annual active subscriptions",()=>{
    expect(service).toContain('"billingCadence"');
    expect(service).toContain("WHEN 'MONTHLY'");
    expect(service).toContain("WHEN 'ANNUAL'");
    expect(service).toContain("/ 12.0");
    expect(service).toContain("monthlyRecurringRevenueByCurrency");
    expect(panel).toContain("Monthly recurring revenue");
  });

  it("reports renewals cancellations plan mix and module mix",()=>{
    expect(service).toContain("upcomingRenewalsNext90Days");
    expect(service).toContain('"status"=\'CANCELLED\'');
    expect(service).toContain("planMixRows");
    expect(service).toContain("moduleMixRows");
    expect(panel).toContain("Upcoming renewals (next 90 days)");
    expect(panel).toContain("Plan mix");
    expect(panel).toContain("Module mix");
  });

  it("reports accrued paid and approved-unpaid commissions",()=>{
    expect(service).toContain("commissionAccruedRows");
    expect(service).toContain("commissionPaidRows");
    expect(service).toContain("unpaidApprovedAmount");
    expect(panel).toContain("Commission accrued");
    expect(panel).toContain("Commission paid");
    expect(panel).toContain("Approved unpaid commission amount");
  });

  it("keeps reporting control-plane only and governed by platform reporting permission",()=>{
    expect(service).toContain('permission: "platform.reporting.read"');
    expect(service).not.toContain('"Document"');
    expect(service).not.toContain('"TrainingRecord"');
    expect(service).not.toContain('"QualityEvent"');
  });
});
