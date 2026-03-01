export function routeFromHash(defaultRoute = "dashboard") {
  const raw = (window.location.hash || `#/${defaultRoute}`).replace(/^#\//, "");
  const route = raw.split("?")[0].split("/")[0].trim();
  return route || defaultRoute;
}

export function ensureRoute(route, routes, defaultRoute = "dashboard") {
  return routes.find((r) => r[0] === route) ? route : defaultRoute;
}

export function setHashRoute(route) {
  window.location.hash = `#/${route}`;
}
