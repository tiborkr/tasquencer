/// <reference types="vite/client" />

import { test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { register } from "../../components/authorization/src/setup.test";

export const modules = import.meta.glob("../../**/*.*s");

export function setup() {
  const t = convexTest(schema, modules);
  register(t, "tasquencerAuthorization");
  return t;
}
test("setup", () => {});
