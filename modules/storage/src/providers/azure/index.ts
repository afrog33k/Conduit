import { IStorageProvider, StorageConfig } from '../../interfaces';
import {
  BlobSASPermissions,
  BlobSASSignatureValues,
  BlobServiceClient,
  SASProtocol,
} from '@azure/storage-blob';
import fs from 'fs';
import ConduitGrpcSdk from '@conduitplatform/grpc-sdk';
import { streamToBuffer } from '../../utils';

export class AzureStorage implements IStorageProvider {
  _activeContainer: string = '';
  private _storage: BlobServiceClient;

  constructor(options: StorageConfig) {
    this._storage = BlobServiceClient.fromConnectionString(
      options.azure.connectionString,
    );
  }

  async deleteContainer(name: string): Promise<boolean | Error> {
    const t = await this._storage.getContainerClient(name).deleteIfExists();
    ConduitGrpcSdk.Metrics?.decrement('containers_total');
    return t.succeeded;
  }

  async deleteFolder(name: string): Promise<boolean | Error> {
    const exists = await this.folderExists(name);
    if (!exists) return false;
    ConduitGrpcSdk.Logger.log('Folder found');

    ConduitGrpcSdk.Logger.log('Getting blobs list..');
    const containerClient = await this._storage.getContainerClient(this._activeContainer);
    ConduitGrpcSdk.Logger.log('Deleting blobs...');
    let i = 0;
    for await (const blob of containerClient.listBlobsFlat()) {
      if (
        blob.name.indexOf(name) !== -1 &&
        blob.name.split(name)[1].indexOf('/') === -1
      ) {
        i++;
        await containerClient.deleteBlob(blob.name);
      }
    }
    ConduitGrpcSdk.Logger.log(`${i} blobs deleted.`);
    ConduitGrpcSdk.Metrics?.increment('folders_total');
    return true;
  }

  /**
   * Used to create a new folder
   * @param name For the folder
   */
  async createFolder(name: string): Promise<boolean | Error> {
    const containerClient = await this._storage.getContainerClient(this._activeContainer);
    await containerClient.createIfNotExists();

    const exists = await containerClient.getBlockBlobClient(name + '.keep.txt').exists();

    if (exists) {
      return true;
    }
    await containerClient
      .getBlockBlobClient(name + '.keep.txt')
      .uploadData(Buffer.from('DO NOT DELETE'));
    ConduitGrpcSdk.Metrics?.increment('folders_total');
    return true;
  }

  async folderExists(name: string): Promise<boolean | Error> {
    const containerClient = await this._storage.getContainerClient(this._activeContainer);
    let exists = await containerClient.exists();
    if (!exists) return false;

    exists = await containerClient.getBlockBlobClient(name + '.keep.txt').exists();

    return exists;
  }

  /**
   * Used to switch the current bucket.
   * Ex. storage.bucket('photos').file('test')
   * @param name For the bucket
   */
  container(name: string): IStorageProvider {
    this._activeContainer = name;
    return this;
  }

  async delete(fileName: string): Promise<boolean | Error> {
    await this._storage
      .getContainerClient(this._activeContainer)
      .getBlockBlobClient(fileName)
      .deleteIfExists();
    return true;
  }

  async exists(fileName: string): Promise<boolean | Error> {
    const containerExists = await this._storage
      .getContainerClient(this._activeContainer)
      .exists();
    if (!containerExists) return false;
    await this._storage
      .getContainerClient(this._activeContainer)
      .getBlockBlobClient(fileName)
      .exists();
    return true;
  }

  async get(fileName: string, downloadPath?: string): Promise<any | Error> {
    const promise = await this._storage
      .getContainerClient(this._activeContainer)
      .getBlockBlobClient(fileName)
      .download(0);
    const data: Buffer = await streamToBuffer(promise.readableStreamBody);
    if (downloadPath) {
      fs.writeFileSync(downloadPath, data);
    }
    return data;
  }

  async getSignedUrl(fileName: string): Promise<any | Error> {
    const containerClient = this._storage.getContainerClient(this._activeContainer);
    const sasOptions: BlobSASSignatureValues = {
      containerName: containerClient.containerName,
      blobName: fileName,
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000),
      permissions: BlobSASPermissions.parse('r'),
    };
    return containerClient.getBlobClient(fileName).generateSasUrl(sasOptions);
  }

  async getPublicUrl(fileName: string): Promise<any | Error> {
    const containerClient = this._storage.getContainerClient(this._activeContainer);
    const sasOptions: BlobSASSignatureValues = {
      containerName: containerClient.containerName,
      blobName: fileName,
      protocol: SASProtocol.Https,
      expiresOn: new Date(new Date().setFullYear(new Date().getFullYear() + 99)),
      permissions: BlobSASPermissions.parse('r'),
    };

    return containerClient.getBlobClient(fileName).generateSasUrl(sasOptions);
  }

  async store(
    fileName: string,
    data: any,
    isPublic: boolean = false,
  ): Promise<boolean | Error> {
    await this._storage
      .getContainerClient(this._activeContainer)
      .getBlockBlobClient(fileName)
      .upload(data, Buffer.byteLength(data));
    return true;
  }

  async rename(currentFilename: string, newFilename: string): Promise<boolean | Error> {
    // await this._storage.getContainerClient(this._activeContainer).getBlockBlobClient(currentFilename).move(newFilename);
    // return true;
    throw new Error('Not Implemented yet!');
  }

  async moveToFolder(filename: string, newFolder: string): Promise<boolean | Error> {
    // let newBucketFile = this._storage.getContainerClient(newFolder).file(filename)
    // await this._storage.getContainerClient(this._activeContainer).file(filename).move(newBucketFile);
    // return true;
    throw new Error('Not Implemented yet!');
  }

  async moveToFolderAndRename(
    currentFilename: string,
    newFilename: string,
    newFolder: string,
  ): Promise<boolean | Error> {
    // let newBucketFile = this._storage.getContainerClient(newFolder).file(newFilename)
    // await this._storage.getContainerClient(this._activeContainer).file(currentFilename).move(newBucketFile);
    // return true;
    throw new Error('Not Implemented yet!');
  }

  async containerExists(name: string): Promise<boolean | Error> {
    return await this._storage.getContainerClient(name).exists();
  }

  async createContainer(name: string): Promise<boolean | Error> {
    await this._storage.getContainerClient(name).createIfNotExists();
    this._activeContainer = name;
    ConduitGrpcSdk.Metrics?.increment('containers_total');
    return true;
  }

  async moveToContainer(
    filename: string,
    newContainer: string,
  ): Promise<boolean | Error> {
    throw new Error('Not Implemented yet!');
  }

  async moveToContainerAndRename(
    currentFilename: string,
    newFilename: string,
    newContainer: string,
  ): Promise<boolean | Error> {
    throw new Error('Not Implemented yet!');
  }
}
