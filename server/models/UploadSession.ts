import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IUploadSession extends Document {
  token: string;
  /** Absent for guest sessions - their photos never persist server-side. */
  userId?: Types.ObjectId;
  isGuest: boolean;
  countryId: string;
  countryName: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const uploadSessionSchema = new Schema<IUploadSession>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isGuest: {
      type: Boolean,
      default: false,
    },
    countryId: {
      type: String,
      required: true,
      trim: true,
    },
    countryName: {
      type: String,
      default: '',
      trim: true,
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

// MongoDB TTL: session documents are removed automatically once expired.
uploadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UploadSession: Model<IUploadSession> =
  mongoose.models.UploadSession ??
  mongoose.model<IUploadSession>('UploadSession', uploadSessionSchema);
