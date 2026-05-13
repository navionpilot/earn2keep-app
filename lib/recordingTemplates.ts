// =============================================================================
// lib/recordingTemplates.ts — Setup template knowledge base (Slice 5.7.4)
// =============================================================================
// Each `setup_template_key` on a challenge maps to a human-readable
// label, a one-line description, and a list of step-by-step setup
// instructions a player can follow. Used by the player's recording
// page (/home/record/[eventChallengeId]) to render a "📱 Phone setup"
// panel BEFORE the recording form, so kids actually know what to do.
//
// Coaches pick the template_key when creating a challenge. The 9 keys
// here mirror the values used in components/ChallengeLibraryModal.tsx
// and app/challenges/new/page.tsx — keep them in sync if either side
// adds a new template.
//
// Adding a new template: add the key to this map, plus the same key to
// TEMPLATE_ICONS in ChallengeLibraryModal, and to the radio options on
// the challenge-create form.
// =============================================================================

export interface RecordingTemplate {
  /** Single emoji used as the panel icon. */
  icon: string;
  /** Short human label — shown as the panel heading. */
  label: string;
  /** One-line "when to use this" blurb. */
  description: string;
  /** Step-by-step bullets the player follows to set up. */
  instructions: string[];
  /** Quick "what counts" / "what doesn't" pointers for the recording. */
  whatCounts?: string[];
}

export const RECORDING_TEMPLATES: Record<string, RecordingTemplate> = {
  side_angle_floor: {
    icon: "📱",
    label: "Side angle, phone on the floor",
    description:
      "For floor-based challenges where we need to see your full body from the side — push-ups, sit-ups, planks, burpees, etc.",
    instructions: [
      "Set your phone on the floor about 6–8 feet to your side.",
      "Tilt the phone up slightly so your whole body fits in the frame head-to-toe.",
      "Use landscape orientation (turn the phone sideways).",
      "Make sure the floor area where you'll be doing reps is well-lit.",
      "Start recording, then walk back to your starting position.",
    ],
    whatCounts: [
      "Reps where your full body is visible from start to finish.",
      "If your body leaves the frame, that rep won't be counted.",
    ],
  },

  selfie_audio: {
    icon: "🤳",
    label: "Selfie mode, audio matters",
    description:
      "For challenges where what's heard counts — speaking, singing, reading aloud, playing an instrument.",
    instructions: [
      "Use the front camera (selfie mode).",
      "Hold the phone at arm's length OR prop it against something stable so it doesn't shake.",
      "Find a quiet space — turn off TVs, fans, music in the background.",
      "Speak clearly and project — pretend the phone is at the back of the room.",
      "Keep your face fully in the frame the whole time.",
    ],
    whatCounts: [
      "Audio that's clear enough to understand without straining.",
      "If background noise drowns out your voice, it may not be approved.",
    ],
  },

  behind_player_target: {
    icon: "🎯",
    label: "Camera behind you, looking at the target",
    description:
      "For aiming challenges — shooting hoops, taking shots on goal, archery, dart throws.",
    instructions: [
      "Place the phone behind you on a tripod, chair, or stack of books — about head-height.",
      "Frame the shot so both YOU and the TARGET (hoop, goal, etc.) are visible.",
      "Use landscape orientation.",
      "Step into your starting position so we can see you AND where the ball/object lands.",
      "Take all your attempts in a row — don't pause and resume.",
    ],
    whatCounts: [
      "Makes/hits that we can see land in the target.",
      "If the target leaves the frame, those attempts can't be verified.",
    ],
  },

  top_down_closeup: {
    icon: "🔍",
    label: "Top-down close-up",
    description:
      "For detailed hand-skill challenges — card tricks, knot tying, puzzle solving, art technique.",
    instructions: [
      "Mount the phone above your work surface (a stack of books works) looking straight down.",
      "Make sure your hands and the work area are well-lit — overhead light is best.",
      "Use landscape orientation if possible.",
      "Start recording before you begin and don't move the phone mid-attempt.",
      "Work at a steady pace — quick movements may blur on the recording.",
    ],
    whatCounts: [
      "Steps that are clearly visible and complete.",
      "If your hands cover the work, that step may not count.",
    ],
  },

  gps_with_endpoints: {
    icon: "📍",
    label: "GPS or distance challenge",
    description:
      "For running, walking, biking, or any timed/distance activity — usually paired with a fitness app screenshot.",
    instructions: [
      "Start your fitness/GPS app (Strava, Apple Fitness, Google Fit, etc.) before you begin.",
      "Quickly record a video showing the START location and time.",
      "After you finish, record a second video at the END location.",
      "Take a screenshot of your fitness app's results (distance, time, route).",
      "Submit either the screenshot OR a short video showing the app results.",
    ],
    whatCounts: [
      "Verifiable start + end + total distance/time.",
      "Without the screenshot, partial credit may apply.",
    ],
  },

  photo_completion: {
    icon: "📷",
    label: "Photo of completed work",
    description:
      "For challenges where you submit ONE photo, not a video — finished homework, completed art, books read, chores done.",
    instructions: [
      "Take a clear, well-lit photo of the finished work.",
      "Make sure the whole thing fits in the frame.",
      "Avoid glare or shadows that hide details.",
      "Include any required label (your name, date, page numbers, etc.) if your coach asked for it.",
      "You can submit a single image instead of a video on the upload screen.",
    ],
  },

  wide_angle_court: {
    icon: "🏟",
    label: "Wide-angle of the full court/field",
    description:
      "For team-style or full-field challenges — drills, scrimmages, full-court sprints.",
    instructions: [
      "Position the phone where it can see the WHOLE play area.",
      "Higher is better — the bleachers, a fence top, or a tripod up high.",
      "Use landscape orientation.",
      "Have a buddy or coach hold the phone steady — handheld is OK if a tripod isn't available.",
      "Start recording before the drill begins so the start is captured.",
    ],
    whatCounts: [
      "Plays that are clearly visible end-to-end.",
      "Out-of-frame action can't be counted toward the total.",
    ],
  },

  selfie_with_object: {
    icon: "✋",
    label: "Selfie + object",
    description:
      "For challenges where YOU and an OBJECT both need to be visible — completed art, finished book, trophy, etc.",
    instructions: [
      "Use the front camera (selfie mode).",
      "Hold the object up next to your face so we can see both.",
      "Find good lighting — natural daylight works best.",
      "Hold the camera steady and keep your face + the object in frame.",
      "Optionally say what you're showing and your name out loud.",
    ],
  },

  custom: {
    icon: "✏️",
    label: "Custom recording",
    description:
      "Your organizer has set custom recording instructions for this challenge — see below.",
    instructions: [
      "Read your coach's instructions carefully (they appear right below this panel).",
      "If anything is unclear, ask your coach before recording.",
      "When in doubt: stable phone, good lighting, full body or work area visible.",
    ],
  },
};

/** Generic safety-net tips that apply to any recording, regardless of template. */
export const GENERAL_RECORDING_TIPS: string[] = [
  "🔆 Good lighting — face a window or overhead light, never backlight.",
  "📐 Stable camera — use a tripod, lean against a wall, or have a buddy hold it.",
  "🎬 Hit record BEFORE you start, stop AFTER you finish — give yourself a buffer.",
  "📁 File size up to 100 MB. A few minutes at normal phone quality is fine.",
  "🔄 Phone usually goes in landscape (turn it sideways) unless told otherwise.",
];

/**
 * Look up the template for a given key. Returns null if the key isn't
 * known — caller should fall back to GENERAL_RECORDING_TIPS only.
 */
export function getRecordingTemplate(
  key: string | null | undefined
): RecordingTemplate | null {
  if (!key) return null;
  return RECORDING_TEMPLATES[key] ?? null;
}
