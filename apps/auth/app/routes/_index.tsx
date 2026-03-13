import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { optionalAuth } from "~/middleware/auth.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const auth = await optionalAuth(request, context);
  if (auth.isAuthenticated) {
    throw redirect("/mypage");
  }
  throw redirect("/login");
}

export default function Index() {
  return null;
}
