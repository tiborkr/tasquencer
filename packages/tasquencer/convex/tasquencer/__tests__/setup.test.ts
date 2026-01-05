/// <reference types="vite/client" />

import { test } from "vitest";
import { convexTest } from "convex-test";
import type { MutationCtx } from "../../_generated/server";
import schema from "../../schema";
import { makeBuilder } from "../builder";
import { register } from "../../components/audit/src/setup.test";

export const modules = import.meta.glob("../../**/*.*s");

export function setup() {
  const modulesWithoutComponents = Object.fromEntries(
    Object.entries(modules).filter(
      ([key]) => !key.startsWith("../../components")
    )
  );
  const t = convexTest(schema, modulesWithoutComponents);
  register(t, "tasquencerAudit");
  return t;
}

const InitialBuilder = makeBuilder<MutationCtx>();

export const noOpWorkItem = InitialBuilder.workItem(
  "tasquencer/no-op-work-item"
);
export const noOpTask = InitialBuilder.task(noOpWorkItem);

export const Builder = {
  ...InitialBuilder,
  noOpWorkItem,
  noOpTask,
};

test("setup", () => {});
