/// <reference types="vite/client" />

import { test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";

export const modules = import.meta.glob("../../**/*.*s");

export function setup() {
  return convexTest(schema, modules);
}
test("setup", () => {});
