import { Redirect } from "expo-router";

// Old sign-in links pointed here. Send them to the start, which picks sign-in or the app.
export default function AuthRedirect() {
  return <Redirect href="/" />;
}
