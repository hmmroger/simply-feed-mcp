export interface FeedConfig {
  feedUrl: string;
}

export interface FeedConfigProvider {
  getConfigs(): Promise<FeedConfig[]>;
}
