import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MyTrainingWorkspace } from "@/components/my-training-workspace";
import { db } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/security/crypto";
import { validateSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";

export default async function MyTrainingPage() {
  const token = (await cookies()).get("qms_session")?.value;
  if (!token) redirect("/login");
  const session = await db.session.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { user: true },
  });
  if (!session || !validateSession(token, session).valid || session.user.status !== "ACTIVE") redirect("/login");
  return <main className="module-section-stack"><MyTrainingWorkspace /></main>;
}
