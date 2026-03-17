import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter
        onError={(error, { location }) => {
          console.error("[router]", { error, path: location?.pathname });
        }}
      />
    </StrictMode>,
  );
});

// Defer web-vitals to not block hydration
setTimeout(() => {
  import("web-vitals").then(({ onLCP, onINP, onCLS }) => {
    onLCP(console.log);
    onINP(console.log);
    onCLS(console.log);
  });
}, 0);
