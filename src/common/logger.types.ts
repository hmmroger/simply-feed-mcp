export interface ILogger {
  debug(message: string): void;
  info(message: string): void;
  warning(message: string): void;
  error(message: string, error?: unknown): void;
  createLogger(name: string): ILogger;
}
