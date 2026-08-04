import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

let cachedClient: S3Client | null = null;

function getRegion(): string {
  const region = process.env.AWS_REGION;

  if (!region) {
    throw new Error('AWS_REGION is not defined');
  }

  return region;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET is not defined');
  }

  return bucket;
}

function getClient(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({ region: getRegion() });
  }

  return cachedClient;
}

/** Public URL for an uploaded object (CloudFront/base URL if configured). */
export function getPhotoObjectUrl(key: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL;

  if (base) {
    return `${base.replace(/\/+$/, '')}/${key}`;
  }

  return `https://${getBucket()}.s3.${getRegion()}.amazonaws.com/${key}`;
}

export async function putPhotoObject(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

export async function deletePhotoObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
}
