import { cookies, headers } from "next/headers";
import LifeAtlas from "./components/LifeAtlas";
import VisitorSession from "./components/VisitorSession";
import { VISITOR_SESSION_COOKIE } from "./lib/visitor-session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const host = (requestHeaders.get("host") || requestHeaders.get("x-forwarded-host") || "localhost").split(":")[0].toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const authenticated = Boolean(requestHeaders.get("oai-authenticated-user-id"));
  const hasVisitorSession = Boolean(cookieStore.get(VISITOR_SESSION_COOKIE)?.value);
  return <VisitorSession initialReady={local || authenticated || hasVisitorSession}><LifeAtlas /></VisitorSession>;
}
