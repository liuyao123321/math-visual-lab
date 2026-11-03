declare module "plotly.js-basic-dist-min" {
  const Plotly: {
    react: (element: HTMLElement, data: unknown[], layout: object, config: object) => Promise<void>;
    purge: (element: HTMLElement) => void;
    Plots: { resize: (element: HTMLElement) => void };
  };
  export default Plotly;
}

declare module "plotly.js-gl3d-dist-min" {
  import Plotly from "plotly.js-basic-dist-min";
  export default Plotly;
}
