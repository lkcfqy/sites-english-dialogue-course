export const VOICE_PAIRS = {
  "en-GB": {
    label: "英音",
    A: { id: "en-GB-SoniaNeural", name: "Sonia", label: "Sonia 女声" },
    B: { id: "en-GB-RyanNeural", name: "Ryan", label: "Ryan 男声" },
  },
  "en-US": {
    label: "美音",
    A: { id: "en-US-JennyNeural", name: "Jenny", label: "Jenny 女声" },
    B: { id: "en-US-GuyNeural", name: "Guy", label: "Guy 男声" },
  },
  "en-AU": {
    label: "澳音",
    A: { id: "en-AU-NatashaNeural", name: "Natasha", label: "Natasha 女声" },
    B: { id: "en-AU-WilliamNeural", name: "William", label: "William 男声" },
  },
  "en-NZ": {
    label: "新西兰音",
    A: { id: "en-NZ-MollyNeural", name: "Molly", label: "Molly 女声" },
    B: { id: "en-NZ-MitchellNeural", name: "Mitchell", label: "Mitchell 男声" },
  },
} as const;

export type AccentKey = keyof typeof VOICE_PAIRS;
export type AccentSelection = "course" | AccentKey;
export type Speaker = "A" | "B";

const voiceEntries = Object.entries(VOICE_PAIRS).flatMap(([locale, pair]) =>
  [pair.A, pair.B].map((voice) => ({
    ...voice,
    locale,
    edgeName: "Microsoft Server Speech Text to Speech Voice (" +
      locale + ", " + voice.id.slice(locale.length + 1) + ")",
  }))
);

export const VOICE_BY_ID: Record<string, (typeof voiceEntries)[number]> =
  Object.fromEntries(voiceEntries.map((voice) => [voice.id, voice]));

export function accentForLesson(_week: number, _day: number): AccentKey {
  void _week;
  void _day;
  return "en-US";
}

export function voiceForSpeaker(selection: AccentSelection, week: number, day: number, speaker: Speaker) {
  const accent = selection === "course" ? accentForLesson(week, day) : selection;
  return VOICE_PAIRS[accent][speaker];
}
