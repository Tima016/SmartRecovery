import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    CreateBucketCommand,
    HeadBucketCommand,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
    private readonly logger = new Logger(MinioService.name);
    private client: S3Client;

    constructor(private configService: ConfigService) {
        const endpoint = configService.get<string>('MINIO_ENDPOINT', 'localhost');
        const port = configService.get<number>('MINIO_PORT', 9000);
        const useSSL = configService.get<string>('MINIO_USE_SSL', 'false') === 'true';

        this.client = new S3Client({
            endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
            region: 'us-east-1',
            credentials: {
                accessKeyId: configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
                secretAccessKey: configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
            },
            forcePathStyle: true,
        });
    }

    async onModuleInit() {
        await this.ensureBuckets();
        this.logger.log('MinIO buckets initialized');
    }

    /** Public method so HealthService can verify MinIO is accessible */
    async ensureBuckets(): Promise<void> {
        const buckets = [
            this.configService.get<string>('MINIO_EVIDENCE_BUCKET', 'dfip-evidence'),
            this.configService.get<string>('MINIO_REPORTS_BUCKET', 'dfip-reports'),
        ];
        for (const bucket of buckets) {
            await this.ensureBucketExists(bucket);
        }
    }

    private async ensureBucketExists(bucket: string) {
        try {
            await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch {
            await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
            this.logger.log(`Created MinIO bucket: ${bucket}`);
        }
    }

    /**
     * Upload a readable stream to MinIO using multipart upload
     */
    async uploadStream(
        bucket: string,
        key: string,
        stream: Readable,
        contentType: string,
        metadata?: Record<string, string>,
    ): Promise<{ etag: string }> {
        const upload = new Upload({
            client: this.client,
            params: {
                Bucket: bucket,
                Key: key,
                Body: stream,
                ContentType: contentType,
                Metadata: metadata,
            },
        });
        const result = await upload.done();
        return { etag: result.ETag || '' };
    }

    /**
     * Upload a buffer to MinIO
     */
    async uploadBuffer(
        bucket: string,
        key: string,
        buffer: Buffer,
        contentType: string,
        metadata?: Record<string, string>,
    ): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                Metadata: metadata,
            }),
        );
    }

    /**
     * Get a readable stream from MinIO
     */
    async getStream(bucket: string, key: string): Promise<Readable> {
        const resp = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return resp.Body as Readable;
    }

    /**
     * Get a buffer from MinIO
     */
    async getBuffer(bucket: string, key: string): Promise<Buffer> {
        const stream = await this.getStream(bucket, key);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    /**
     * Delete an object
     */
    async deleteObject(bucket: string, key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }

    /**
     * Get object metadata
     */
    async getObjectMeta(bucket: string, key: string) {
        return this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    }
}
