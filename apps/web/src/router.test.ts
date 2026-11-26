import { matchRoutes, type RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "./router";

const leafRoute = (path: string) => matchRoutes(routes, path)?.at(-1)?.route;

function allPaths(list: RouteObject[]): string[] {
  return list.flatMap((route) => [route.path ?? "", ...allPaths(route.children ?? [])]);
}

describe("route table", () => {
  it.each([
    ["/en/profiles", "profiles"],
    ["/ar/onboarding/child", "onboarding/child"],
    ["/ar/today", "today"],
    ["/en/lesson", "lesson"],
    ["/ar/maintenance", "maintenance"],
    ["/en/sign-in", "sign-in"],
    ["/ar/sign-up", "sign-up"],
    ["/en/dashboard/tasks", "tasks"],
    ["/ar/dashboard/profile", "profile"],
    ["/en/dashboard/add-child", "add-child"],
  ])("opens %s", (url, path) => {
    expect(leafRoute(url)?.path).toBe(path);
  });

  it("shows log in and sign up in one page, without the site header", () => {
    const parents = (url: string) => matchRoutes(routes, url)?.map((match) => match.route) ?? [];
    const page = (url: string) => parents(url).find((route) => route.handle);
    expect(page("/en/sign-in")).toBeDefined();
    expect(page("/en/sign-in")).toBe(page("/en/sign-up"));
    expect(page("/en/sign-in")?.handle).toEqual({ bare: true });
  });

  it("shows the lesson journey on its own, without the site header", () => {
    expect(leafRoute("/ar/lesson")?.handle).toEqual({ bare: true });
  });

  it("opens the dashboard home at /dashboard", () => {
    expect(leafRoute("/en/dashboard")?.index).toBe(true);
  });

  it("opens the landing page at the language root", () => {
    expect(leafRoute("/ar")?.index).toBe(true);
    expect(leafRoute("/en")?.index).toBe(true);
  });

  it("sends unknown paths under a language to the catch-all", () => {
    expect(leafRoute("/ar/does/not/exist")?.path).toBe("*");
  });

  it("keeps data out of URLs: the language is the only dynamic segment", () => {
    expect(allPaths(routes).filter((path) => path.includes(":"))).toEqual([":locale"]);
  });
});
