import { createBrowserRouter, RouterProvider } from "react-router";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { appRoutes } from "./routes/appRoutes";

const appRouter = createBrowserRouter(appRoutes);

function App() {
  // Above the router, not inside a route component: a component that unmounts
  // on navigation would re-fire /me on every route change.
  useAuthBootstrap();
  return (
    <div>
      <RouterProvider router={appRouter} />
    </div>
  );
}

export default App;
