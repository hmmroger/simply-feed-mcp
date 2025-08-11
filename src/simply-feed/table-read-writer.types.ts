export interface DataEntity {
  id: string;
}

export interface TableReadWriter {
  getObject<T>(key: string, partition: string): Promise<T | undefined>;

  getAllObjects<T>(top?: number, skip?: number): Promise<T[]>;

  queryObjects<T>(filter: string, partition?: string, top?: number, skip?: number): Promise<T[]>;

  writeObject<T extends DataEntity>(data: T, partition: string, extraProps?: string[], isProtoBuf?: boolean): Promise<void>;

  writeObjects<T extends DataEntity>(data: T[], partition: string, extraProps?: string[], isProtoBuf?: boolean): Promise<void>;

  deleteObject(key: string, partition: string): Promise<void>;

  deleteObjects(keys: string[], partition: string): Promise<void>;
}
