import { redirect } from "next/navigation";
import { getSessionUser } from "../auth";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN") redirect("/");
  return <AdminDashboard currentName={user.displayName} />;
}

