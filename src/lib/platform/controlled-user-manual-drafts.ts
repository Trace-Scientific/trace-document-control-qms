import { CONTROLLED_USER_MANUAL_CORE_DRAFTS, type ControlledUserManualSectionDraft } from "./controlled-user-manual-core-drafts";
import { CONTROLLED_USER_MANUAL_REMAINING_DRAFTS } from "./controlled-user-manual-remaining-drafts";

export const CONTROLLED_USER_MANUAL_DRAFTS: readonly ControlledUserManualSectionDraft[] = [
  ...CONTROLLED_USER_MANUAL_CORE_DRAFTS,
  ...CONTROLLED_USER_MANUAL_REMAINING_DRAFTS,
].sort((left, right) => {
  const order = ["UM-01","UM-02","UM-03","UM-04","UM-05","UM-06","UM-07","UM-08","UM-09","UM-10","UM-11","UM-12","UM-13","UM-14","UM-15","UM-A"];
  return order.indexOf(left.sectionCode) - order.indexOf(right.sectionCode);
});

export function getControlledUserManualDraft(sectionCode: ControlledUserManualSectionDraft["sectionCode"]) {
  return CONTROLLED_USER_MANUAL_DRAFTS.find((section) => section.sectionCode === sectionCode) ?? null;
}
