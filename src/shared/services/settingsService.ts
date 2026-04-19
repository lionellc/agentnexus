import type { RuntimeFlags, RuntimeFlagsInput } from "../types";

import { invokeCommand } from "./tauriClient";

export const settingsService = {
  runtimeFlagsGet(): Promise<RuntimeFlags> {
    return invokeCommand("runtime_flags_get");
  },

  runtimeFlagsUpdate(input: RuntimeFlagsInput): Promise<RuntimeFlags> {
    return invokeCommand("runtime_flags_update", { input });
  },
};
