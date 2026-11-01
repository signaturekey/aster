import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SessionProvider } from "@web/app/session";
import { AppRouter } from "@web/app/router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: "always" },
    // Retrying arbitrary writes can duplicate effects after an ambiguous response.
    mutations: { retry: false },
  },
});

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <SessionProvider>
        <AppRouter />
      </SessionProvider>
    ),
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
