import mongoose, { Schema, type Document, type Model } from 'mongoose';

/**
 * Short-lived relay storage for guest QR uploads: the phone drops photos
 * here, the guest's desktop browser pulls them into IndexedDB and deletes
 * them. Anything unclaimed is removed by the TTL index.
 */
export interface IPendingPhoto extends Document {
  sessionToken: string;
  data: Buffer;
  contentType: string;
  size: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pendingPhotoSchema = new Schema<IPendingPhoto>(
  {
    sessionToken: {
      type: String,
      required: true,
    },
    data: {
      type: Buffer,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

pendingPhotoSchema.index({ sessionToken: 1 });
pendingPhotoSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingPhoto: Model<IPendingPhoto> =
  mongoose.models.PendingPhoto ??
  mongoose.model<IPendingPhoto>('PendingPhoto', pendingPhotoSchema);
