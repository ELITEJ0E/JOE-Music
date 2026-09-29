import { DAWProject, DAWTrack, AudioClip } from "../types";

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
 * Known protected catalog artist identifiers & prefixes
 */
const PROTECTED_CATALOG_ARTISTS = new Set([
  "ELITEJOE",
  "JOEL",
  "JOEL'S ORIGINALS",
  "JOE MUSIC",
  "SUNO",
]);

/**
 * Evaluates track metadata and trusted catalog state to determine frontend track capabilities.
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

  // 1. Explicitly authenticated user-owned track
  const isOwner = user && track.userId && user.id === track.userId;
  if (isOwner) {
    return {
      canPlay: true,
      canDownload: true,
      canOpenInStudio: true,
      canRemix: true,
      canSeparateStems: true,
      canExport: true,
      canEdit: true,
      ownershipType: "USER_CREATED",
      badgeLabel: "Your Track",
    };
  }

  // 2. Explicitly marked remixable catalog track
  if (track.isRemixable || track.ownershipType === "REMIXABLE_CATALOG") {
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

  // 3. User local live recording session or local browser creation
  if (track.isUserRecording || track.audioBlob instanceof Blob) {
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

  // 4. Catalog / Protected Artists (Joel / ELITEJOE / Suno Catalog)
  const artistNormalized = (track.artist || "").trim().toUpperCase();
  const isProtected =
    PROTECTED_CATALOG_ARTISTS.has(artistNormalized) ||
    Boolean(track.sunoId) ||
    Boolean(track.clipId) ||
    Boolean(track.streamUrl?.includes("/api/suno-audio")) ||
    (typeof track.id === "string" && (track.id.startsWith("suno-") || track.id.startsWith("trk-")));

  if (isProtected || track.ownershipType === "JOE_CATALOG" || track.ownershipType === "PROTECTED_ARTIST") {
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
        "Protected Joel/JOE artist composition. Streaming and chord analysis are enabled. Direct downloads and stem exports are restricted.",
    };
  }

  // 5. Default fallback
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

/**
 * Authoritative server-side capability evaluator.
 * Does not blindly trust client claims.
 */
export function getServerTrackCapabilities(asset: any, authenticatedUser?: any): TrackCapabilities {
  if (!asset) {
    return {
      canPlay: false,
      canDownload: false,
      canOpenInStudio: false,
      canRemix: false,
      canSeparateStems: false,
      canExport: false,
      canEdit: false,
      ownershipType: "PROTECTED_ARTIST",
      protectionNotice: "Asset not found",
    };
  }

  // If user is verified creator/owner in database
  if (authenticatedUser?.id && asset.ownerId === authenticatedUser.id) {
    return {
      canPlay: true,
      canDownload: true,
      canOpenInStudio: true,
      canRemix: true,
      canSeparateStems: true,
      canExport: true,
      canEdit: true,
      ownershipType: "USER_CREATED",
    };
  }

  // Check against server-side protected catalog allowlist
  const artistUpper = (asset.artist || "").trim().toUpperCase();
  const isCatalog =
    PROTECTED_CATALOG_ARTISTS.has(artistUpper) ||
    Boolean(asset.sunoId) ||
    Boolean(asset.clipId) ||
    String(asset.id || "").startsWith("suno-") ||
    String(asset.id || "").startsWith("trk-");

  if (isCatalog) {
    return {
      canPlay: true,
      canDownload: false,
      canOpenInStudio: false,
      canRemix: false,
      canSeparateStems: false,
      canExport: false,
      canEdit: false,
      ownershipType: "JOE_CATALOG",
      protectionNotice: "Protected Joel / JOE catalog content.",
    };
  }

  return {
    canPlay: true,
    canDownload: false,
    canOpenInStudio: false,
    canRemix: false,
    canSeparateStems: false,
    canExport: false,
    canEdit: false,
    ownershipType: "JOE_CATALOG",
  };
}

/**
 * Validates whether a project is legally and technically allowed to be exported.
 * Checks all tracks and clips for protected catalog sources.
 */
export function isProjectExportAllowed(project: DAWProject): {
  allowed: boolean;
  reason?: string;
  protectedTracks: string[];
} {
  if (!project || !project.tracks || project.tracks.length === 0) {
    return { allowed: true, protectedTracks: [] };
  }

  const protectedTracks: string[] = [];

  for (const track of project.tracks) {
    for (const clip of track.clips || []) {
      const isProtected =
        clip.sourceType === "PROTECTED_CATALOG" ||
        clip.sourceOwnershipType === "JOE_CATALOG" ||
        clip.sourceOwnershipType === "PROTECTED_ARTIST" ||
        (clip.sourceAssetId && (clip.sourceAssetId.startsWith("suno-") || clip.sourceAssetId.startsWith("trk-")));

      if (isProtected) {
        protectedTracks.push(track.name || `Track ${track.id}`);
        break;
      }
    }
  }

  if (protectedTracks.length > 0) {
    return {
      allowed: false,
      reason: `This project contains protected catalog audio on ${protectedTracks.join(", ")} and cannot be exported to master or stems.`,
      protectedTracks,
    };
  }

  return {
    allowed: true,
    protectedTracks: [],
  };
}
