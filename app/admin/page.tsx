import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";
import AdminDashboard from "./AdminDashboard";
import "./admin.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("host") || requestHeaders.get("x-forwarded-host") || "localhost").split(":")[0].toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const user = await getChatGPTUser();
  if (!local && !user) redirect(chatGPTSignInPath("/admin"));

  return <AdminDashboard initialIdentity={{ displayName: local ? "本地管理员" : user?.displayName || "管理员", email: local ? "local@life-atlas" : user?.email || "", local }} />;
}
