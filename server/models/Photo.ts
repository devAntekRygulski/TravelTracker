import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IPhoto extends Document {
  userId: Types.ObjectId;
  countryId: string;
  s3Key: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const photoSchema = new Schema<IPhoto>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    countryId: {
      type: String,
      required: true,
      trim: true,
    },
    s3Key: {
      type: String,
      required: true,
    },
    url: {
      type: String,
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
  },
  {
    timestamps: true,
  },
);

photoSchema.index({ userId: 1, countryId: 1 });

export const Photo: Model<IPhoto> =
  mongoose.models.Photo ?? mongoose.model<IPhoto>('Photo', photoSchema);
