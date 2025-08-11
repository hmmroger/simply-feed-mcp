import { ILogger } from "./logger.types.js";

export class ConsoleLogger implements ILogger {
  private moduleName: string;
  constructor(moduleName?: string, private readonly useErrorOutput?: boolean) {
    this.moduleName = moduleName || "";
  }

  public debug(message: string): void {
    if (process.env.NODE_ENV !== "production") {
      const timestamp = new Date().toISOString();
      const output = `[DEBUG] [${timestamp}]: ${message}`;
      this.useErrorOutput ? console.error(output) : console.log(output);
    }
  }

  public info(message: string): void {
    const timestamp = new Date().toISOString();
    const output = `[INFO] [${timestamp}]: ${this.moduleName ? this.moduleName + ": " : ""}${message}`;
    this.useErrorOutput ? console.error(output) : console.log(output);
  }

  public warning(message: string): void {
    const timestamp = new Date().toISOString();
    console.warn(`[WARNING] [${timestamp}]: ${this.moduleName ? this.moduleName + ": " : ""}${message}`);
  }

  public error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] [${timestamp}]: ${this.moduleName ? this.moduleName + ": " : ""}${message}`, error);
  }

  public createLogger(name: string): ILogger {
    return new ConsoleLogger(name, this.useErrorOutput);
  }
}
