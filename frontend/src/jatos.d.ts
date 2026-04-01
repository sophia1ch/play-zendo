/**
 * Type declarations for jatos.js (https://www.jatos.io)
 * jatos.js is injected by the JATOS server at runtime — not bundled.
 * When running outside JATOS (local dev), window.jatos is undefined.
 */
declare global {
  interface Window {
    jatos?: Jatos;
  }
}

interface Jatos {
  /** Unique ID for this worker (participant). */
  workerId: number;
  /** URL query parameters passed by JATOS to this component. */
  urlQueryParameters: Record<string, string>;
  /** Data shared across all components of this study run. */
  studySessionData: Record<string, unknown>;

  /**
   * Submit result data for the current component.
   * Returns a Promise that resolves when data is saved.
   */
  submitResultData(data: string | object): Promise<void>;

  /** Finish current component and start the next one. */
  startNextComponent(): void;

  /** End the study. */
  endStudy(successful?: boolean): void;

  /** Called by JATOS when the component is ready to start. */
  onLoad(callback: () => void): void;
}

export {};
