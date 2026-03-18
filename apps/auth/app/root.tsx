import {
  Form,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import globalCss from "~/styles/global.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: globalCss },
];

export function headers() {
  return {
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const isAuthenticated = cookieHeader.includes("adakrpos_session=");
  return { isAuthenticated };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<typeof loader>("root");
  const isAuthenticated = data?.isAuthenticated ?? false;

  return (
    <div className="app-container">
      <header className="site-header">
        <div className="header-inner">
          <NavLink to="/" prefetch="intent" className="site-logo">
            PORTAL
          </NavLink>
          <nav className="site-nav" aria-label="Main navigation">
            {isAuthenticated ? (
              <>
                <NavLink
                  to="/mypage"
                  prefetch="intent"
                  className={({ isActive }) =>
                    `nav-link${isActive ? " active" : ""}`
                  }
                >
                  마이페이지
                </NavLink>
                <NavLink
                  to="/developer"
                  prefetch="intent"
                  className={({ isActive }) =>
                    `nav-link${isActive ? " active" : ""}`
                  }
                >
                  개발자 포털
                </NavLink>
                <Form
                  method="post"
                  action="/api/auth/logout"
                  style={{ display: "inline" }}
                >
                  <button type="submit" className="nav-link nav-link-logout">
                    로그아웃
                  </button>
                </Form>
              </>
            ) : (
              <NavLink
                to="/login"
                prefetch="intent"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                로그인
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>
          본 서비스는 구성원이 만든 비공식 서비스이며,
          <br />
          Apple Developer Academy @ POSTECH와 공식적인 관련이 없습니다.
        </p>
      </footer>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div className="app-container">
          <header className="site-header">
            <div className="header-inner">
              <NavLink to="/" prefetch="intent" className="site-logo">
                PORTAL
              </NavLink>
            </div>
          </header>
          <main className="main-content">
            <div className="error-page">
              <h1>페이지를 찾을 수 없습니다</h1>
              <p>요청하신 페이지가 존재하지 않습니다.</p>
              <NavLink to="/" prefetch="intent" className="btn btn-primary">
                홈으로 돌아가기
              </NavLink>
            </div>
          </main>
          <footer className="site-footer">
            <p>
              본 서비스는 구성원이 만든 비공식 서비스이며,
              <br />
              Apple Developer Academy @ POSTECH와 공식적인 관련이 없습니다.
            </p>
          </footer>
        </div>
      );
    }

    return (
      <div className="app-container">
        <header className="site-header">
          <div className="header-inner">
            <NavLink to="/" prefetch="intent" className="site-logo">
              PORTAL
            </NavLink>
          </div>
        </header>
        <main className="main-content">
          <div className="error-page">
            <h1>오류가 발생했습니다</h1>
            <p>요청을 처리하는 중에 오류가 발생했습니다.</p>
            <NavLink to="/" prefetch="intent" className="btn btn-primary">
              홈으로 돌아가기
            </NavLink>
          </div>
        </main>
        <footer className="site-footer">
          <p>
            본 서비스는 구성원이 만든 비공식 서비스이며,
            <br />
            Apple Developer Academy @ POSTECH와 공식적인 관련이 없습니다.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="site-header">
        <div className="header-inner">
          <NavLink to="/" prefetch="intent" className="site-logo">
            PORTAL
          </NavLink>
        </div>
      </header>
      <main className="main-content">
        <div className="error-page">
          <h1>오류가 발생했습니다</h1>
          <p>예상치 못한 오류가 발생했습니다.</p>
          <NavLink to="/" prefetch="intent" className="btn btn-primary">
            홈으로 돌아가기
          </NavLink>
        </div>
      </main>
      <footer className="site-footer">
        <p>
          본 서비스는 구성원이 만든 비공식 서비스이며,
          <br />
          Apple Developer Academy @ POSTECH와 공식적인 관련이 없습니다.
        </p>
      </footer>
    </div>
  );
}
