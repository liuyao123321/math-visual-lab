declare module "plotly.js-basic-dist-min" {
  const Plotly: {
    react: (element: HTMLElement, data: unknown[], layout: object, config: object) => Promise<void>;
    purge: (element: HTMLElement) => void;
    Plots: { resize: (element: HTMLElement) => void };
  };
  export default Plotly;
}
