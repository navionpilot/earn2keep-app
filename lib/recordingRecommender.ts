// Rules-based recording setup recommender for earn²keep challenges.
//
// Given a challenge's category, subcategory, unit, and name, this module
// returns a recommended recording template + filled-in instructions text.
//
// The output drives the "Recording & Verification" section of the
// Create Custom Challenge form. Coaches see the recommendation,
// can accept it or click Customize to edit.
//
// Future: Path B (real AI call to Claude API) can be added as a
// fallback for cases where this rules engine isn't confident.

export type RecordingTemplate = {
  key: string;
  label: string;
  icon: string; // emoji shown on library cards
  shortDescription: string; // 1-line summary
  instructions: string; // multi-paragraph instructional text
  audioRequired: boolean;
  recommendedVerificationMode: "ai_only" | "coach_only" | "ai_and_coach";
};

export const RECORDING_TEMPLATES: Record<string, RecordingTemplate> = {
  side_angle_floor: {
    key: "side_angle_floor",
    label: "Side angle, floor level",
    icon: "📱",
    shortDescription: "Side view, full body horizontal in frame",
    instructions: `Phone position: Place your phone on the floor or a low surface to your side, propped up so the camera is at roughly mid-height of your body during the exercise.

Framing: Full body horizontal in frame — your head should be on one side, your feet on the other. Make sure the chest is clearly visible going up and down.

Lighting: Even, indirect light is best. Avoid backlighting from windows or doorways behind you.

Audio: Not required for this challenge — visual count only.

Verification: The AI will count each rep by detecting your body position. Full range of motion must be visible to count.`,
    audioRequired: false,
    recommendedVerificationMode: "ai_and_coach",
  },

  selfie_audio: {
    key: "selfie_audio",
    label: "Selfie / front camera with clear audio",
    icon: "🤳",
    shortDescription: "Front camera, face visible, quiet room",
    instructions: `Phone position: Hold the phone in front of you (selfie / front camera mode), about arm's length away. Or prop it up so your face is clearly framed.

Framing: Your face should be centered in the frame and well-lit. Camera at eye level works best.

Lighting: Face the light source — natural daylight from a window or a lamp in front of you. Avoid having the light behind you.

Audio: Required and critical. Find a quiet room. No background music, no other people talking. Speak clearly and steadily.

Verification: The AI will use speech-to-text to verify what you say matches the expected content. Mumbling or fast speech will reduce accuracy.`,
    audioRequired: true,
    recommendedVerificationMode: "ai_and_coach",
  },

  behind_player_target: {
    key: "behind_player_target",
    label: "Behind player, target visible",
    icon: "🎯",
    shortDescription: "Camera behind/beside player with target in frame",
    instructions: `Phone position: Set the phone up behind or beside you, framing both you and the target (hoop, goal, target, etc.) in the same shot.

Framing: Both you AND the target must be visible in the same frame. The camera should capture each attempt from start to finish.

Lighting: Even lighting on the target. If outdoors, avoid pointing the camera into the sun.

Audio: Not required — visual count only.

Verification: The AI will track each attempt and detect successful makes vs misses. The target needs to be clearly visible the whole time.`,
    audioRequired: false,
    recommendedVerificationMode: "ai_and_coach",
  },

  top_down_closeup: {
    key: "top_down_closeup",
    label: "Top-down close-up",
    icon: "🔍",
    shortDescription: "Phone overhead, hands and work surface in view",
    instructions: `Phone position: Mount or hold your phone overhead, looking down at your work surface. A small tripod or a stack of books works well.

Framing: Your hands and the object you're working on should fill most of the frame. No need to show your face.

Lighting: Bright, even lighting on the work surface. Avoid casting shadows with your hands.

Audio: Not required.

Verification: The AI checks the final result. Make sure the completed work is clearly visible at the end.`,
    audioRequired: false,
    recommendedVerificationMode: "coach_only",
  },

  gps_with_endpoints: {
    key: "gps_with_endpoints",
    label: "GPS-tracked with start/end photos",
    icon: "📍",
    shortDescription: "Selfie at start, run, selfie at end",
    instructions: `This challenge uses GPS tracking. You don't need to record continuously — just check in at the start and end.

At the start: Take a selfie at your starting location. The app will record your GPS position automatically.

During the activity: Keep the app open in the background. It will track your route and pace.

At the end: Take another selfie at your endpoint. The app will calculate your distance and time.

Audio: Not required.

Verification: GPS data + start/end timestamps confirm completion. Make sure location services are enabled.`,
    audioRequired: false,
    recommendedVerificationMode: "ai_and_coach",
  },

  photo_completion: {
    key: "photo_completion",
    label: "Photo of completion",
    icon: "📷",
    shortDescription: "Single photo proving completion",
    instructions: `No video recording needed for this challenge. You'll submit a photo showing you completed the activity.

What to photograph: Whatever proves you finished. For books, take a photo of the book cover and a couple of pages. For volunteer hours, photograph the location and the work done. For projects, photograph the finished result.

Lighting: Bright, clear photo. Make sure key details are readable / visible.

Verification: A coach reviews each photo to confirm completion. Be honest — your coach knows your activity well enough to spot issues.`,
    audioRequired: false,
    recommendedVerificationMode: "coach_only",
  },

  wide_angle_court: {
    key: "wide_angle_court",
    label: "Wide angle, full court/field visible",
    icon: "🏟",
    shortDescription: "Wide shot of full activity area",
    instructions: `Phone position: Set up the phone far enough back that the entire court, field, or play area is in frame.

Framing: Full play area visible. You should be able to see the player and the boundaries of the action.

Lighting: Outdoor activities — record during the day when light is even. Indoor — pick a well-lit gym/court.

Audio: Not required.

Verification: AI tracks player movement and counts plays/attempts within the visible area.`,
    audioRequired: false,
    recommendedVerificationMode: "ai_and_coach",
  },

  selfie_with_object: {
    key: "selfie_with_object",
    label: "Selfie with completed work",
    icon: "✋",
    shortDescription: "Front camera with finished work held up",
    instructions: `Phone position: Selfie / front camera mode, held arm's length or propped up.

Framing: Your face AND the completed work (knot, worksheet, project, completed item) should both be in frame. Hold the work close to your face so the camera sees both.

Lighting: Face the light source so both your face and the object are clearly lit.

Audio: Optional — you can briefly explain what you completed.

Verification: A coach reviews to confirm the work is done correctly. The face-plus-object combo prevents people from submitting someone else's work.`,
    audioRequired: false,
    recommendedVerificationMode: "coach_only",
  },

  custom: {
    key: "custom",
    label: "Custom (write your own instructions)",
    icon: "✏️",
    shortDescription: "Coach-written recording instructions",
    instructions: `Write clear instructions for how players should set up their phone to record this challenge. Include:
- Phone position (where to put it, what angle)
- Framing (what should be visible)
- Lighting tips
- Audio requirements (if any)
- What the coach/AI will check when reviewing`,
    audioRequired: false,
    recommendedVerificationMode: "coach_only",
  },
};

export type ChallengeContext = {
  category: string;
  subcategoryName?: string | null;
  unit?: string | null;
  name?: string | null;
};

export type Recommendation = {
  templateKey: string;
  template: RecordingTemplate;
  confidence: "high" | "medium" | "low";
  reasoning: string;
};

// Helpful keyword sets for matching
const KEYWORDS = {
  bodyweight: ["push-up", "pushup", "sit-up", "situp", "squat", "burpee", "plank", "lunge", "jump", "crunch", "pull-up", "pullup", "dip"],
  shooting: ["shot", "shoot", "throw", "free throw", "freethrow", "putt", "putting", "archer", "dart", "frisbee golf", "disc golf"],
  memorization: ["verse", "memori", "recit", "scripture", "quote", "speech", "poem", "presentation", "speak"],
  reading: ["read", "book", "chapter", "page", "novel"],
  juggling_dribbling: ["juggle", "dribble", "ball control", "footwork"],
  knot_craft: ["knot", "tie", "tying", "weave", "draw", "drawing", "paint", "sculpt"],
  running: ["mile", "run", "jog", "marathon", "5k", "10k", "sprint"],
  swimming: ["swim", "lap", "freestyle", "stroke"],
  service: ["volunteer", "service", "help", "donate", "clean"],
  practice: ["practice", "session", "workout"],
};

const matchesAny = (text: string, keywords: string[]): boolean => {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
};

export function recommendRecordingSetup(ctx: ChallengeContext): Recommendation | null {
  const { category, subcategoryName, unit, name } = ctx;
  if (!category) return null;

  // Build a single search blob to make keyword matching easier
  const searchText = [name || "", unit || "", subcategoryName || ""].join(" ").toLowerCase();

  // === SERVICE ===
  if (category === "Service") {
    if (matchesAny(searchText, KEYWORDS.service) || /hour/i.test(unit || "")) {
      return {
        templateKey: "photo_completion",
        template: RECORDING_TEMPLATES.photo_completion,
        confidence: "high",
        reasoning: "Service activities are best verified by a photo at the location showing the work done.",
      };
    }
    return {
      templateKey: "photo_completion",
      template: RECORDING_TEMPLATES.photo_completion,
      confidence: "medium",
      reasoning: "Service category typically uses photo verification.",
    };
  }

  // === ACADEMIC ===
  if (category === "Academic") {
    if (matchesAny(searchText, KEYWORDS.reading) || /book|page|chapter/.test(unit || "")) {
      return {
        templateKey: "photo_completion",
        template: RECORDING_TEMPLATES.photo_completion,
        confidence: "high",
        reasoning: "Reading challenges are best verified with a photo of the book + a brief summary.",
      };
    }
    if (matchesAny(searchText, KEYWORDS.memorization)) {
      return {
        templateKey: "selfie_audio",
        template: RECORDING_TEMPLATES.selfie_audio,
        confidence: "high",
        reasoning: "Recitation/memorization is best verified by recording the speaker with clear audio.",
      };
    }
    if (subcategoryName === "Music Practice") {
      return {
        templateKey: "selfie_audio",
        template: RECORDING_TEMPLATES.selfie_audio,
        confidence: "medium",
        reasoning: "Instrument practice is verified through audio recording.",
      };
    }
    return {
      templateKey: "photo_completion",
      template: RECORDING_TEMPLATES.photo_completion,
      confidence: "medium",
      reasoning: "Academic completion is typically verified by a photo or scan of the work.",
    };
  }

  // === FAITH ===
  if (category === "Faith") {
    if (subcategoryName === "Bible Memorization" || matchesAny(searchText, KEYWORDS.memorization)) {
      return {
        templateKey: "selfie_audio",
        template: RECORDING_TEMPLATES.selfie_audio,
        confidence: "high",
        reasoning: "Bible verse memorization needs front-facing video with clear audio for AI speech-to-text verification.",
      };
    }
    if (subcategoryName === "Service & Outreach" || subcategoryName === "Mission Trips") {
      return {
        templateKey: "photo_completion",
        template: RECORDING_TEMPLATES.photo_completion,
        confidence: "high",
        reasoning: "Service and mission trip activities are best documented with photos.",
      };
    }
    if (subcategoryName === "Devotionals") {
      return {
        templateKey: "photo_completion",
        template: RECORDING_TEMPLATES.photo_completion,
        confidence: "medium",
        reasoning: "Devotionals can be tracked with a journal photo or check-in.",
      };
    }
    if (subcategoryName === "Worship Practice") {
      return {
        templateKey: "selfie_audio",
        template: RECORDING_TEMPLATES.selfie_audio,
        confidence: "medium",
        reasoning: "Worship practice (singing, instruments) uses audio recording.",
      };
    }
    return {
      templateKey: "selfie_audio",
      template: RECORDING_TEMPLATES.selfie_audio,
      confidence: "low",
      reasoning: "Default for faith challenges — adjust if not a vocal/recitation activity.",
    };
  }

  // === SCOUTS ===
  if (category === "Scouts") {
    if (subcategoryName === "Knot Tying" || matchesAny(searchText, KEYWORDS.knot_craft)) {
      return {
        templateKey: "top_down_closeup",
        template: RECORDING_TEMPLATES.top_down_closeup,
        confidence: "high",
        reasoning: "Knot tying needs a close-up view of hands and rope.",
      };
    }
    if (subcategoryName === "Merit Badges" || subcategoryName === "Citizenship") {
      return {
        templateKey: "photo_completion",
        template: RECORDING_TEMPLATES.photo_completion,
        confidence: "medium",
        reasoning: "Merit badge requirements are usually verified with proof photos.",
      };
    }
    if (subcategoryName === "First Aid") {
      return {
        templateKey: "selfie_with_object",
        template: RECORDING_TEMPLATES.selfie_with_object,
        confidence: "medium",
        reasoning: "First aid demonstration with a face-and-completed-bandage shot prevents fakery.",
      };
    }
    return {
      templateKey: "photo_completion",
      template: RECORDING_TEMPLATES.photo_completion,
      confidence: "low",
      reasoning: "Default for scouts activities — most are verified with completion photos.",
    };
  }

  // === FITNESS ===
  if (category === "Fitness") {
    if (subcategoryName === "Cardio" && (matchesAny(searchText, KEYWORDS.running) || /mile|km|distance/.test(unit || ""))) {
      return {
        templateKey: "gps_with_endpoints",
        template: RECORDING_TEMPLATES.gps_with_endpoints,
        confidence: "high",
        reasoning: "Distance running uses GPS tracking with start/end photos.",
      };
    }
    if (subcategoryName === "Cardio" && matchesAny(searchText, KEYWORDS.swimming)) {
      return {
        templateKey: "wide_angle_court",
        template: RECORDING_TEMPLATES.wide_angle_court,
        confidence: "high",
        reasoning: "Swimming is best recorded from the pool deck with a wide-angle view.",
      };
    }
    if (subcategoryName === "Endurance" && matchesAny(searchText, KEYWORDS.running)) {
      return {
        templateKey: "gps_with_endpoints",
        template: RECORDING_TEMPLATES.gps_with_endpoints,
        confidence: "high",
        reasoning: "Endurance running uses GPS tracking.",
      };
    }
    if (
      subcategoryName === "Calisthenics" ||
      subcategoryName === "Strength Training" ||
      subcategoryName === "HIIT / CrossFit" ||
      matchesAny(searchText, KEYWORDS.bodyweight)
    ) {
      return {
        templateKey: "side_angle_floor",
        template: RECORDING_TEMPLATES.side_angle_floor,
        confidence: "high",
        reasoning: "Bodyweight and strength exercises are counted from a side angle.",
      };
    }
    if (subcategoryName === "Yoga / Flexibility") {
      return {
        templateKey: "side_angle_floor",
        template: RECORDING_TEMPLATES.side_angle_floor,
        confidence: "medium",
        reasoning: "Yoga and flexibility benefit from side-angle recording showing form.",
      };
    }
    return {
      templateKey: "side_angle_floor",
      template: RECORDING_TEMPLATES.side_angle_floor,
      confidence: "low",
      reasoning: "Default for fitness — adjust if it's a tracked-distance activity.",
    };
  }

  // === SPORTS ===
  if (category === "Sports") {
    // Distance/endurance sports
    if (
      subcategoryName === "Cross Country" ||
      subcategoryName === "Track & Field" ||
      matchesAny(searchText, KEYWORDS.running)
    ) {
      // Track & Field has both running AND throwing/jumping events
      if (subcategoryName === "Track & Field" && !matchesAny(searchText, KEYWORDS.running)) {
        return {
          templateKey: "wide_angle_court",
          template: RECORDING_TEMPLATES.wide_angle_court,
          confidence: "medium",
          reasoning: "Track & field events that aren't running (throws, jumps) need a wide angle.",
        };
      }
      return {
        templateKey: "gps_with_endpoints",
        template: RECORDING_TEMPLATES.gps_with_endpoints,
        confidence: "high",
        reasoning: "Distance running events use GPS tracking with start/end photos.",
      };
    }

    if (subcategoryName === "Swimming") {
      return {
        templateKey: "wide_angle_court",
        template: RECORDING_TEMPLATES.wide_angle_court,
        confidence: "high",
        reasoning: "Swimming is recorded from the pool deck with a wide-angle view.",
      };
    }

    // Shooting sports
    if (
      subcategoryName === "Basketball" && matchesAny(searchText, KEYWORDS.shooting)
    ) {
      return {
        templateKey: "behind_player_target",
        template: RECORDING_TEMPLATES.behind_player_target,
        confidence: "high",
        reasoning: "Basketball shooting drills are filmed from behind/beside the player with the hoop in frame.",
      };
    }

    if (subcategoryName === "Golf" || matchesAny(searchText, ["putt", "drive", "chip"])) {
      return {
        templateKey: "behind_player_target",
        template: RECORDING_TEMPLATES.behind_player_target,
        confidence: "high",
        reasoning: "Golf shots are filmed from behind the player to show ball flight to target.",
      };
    }

    if (subcategoryName === "Tennis" || subcategoryName === "Volleyball") {
      return {
        templateKey: "wide_angle_court",
        template: RECORDING_TEMPLATES.wide_angle_court,
        confidence: "high",
        reasoning: "Court sports are recorded with a wide-angle view of the court.",
      };
    }

    // Soccer-specific
    if (subcategoryName === "Soccer" && matchesAny(searchText, KEYWORDS.juggling_dribbling)) {
      return {
        templateKey: "side_angle_floor",
        template: RECORDING_TEMPLATES.side_angle_floor,
        confidence: "high",
        reasoning: "Soccer juggling/dribbling is filmed from the side showing feet and ball.",
      };
    }

    if (
      subcategoryName === "Soccer" ||
      subcategoryName === "Football" ||
      subcategoryName === "Lacrosse" ||
      subcategoryName === "Hockey"
    ) {
      return {
        templateKey: "wide_angle_court",
        template: RECORDING_TEMPLATES.wide_angle_court,
        confidence: "high",
        reasoning: "Field sports are filmed from a wide angle showing the play area.",
      };
    }

    if (subcategoryName === "Wrestling") {
      return {
        templateKey: "wide_angle_court",
        template: RECORDING_TEMPLATES.wide_angle_court,
        confidence: "medium",
        reasoning: "Wrestling matches are filmed from the mat side with a wide angle.",
      };
    }

    if (subcategoryName === "Cheerleading") {
      return {
        templateKey: "wide_angle_court",
        template: RECORDING_TEMPLATES.wide_angle_court,
        confidence: "medium",
        reasoning: "Cheer routines are recorded from a wide angle showing the full team or routine.",
      };
    }

    if (subcategoryName === "Baseball" || subcategoryName === "Softball") {
      return {
        templateKey: "behind_player_target",
        template: RECORDING_TEMPLATES.behind_player_target,
        confidence: "high",
        reasoning: "Baseball/softball drills (pitching, batting) film from behind the player toward the target.",
      };
    }

    // Conditioning within a sport
    if (matchesAny(searchText, KEYWORDS.bodyweight)) {
      return {
        templateKey: "side_angle_floor",
        template: RECORDING_TEMPLATES.side_angle_floor,
        confidence: "high",
        reasoning: "Bodyweight conditioning exercises are counted from a side angle.",
      };
    }

    return {
      templateKey: "wide_angle_court",
      template: RECORDING_TEMPLATES.wide_angle_court,
      confidence: "low",
      reasoning: "Default for sports — adjust based on the specific drill type.",
    };
  }

  // No category match — return null so caller shows manual options
  return null;
}
