// Only the standalone visual preview aliases Grafana runtime to this shim.
// Production webpack builds always use Grafana's real runtime.
import { of } from "rxjs";
import { demoLogs } from "../src/demo";

export const config = { appSubUrl: "", theme2: { isDark: true } };
export const getDataSourceSrv = () => ({
  getList: () => [{ uid: "preview-loki", name: "Loki" }],
});
export const getBackendSrv = () => ({
  fetch: () => {
    const entries = demoLogs(Date.now(), 15);
    return of({
      data: {
        status: "success",
        data: {
          resultType: "streams",
          result: entries.map((entry) => ({
            stream: entry.labels,
            values: [
              [String(BigInt(entry.timestamp) * 1000000n), entry.raw] as [
                string,
                string,
              ],
            ],
          })),
        },
      },
    });
  },
});
