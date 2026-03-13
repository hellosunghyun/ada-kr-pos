import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("api/health", "routes/api.health.ts"),
  route("api/me", "routes/api.me.ts"),
  route("api/me/photo", "routes/api.me.photo.ts"),
  route("api/verify/send", "routes/api.verify.send.ts"),
  route("api/verify/confirm", "routes/api.verify.confirm.ts"),
  route("api/auth/apple", "routes/api.auth.apple.ts"),
  route("api/auth/apple/callback", "routes/api.auth.apple.callback.ts"),
  route("api/auth/magic/send", "routes/api.auth.magic.send.ts"),
  route("api/auth/magic/verify", "routes/api.auth.magic.verify.ts"),
  route("api/auth/logout", "routes/api.auth.logout.ts"),
] satisfies RouteConfig;
