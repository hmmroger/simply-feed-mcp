import { TableClient, TableEntity, TableEntityResult, TransactionAction, ListTableEntitiesOptions } from "@azure/data-tables";
import { ILogger } from "../common/logger.types.js";
import { DataEntity, TableReadWriter } from "./table-read-writer.types.js";
import { isString } from "es-toolkit";
import { isNumber } from "es-toolkit/compat";

interface DataRecordEntity {
  isProto: boolean;
  dataChunks: number;
  [K: `dataChunk_${number}`]: Uint8Array | undefined;
  [J: `extra_${string}`]: string | number;
}

// Azure table limis:
//   - batch size
//   - row size is 1MB
const BATCH_SIZE = 100;
const CHUNK_SIZE = 64000;
const MAX_CHUNKS_COUNT = 15;

export class AzureTableReadWriter implements TableReadWriter {
  private tableClient: TableClient;
  private tableCreated: boolean;
  private createTablePromise: Promise<void> | undefined;

  constructor(private readonly logger: ILogger, connectionString: string, tableName: string) {
    this.tableClient = TableClient.fromConnectionString(connectionString, tableName);
    this.tableCreated = false;
  }

  public async getObject<T>(key: string, partition: string): Promise<T | undefined> {
    await this.createTable();
    const entity = await this.tableClient.getEntity<DataRecordEntity>(partition, key);
    const object = this.deserializeObject<T>(entity);
    return object;
  }

  public async getAllObjects<T>(top?: number, skip?: number): Promise<T[]> {
    await this.createTable();
    const totalReqCount = (skip || 0) + (top || 0);
    const objects: T[] = [];
    for await (const entity of this.tableClient.listEntities<DataRecordEntity>()) {
      const object = this.deserializeObject<T>(entity);
      object && objects.push(object);

      if (totalReqCount && objects.length >= totalReqCount) {
        break;
      }
    }

    const results = objects.slice(skip || 0);
    return top ? results.slice(0, top) : results;
  }

  public async queryObjects<T>(filter: string, partition?: string, top?: number, skip?: number): Promise<T[]> {
    await this.createTable();
    const objects: T[] = [];

    // Build the final filter by combining partition filter with supplied filter
    let finalFilter = filter;
    if (partition) {
      const partitionFilter = `PartitionKey eq '${partition}'`;
      if (filter && filter.trim()) {
        finalFilter = `${partitionFilter} and (${filter})`;
      } else {
        finalFilter = partitionFilter;
      }
    }

    const queryOptions: ListTableEntitiesOptions = {
      queryOptions: { filter: finalFilter },
    };

    for await (const entity of this.tableClient.listEntities<DataRecordEntity>(queryOptions)) {
      const object = this.deserializeObject<T>(entity);
      if (object) {
        objects.push(object);
      }
    }

    const results = objects.slice(skip || 0);
    return top ? results.slice(0, top) : results;
  }

  public async writeObject<T extends DataEntity>(data: T, partition: string, extraProps?: string[], isProtoBuf?: boolean): Promise<void> {
    await this.createTable();
    if (!data) {
      throw new Error("writeObject: undefined or null data.");
    }

    const entity = await this.createTableEntity(data, partition, extraProps, isProtoBuf);
    await this.tableClient.upsertEntity(entity, "Replace");
  }

  public async writeObjects<T extends DataEntity>(
    data: T[],
    partition: string,
    extraProps?: string[],
    isProtoBuf?: boolean
  ): Promise<void> {
    await this.createTable();
    if (!data || data.length === 0) {
      return;
    }

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const entities = await Promise.all(batch.map((item) => this.createTableEntity(item, partition, extraProps, isProtoBuf)));
      const transactionActions: TransactionAction[] = entities.map((entity) => [
        "upsert",
        // the SDK does not make have generic TransactionAction typing
        entity as unknown as TableEntity<Record<string, unknown>>,
        "Replace",
      ]);

      await this.tableClient.submitTransaction(transactionActions);
      this.logger.debug(`Successfully wrote batch of ${entities.length} entities to partition ${partition}`);
    }
  }

  public async deleteObject(key: string, partition: string): Promise<void> {
    await this.createTable();
    await this.tableClient.deleteEntity(partition, key);
    this.logger.debug(`Successfully deleted entity with key ${key} from partition ${partition}`);
  }

  public async deleteObjects(keys: string[], partition: string): Promise<void> {
    await this.createTable();
    if (!keys || keys.length === 0) {
      return;
    }

    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const transactionActions: TransactionAction[] = batch.map((key) => [
        "delete",
        { partitionKey: partition, rowKey: key } as TableEntity<Record<string, unknown>>,
      ]);

      await this.tableClient.submitTransaction(transactionActions);
      this.logger.debug(`Successfully deleted batch of ${batch.length} entities from partition ${partition}`);
    }
  }

  private async createTableEntity<T extends DataEntity>(
    data: T,
    partition: string,
    extraProps?: string[],
    isProtoBuf?: boolean
  ): Promise<TableEntity<DataRecordEntity>> {
    if (isProtoBuf) {
      throw new Error("Not implemented.");
    }

    const jsonData = JSON.stringify(data);
    const serializedData = new TextEncoder().encode(jsonData);
    if (!serializedData.byteLength) {
      throw new Error("0-length data.");
    }

    const totalChunks = Math.floor((serializedData.byteLength + CHUNK_SIZE - 1) / CHUNK_SIZE);
    if (totalChunks > MAX_CHUNKS_COUNT) {
      throw new Error(`entity data too large, chunks: ${totalChunks} size: ${serializedData.byteLength}`);
    }

    const tableEntity: TableEntity<DataRecordEntity> = {
      partitionKey: partition,
      rowKey: data.id,
      dataChunks: totalChunks,
      isProto: !!isProtoBuf,
    };

    for (let i = 0; i < totalChunks; i++) {
      const chunk = serializedData.slice(i * CHUNK_SIZE, Math.min(serializedData.byteLength, (i + 1) * CHUNK_SIZE));
      tableEntity[`dataChunk_${i}`] = chunk;
    }

    if (extraProps && extraProps.length) {
      for (const extraProp of extraProps) {
        const value = (data as unknown as Record<string, unknown>)[extraProp];
        if (value) {
          tableEntity[`extra_${extraProp}`] = isString(value) || isNumber(value) ? value : JSON.stringify(value);
        }
      }
    }

    return tableEntity;
  }

  private deserializeObject<T>(entity: TableEntityResult<DataRecordEntity>, _protoBufType?: string): T | undefined {
    const isProtoBuf = entity.isProto;
    const chunksCount = entity.dataChunks;
    if (isProtoBuf === undefined || chunksCount === undefined || typeof chunksCount !== "number") {
      this.logger.error(`format error, data chunks or isProto keys not found: Partition: ${entity.partitionKey}, Key: ${entity.rowKey}`);
      return undefined;
    }

    // Reconstruct the serialized data from chunks
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    for (let i = 0; i < chunksCount; i++) {
      const chunk = entity[`dataChunk_${i}`] as Uint8Array | undefined;
      if (!chunk || !(chunk instanceof Uint8Array)) {
        this.logger.error(`format error, data chunk ${i} not found! Partition: ${entity.partitionKey}, Key: ${entity.rowKey}`);
        return undefined;
      }

      chunks.push(chunk);
      totalLength += chunk.length;
    }

    // Combine all chunks into a single Uint8Array
    const serializedData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      serializedData.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      if (isProtoBuf === true) {
        throw new Error("Not implemented.");
      }

      const jsonData = new TextDecoder("utf-8").decode(serializedData);
      return JSON.parse(jsonData) as T;
    } catch (error) {
      this.logger.error(`deserializeObject: deserialization failed: Partition: ${entity.partitionKey}, Key: ${entity.rowKey}`, error);
      return undefined;
    }
  }

  private async createTable(): Promise<void> {
    if (this.tableCreated) {
      return;
    }

    if (this.createTablePromise) {
      return this.createTablePromise;
    }

    try {
      this.createTablePromise = this.tableClient.createTable();
      await this.createTablePromise;
      this.tableCreated = true;
    } finally {
      this.createTablePromise = undefined;
    }

    return;
  }
}
