export function routeFromHash(defaultRoute = "dashboard") {
  return (window.location.hash || `#/${defaultRoute}`).replace(/^#\//, "");
}

export function ensureRoute(route, routes, defaultRoute = "dashboard") {
  return routes.find((r) => r[0] === route) ? route : defaultRoute;
}

export function setHashRoute(route) {
  window.location.hash = `#/${route}`;
}
