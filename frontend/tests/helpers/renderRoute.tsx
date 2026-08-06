import type { ReactElement, ReactNode } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useLocation, useRoutes } from "react-router-dom";
import { render } from "@testing-library/react";

import { appRoutes } from "@/routes/appRoutes";

import authReducer from "@/redux/authSlice";
import jobReducer from "@/redux/jobSlice";
import companyReducer from "@/redux/companySlice";
import applicationReducer from "@/redux/applicationSlice";
import { PortalScope } from "@/components/theme/PortalScope";

/**
 * A fresh store per render.
 *
 * Deliberately NOT the app's store from `@/redux/store`: that one is wrapped in
 * redux-persist and rehydrates from localStorage, so a test that dispatched a
 * signed-in user would leak it into every subsequent test in the run and the
 * failures would depend on file order. Same reducers, no persistence.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      job: jobReducer,
      company: companyReducer,
      application: applicationReducer,
    },
  });
}

/**
 * Renders `ui` at `route` inside the providers the app actually mounts.
 *
 * PortalScope is included deliberately: most assertions in this suite are about
 * what the portal resolves to for a given URL, and that is exactly what it
 * computes. `path` defaults to `route` so a caller testing a static URL need
 * not repeat it; pass it explicitly for parameterised routes.
 */
export function renderRoute(
  ui: ReactElement,
  {
    route,
    path,
    store = makeStore(),
  }: { route: string; path?: string; store?: ReturnType<typeof makeStore> },
) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <PortalScope>
          <Routes>
            <Route path={path ?? route} element={ui} />
          </Routes>
        </PortalScope>
      </MemoryRouter>
    </Provider>,
  );
}

function RouteTable() {
  return useRoutes(appRoutes);
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc" data-pathname={pathname} data-search={search} />;
}

/**
 * Mounts the app's real route table at `entry`.
 *
 * Use this when the assertion is about routing itself — that a path is mounted,
 * that it redirects, that a guard intercepts it. For a single component's
 * behaviour, `renderRoute` is lighter.
 *
 * `useRoutes` under a plain MemoryRouter rather than `createMemoryRouter`: the
 * data router builds a `Request` per navigation, and jsdom's `AbortSignal` is
 * not the type undici checks against, so every redirect throws before it
 * resolves. The route table is the same object either way.
 */
export function renderAppAt(entry: string, { store = makeStore() } = {}) {
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <RouteTable />
        <LocationProbe />
      </MemoryRouter>
    </Provider>,
  );
  const probe = () => view.getByTestId("loc");
  return {
    ...view,
    pathname: () => probe().getAttribute("data-pathname"),
    search: () => probe().getAttribute("data-search"),
  };
}

/** Reads the resolved portal from the nearest PortalScope wrapper. */
export function portalOf(container: HTMLElement): string | null {
  return container.querySelector("[data-portal]")?.getAttribute("data-portal") ?? null;
}

export function Probe({ children }: { children?: ReactNode }) {
  return <div data-testid="probe">{children}</div>;
}
