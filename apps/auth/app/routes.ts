import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("api/health", "routes/api.health.ts"),
  route("api/me", "routes/api.me.ts"),
  route("api/me/photo", "routes/api.me.photo.ts"),
  route("api/auth/apple", "routes/api.auth.apple.ts"),
  route("api/auth/apple/callback", "routes/api.auth.apple.callback.ts"),
] satisfies RouteConfig;
