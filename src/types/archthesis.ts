/**
 * Type definitions for archthesis meme data (Firestore `memes` collection)
 * and the mapped cuboid-studio input format.
 *
 * Source: https://github.com/iddonaim/archthesis — src/types/meme.ts
 */

export interface ArchthesisMemeLocation {
  latitude: number;
  longitude: number;
  display_name: string;
}

export interface ArchthesisMeme {
  id: string;                       // e.g. "meme-1707234567890-abc123def456"
  imageUrl: string;                 // Firebase Storage URL to the JPEG
  topText: string;                  // Top text overlay
  bottomText: string;               // Bottom text overlay
  memeText?: string;                // Combined searchable text from all text boxes
  description?: string;             // User-provided description
  tags: string[];                   // e.g. ["architecture", "urban"]
  location?: ArchthesisMemeLocation;
  username?: string;                // Creator's name
  likes: number;                    // Like count
  timestamp: string;                // ISO date string (createdAt)
  userId?: string;                  // Firebase UID
  hidden?: boolean;                 // Admin visibility control
  originSource?: string;            // QR code tracking origin
}

/** The shape returned by /api/fetch-memes */
export interface FetchMemesResponse {
  memes: ArchthesisMeme[];
  hasMore: boolean;
}

/** The shape returned by /api/fetch-meme-by-id */
export interface FetchMemeByIdResponse {
  meme: ArchthesisMeme;
  cuboidInput: CuboidMemeInput;
}

/** Pre-mapped input ready for the pataphysical translation pipeline */
export interface CuboidMemeInput {
  memeDescription: string;
  locationTag: string | null;
  engagementLevel: number;          // 0-100
}
