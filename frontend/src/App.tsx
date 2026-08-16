import { createBrowserRouter, RouterProvider } from "react-router";
import { appRoutes } from "./routes/appRoutes";

const appRouter = createBrowserRouter(appRoutes);

function App() {
  return (
    <div>
      <RouterProvider router={appRouter} />
    </div>
  );
}

export default App;
