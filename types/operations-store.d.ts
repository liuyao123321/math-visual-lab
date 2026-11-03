declare module "@operations-store" {
  export function getOperationsStore(): Promise<import("../lib/operations/contract").OperationsStore>;
  export function getOperationsConfig(): Promise<import("../lib/operations/contract").OperationsConfig | null>;
}
