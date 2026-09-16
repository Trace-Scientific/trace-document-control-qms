import type { NextRequest } from "next/server";
import { authenticatePlatformRequest } from "./authenticated-request";
import {
  SUPPORT_SESSION_COOKIE,
  SupportAccessService,
  type SupportSessionContext,
} from "./support-access";
import type { PlatformAuthorizationContext } from "./authorization";

const service = new SupportAccessService();

export interface AuthenticatedSupportRequest {
  platform: PlatformAuthorizationContext;
  support: SupportSessionContext;
}

export async function authenticateSupportTenantRequest(
  request: NextRequest,
): Promise<AuthenticatedSupportRequest> {
  const platform = await authenticatePlatformRequest(request);
  const rawToken = request.cookies.get(SUPPORT_SESSION_COOKIE)?.value;
  const support = await service.authenticateSession(platform, rawToken);
  return { platform, support };
}
