import { getSessionUser } from "./auth";
import { getChatGPTUser } from "./chatgpt-auth";
import { AuthPortal } from "./AuthPortal";
import { HappyKitchenApp } from "./HappyKitchenApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, chatgptUser] = await Promise.all([getSessionUser(), getChatGPTUser()]);
  if (!user) return <AuthPortal chatgptAvailable={Boolean(chatgptUser)} />;
  return <HappyKitchenApp displayName={user.displayName} role={user.role} />;
}

