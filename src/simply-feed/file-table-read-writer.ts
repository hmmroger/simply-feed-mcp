import { promises as fs } from "fs";
import { join, dirname, normalize } from "path";
import { ILogger } from "../common/logger.types.js";
import { DataEntity, TableReadWriter } from "./table-read-writer.types.js";
import { isString } from "es-toolkit";
import { isNumber } from "es-toolkit/compat";

interface StoredEntity {
  id: string;
  partition: string;
  data: unknown;
  timestamp: number;
  dirty?: boolean;
}

interface DataStore {
  version: number;
  lastModified: number;
  entities: Record<string, Record<string, StoredEntity>>; // partition -> key -> entity
}

export class FileTableReadWriter implements TableReadWriter {
  private dataFilePath: string;
  private dataStore: DataStore;
  private fileLoaded: boolean;
  private loadPromise: Promise<void> | undefined;
  private isWriting: boolean;

  constructor(private readonly logger: ILogger, dataFilePath: string) {
    this.dataFilePath = normalize(dataFilePath);
    this.dataStore = {
      version: 1,
      lastModified: Date.now(),
      entities: {},
    };
    this.fileLoaded = false;
    this.isWriting = false;
  }

  public async getObject<T>(key: string, partition: string): Promise<T | undefined> {
    await this.ensureLoaded();

    const partitionData = this.dataStore.entities[partition];
    if (!partitionData) {
      return undefined;
    }

    const entity = partitionData[key];
    return entity ? (entity.data as T) : undefined;
  }

  public async getAllObjects<T>(top?: number, skip?: number): Promise<T[]> {
    await this.ensureLoaded();

    const allEntities: StoredEntity[] = [];
    for (const partitionData of Object.values(this.dataStore.entities)) {
      for (const entity of Object.values(partitionData)) {
        allEntities.push(entity);
      }
    }

    allEntities.sort((a, b) => b.timestamp - a.timestamp);

    const startIndex = skip || 0;
    const endIndex = top ? startIndex + top : undefined;
    const selectedEntities = allEntities.slice(startIndex, endIndex);

    return selectedEntities.map((entity) => entity.data as T);
  }

  public async queryObjects<T>(filter: string, partition?: string, top?: number, skip?: number): Promise<T[]> {
    await this.ensureLoaded();

    let entities: StoredEntity[] = [];

    // Collect entities from dataStore
    if (partition) {
      const partitionData = this.dataStore.entities[partition];
      if (partitionData) {
        entities = Object.values(partitionData);
      }
    } else {
      // Collect from all partitions
      for (const partitionData of Object.values(this.dataStore.entities)) {
        entities.push(...Object.values(partitionData));
      }
    }

    if (filter && filter.trim()) {
      entities = this.applyFilter(entities, filter);
    }

    entities.sort((a, b) => b.timestamp - a.timestamp);

    const startIndex = skip || 0;
    const endIndex = top ? startIndex + top : undefined;
    const selectedEntities = entities.slice(startIndex, endIndex);

    return selectedEntities.map((entity) => entity.data as T);
  }

  public async writeObject<T extends DataEntity>(
    data: T,
    partition: string,
    _extraProps?: string[],
    isProtoBuf?: boolean,
    skipWrite?: boolean
  ): Promise<void> {
    await this.ensureLoaded();

    if (!data) {
      throw new Error("writeObject: undefined or null data.");
    }

    if (isProtoBuf) {
      throw new Error("Protocol Buffers not implemented in file storage.");
    }

    const storedEntity: StoredEntity = {
      id: data.id,
      partition: partition,
      data: data,
      timestamp: Date.now(),
      dirty: true,
    };

    if (!this.dataStore.entities[partition]) {
      this.dataStore.entities[partition] = {};
    }
    this.dataStore.entities[partition][data.id] = storedEntity;

    !skipWrite && (await this.writeToDisk());
  }

  public async writeObjects<T extends DataEntity>(
    data: T[],
    partition: string,
    extraProps?: string[],
    isProtoBuf?: boolean
  ): Promise<void> {
    await this.ensureLoaded();

    if (!data || data.length === 0) {
      return;
    }

    if (isProtoBuf) {
      throw new Error("Protocol Buffers not implemented in file storage.");
    }

    // Process all objects
    for (const item of data) {
      await this.writeObject(item, partition, extraProps, isProtoBuf, true);
    }

    await this.writeToDisk();
  }

  public async deleteObject(key: string, partition: string): Promise<void> {
    await this.ensureLoaded();

    const partitionData = this.dataStore.entities[partition];
    if (!partitionData) {
      this.logger.debug(`Partition ${partition} not found`);
      return;
    }

    const deleted = delete partitionData[key];
    if (Object.keys(partitionData).length === 0) {
      delete this.dataStore.entities[partition];
    }

    if (deleted) {
      await this.writeToDisk();
      this.logger.debug(`Successfully removed object with key ${key} from partition ${partition}`);
    } else {
      this.logger.debug(`Object with key ${key} from partition ${partition} not found`);
    }
  }

  public async deleteObjects(keys: string[], partition: string): Promise<void> {
    await this.ensureLoaded();

    if (!keys || keys.length === 0) {
      return;
    }

    const partitionData = this.dataStore.entities[partition];
    if (!partitionData) {
      this.logger.debug(`Partition ${partition} not found`);
      return;
    }

    let deletedCount = 0;
    for (const key of keys) {
      if (delete partitionData[key]) {
        deletedCount++;
      }
    }

    if (Object.keys(partitionData).length === 0) {
      delete this.dataStore.entities[partition];
    }

    if (deletedCount > 0) {
      await this.writeToDisk();
      this.logger.debug(`Successfully removed ${deletedCount} objects from partition ${partition}`);
    }
  }

  // Public method to get storage statistics
  public getStats(): { totalEntities: number; dirtyEntities: number; partitions: number } {
    let totalEntities = 0;
    let dirtyEntities = 0;
    const partitionCount = Object.keys(this.dataStore.entities).length;

    for (const partitionData of Object.values(this.dataStore.entities)) {
      for (const entity of Object.values(partitionData)) {
        totalEntities++;
        if (entity.dirty) {
          dirtyEntities++;
        }
      }
    }

    return {
      totalEntities,
      dirtyEntities,
      partitions: partitionCount,
    };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.fileLoaded) {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    try {
      this.loadPromise = this.loadFromDisk();
      await this.loadPromise;
      this.fileLoaded = true;
    } finally {
      this.loadPromise = undefined;
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      await this.ensureDirectory();
      const fileContent = await fs.readFile(this.dataFilePath, "utf-8");
      this.dataStore = JSON.parse(fileContent) as DataStore;
      for (const partitionData of Object.values(this.dataStore.entities)) {
        for (const entity of Object.values(partitionData)) {
          entity.dirty = false;
        }
      }

      const totalEntities = this.getStats().totalEntities;
      this.logger.debug(`Loaded ${totalEntities} entities from disk`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.debug("Data file does not exist, starting with empty store");
        this.dataStore = {
          version: 1,
          lastModified: Date.now(),
          entities: {},
        };
      } else {
        this.logger.error("Failed to load data from disk", error);
        throw error;
      }
    }
  }

  private async writeToDisk(): Promise<void> {
    if (this.isWriting) {
      return;
    }

    this.isWriting = true;

    try {
      this.dataStore.lastModified = Date.now();
      let totalEntities = 0;

      for (const partitionData of Object.values(this.dataStore.entities)) {
        for (const entity of Object.values(partitionData)) {
          totalEntities++;
          entity.dirty = false;
        }
      }

      await this.ensureDirectory();

      // Write to temporary file first, then rename for atomic operation
      const tempFilePath = this.dataFilePath + ".tmp";
      await fs.writeFile(tempFilePath, JSON.stringify(this.dataStore, null, 2), "utf-8");
      await fs.rename(tempFilePath, this.dataFilePath);

      this.logger.debug(`Successfully wrote ${totalEntities} entities to disk`);
    } catch (error) {
      this.logger.error("Failed to write data to disk", error);
      throw error;
    } finally {
      this.isWriting = false;
    }
  }

  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.dataFilePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  // only supports simply-feed-manager.ts use case
  private applyFilter(entities: StoredEntity[], filter: string): StoredEntity[] {
    const extraPropNumberMatch = filter.match(/extra_(\w+)\s+(\w+)\s+([0-9]+)L/i);
    if (extraPropNumberMatch) {
      const [, property, op, value] = extraPropNumberMatch;
      const numValue = Number(value);
      return entities.filter((entity) => {
        const entityData = entity.data as Record<string, unknown> | undefined;
        const propValue = entityData && entityData[property];
        if (!isNumber(propValue)) {
          return false;
        }

        switch (op) {
          case "eq":
            return propValue === numValue;

          case "ge":
            return propValue >= numValue;

          case "gt":
            return propValue > numValue;

          case "le":
            return propValue <= numValue;

          case "lt":
            return propValue < numValue;

          default:
            return false;
        }
      });
    }

    const extraPropMatch = filter.match(/extra_(\w+)\s+eq\s+'([^']+)/i);
    if (extraPropMatch) {
      const [, property, value] = extraPropMatch;
      return entities.filter((entity) => {
        const entityData = entity.data as Record<string, unknown> | undefined;
        const propValue = entityData && entityData[property];
        if (!isString(propValue)) {
          return false;
        }

        return propValue === value;
      });
    }

    return [];
  }
}
