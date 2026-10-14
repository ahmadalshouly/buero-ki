import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

// Old sign-in links pointed here. Send them on to sign-in or into the app.
export default function AuthRedirect() {
  const { signedIn } = useSession();
  return <Redirect href={signedIn ? "/" : "/sign-in"} />;
}
