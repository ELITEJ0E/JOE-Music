/**
 * Track Permissions and Content Capabilities System
 * Enforces ownership rules, content licensing, and studio editing rights.
 */

export type TrackOwnershipType =
  | "USER_CREATED"
  | "USER_UPLOADED"
  | "USER_GENERATED"
  | "JOE_CATALOG"
  | "PROTECTED_ARTIST"
  | "REMIXABLE_CATALOG";

export interface TrackCapabilities {
  canPlay: boolean;
  canDownload: boolean;
  canOpenInStudio: boolean;
  canRemix: boolean;
  canSeparateStems: boolean;
  canExport: boolean;
  canEdit: boolean;
  ownershipType: TrackOwnershipType;
  protectionNotice?: string;
  badgeLabel?: string;
}

/**
 * Known protected catalog artist identifiers
 */
const PROTECTED_ARTISTS = new Set([
  "ELITEJOE",
  "JOEL",
  "JOEL'S ORIGINALS",
  "JOE MUSIC",
  "SUNO",
]);

/**
 * Evaluates track metadata and ownership to determine exact capabilities
 */
export function getTrackCapabilities(track: any, user?: any): TrackCapabilities {
  if (!track) {
    return {
      canPlay: false,
      canDownload: false,
      canOpenInStudio: false,
      canRemix: false,
      canSeparateStems: false,
      canExport: false,
      canEdit: false,
      ownershipType: "PROTECTED_ARTIST",
      protectionNotice: "Audio asset unavailable.",
      badgeLabel: "Unavailable",
    };
  }

  // 1. Explicitly tagged ownership type
  const explicitType: TrackOwnershipType | undefined = track.ownershipType || track.capabilities?.ownershipType;
  if (explicitType === "USER_CREATED" || explicitType === "USER_UPLOADED" || explicitType === "USER_GENERATED") {
    return {
      canPlay: true,
      canDownload: true,
      canOpenInStudio: true,
      canRemix: true,
      canSeparateStems: true,
      canExport: true,
      canEdit: true,
      ownershipType: explicitType,
      badgeLabel: "Your Creation",
    };
  }

  // 2. Explicitly marked remixable catalog track
  if (track.isRemixable || explicitType === "REMIXABLE_CATALOG") {
    return {
      canPlay: true,
      canDownload: false,
      canOpenInStudio: true,
      canRemix: true,
      canSeparateStems: true,
      canExport: false,
      canEdit: false,
      ownershipType: "REMIXABLE_CATALOG",
      badgeLabel: "Remixable",
      protectionNotice: "This track is available for creative remixing in JOE Studio.",
    };
  }

  // 3. User local recordings, daw projects, or uploaded blobs
  if (track.isUserRecording || track.audioBlob instanceof Blob || track.isUserCreated) {
    return {
      canPlay: true,
      canDownload: true,
      canOpenInStudio: true,
      canRemix: true,
      canSeparateStems: true,
      canExport: true,
      canEdit: true,
      ownershipType: "USER_CREATED",
      badgeLabel: "User Track",
    };
  }

  // 4. Check if artist matches protected catalog
  const artistNormalized = (track.artist || "").trim().toUpperCase();
  const isProtectedArtist =
    PROTECTED_ARTISTS.has(artistNormalized) ||
    Boolean(track.sunoId) ||
    Boolean(track.clipId) ||
    Boolean(track.streamUrl?.includes("/api/suno-audio"));

  if (isProtectedArtist || explicitType === "JOE_CATALOG" || explicitType === "PROTECTED_ARTIST") {
    return {
      canPlay: true,
      canDownload: false,
      canOpenInStudio: false,
      canRemix: false,
      canSeparateStems: false,
      canExport: false,
      canEdit: false,
      ownershipType: "JOE_CATALOG",
      badgeLabel: "JOE Catalog",
      protectionNotice:
        "Protected JOE artist composition. Streaming and chord extraction are enabled. Multi-track DAW editing and raw stem downloads are restricted to original user creations.",
    };
  }

  // Default fallback: Protected artist content
  return {
    canPlay: true,
    canDownload: false,
    canOpenInStudio: false,
    canRemix: false,
    canSeparateStems: false,
    canExport: false,
    canEdit: false,
    ownershipType: "JOE_CATALOG",
    badgeLabel: "Catalog Track",
    protectionNotice: "Stream-only catalog track. To edit audio in JOE Studio, create or record your own tracks.",
  };
}

export function canTrackOpenInStudio(track: any, user?: any): boolean {
  return getTrackCapabilities(track, user).canOpenInStudio;
}

export function canTrackDownload(track: any, user?: any): boolean {
  return getTrackCapabilities(track, user).canDownload;
}
