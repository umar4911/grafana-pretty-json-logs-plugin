// Only the standalone visual preview aliases Grafana runtime to this shim.
// Production webpack builds always use Grafana's real runtime.
export const config = { appSubUrl: "", theme2: { isDark: true } };
export const getDataSourceSrv = () => ({ getList: () => [] });
export const getBackendSrv = () => ({
  fetch: () => {
    throw new Error("Live queries require Grafana.");
  },
});
