import { defineApp } from "convex/server";
import tasquencerAudit from "./components/audit/src/component/convex.config";
import tasquencerAuthorization from "./components/authorization/src/component/convex.config";

const app = defineApp();

app.use(tasquencerAudit);
app.use(tasquencerAuthorization);

export default app;
