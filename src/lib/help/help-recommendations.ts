import type { AuthorizationContext } from "@/lib/security/authorization";

export type HelpRecommendation = {
  key: string;
  label: string;
  description: string;
  query: string;
  context: string;
};

type RecommendationDefinition = HelpRecommendation & {
  anyPermission: readonly string[];
};

const definitions: readonly RecommendationDefinition[] = [
  { key:"documents", label:"Controlled documents", description:"Create, revise, submit, review, approve, distribute, and acknowledge controlled documents.", query:"controlled document review approval distribution acknowledgement", context:"documents", anyPermission:["document.read"] },
  { key:"review-queue", label:"Reviews & approvals", description:"Work assigned document reviews and approvals within your authorized scope.", query:"review approval assignment", context:"review-queue", anyPermission:["document.review","document.approve","document.review.manage"] },
  { key:"records", label:"Records management", description:"Create, retain, archive, and export governed quality records according to your permissions.", query:"records create archive export", context:"records", anyPermission:["record.read"] },
  { key:"personnel", label:"Personnel", description:"Work with people, credentials, qualifications, and governed personnel evidence.", query:"personnel credentials qualifications", context:"personnel", anyPermission:["personnel.read"] },
  { key:"training", label:"Training & competency", description:"Review training assignments, completions, competency programs, and assessments.", query:"training competency assignment completion assessment", context:"training", anyPermission:["training.read"] },
  { key:"quality", label:"Quality events", description:"Create, investigate, CAPA, review, and close quality events within your authorized scope.", query:"quality event investigation CAPA closure", context:"quality", anyPermission:["quality_event.read"] },
  { key:"equipment", label:"Equipment operations", description:"Review equipment status, qualification, calibration, maintenance, service, and evidence.", query:"equipment qualification calibration maintenance service", context:"laboratory", anyPermission:["equipment.read"] },
  { key:"reporting", label:"Reporting & analytics", description:"Generate, finalize, and export governed reports according to your permissions.", query:"reporting finalize export", context:"reporting", anyPermission:["report.read"] },
  { key:"administration", label:"Administration", description:"Configure tenant access, document controls, retention, workflows, and other authorized settings.", query:"administration access configuration workflow retention", context:"administration", anyPermission:["administration.manage"] },
];

function permissionSet(context: AuthorizationContext) {
  return new Set(context.grants.map((grant) => grant.permission));
}

export function helpRecommendations(context: AuthorizationContext, pageContext = "help"): HelpRecommendation[] {
  if (context.userState !== "ACTIVE") return [];
  const permissions = permissionSet(context);
  const allowed = definitions.filter((item) => item.anyPermission.some((permission) => permissions.has(permission)));
  return [...allowed].sort((a,b) => {
    const aContext = a.context === pageContext ? 0 : 1;
    const bContext = b.context === pageContext ? 0 : 1;
    if (aContext !== bContext) return aContext - bContext;
    return a.label.localeCompare(b.label);
  }).map(({ anyPermission: _permissions, ...item }) => item);
}
