import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const hasSession = cookieHeader.includes("adakrpos_session=");
  if (hasSession) {
    throw redirect("/mypage");
  }
  throw redirect("/login");
}

export default function Index() {
  return null;
}
