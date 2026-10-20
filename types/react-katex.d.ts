declare module "react-katex" {
  import type { ComponentType, ReactNode } from "react";

  type MathComponentProps = {
    children?: string;
    math?: string;
    errorColor?: string;
    renderError?: (error: Error) => ReactNode;
  };

  export const BlockMath: ComponentType<MathComponentProps>;
  export const InlineMath: ComponentType<MathComponentProps>;
}
