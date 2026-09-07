export type LifeEntry = {
  id: string;
  title: string;
  occurredAt: string;
  endedAt?: string | null;
  locationName: string;
  latitude: number;
  longitude: number;
  category: string;
  status: string;
  mood: number;
  significance: number;
  summary: string;
  rawDetail?: string;
  detail: string;
  lessons: string;
  people: string;
  emotion?: string;
  emotions?: string[];
  lifePhase?: string;
  visibility?: string;
  tags: string[];
  trackId: string | null;
  createdAt: string;
};

export type LifeMedia = {
  id: string;
  entryId: string;
  fileName: string;
  contentType: string;
  size: number;
  stage: "start" | "moment" | "end";
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  url: string;
  createdAt: string;
};

export type LifeTrack = {
  id: string;
  title: string;
  description: string;
  why: string;
  nextStep: string;
  startDate: string;
  endDate: string;
  status: string;
  progress: number;
  color: string;
  sortOrder: number;
  createdAt: string;
};

export type LifeProfile = {
  id: string;
  displayName: string;
  birthDate: string;
  birthCity: string;
  currentCity: string;
  identity: string;
  planningAge: number;
  values: string[];
  avatarSymbol: string;
  createdAt: string;
  updatedAt: string;
};

export type LifeGoal = {
  id: string;
  title: string;
  description: string;
  why: string;
  nextStep: string;
  targetDate: string;
  startDate: string;
  domain: string;
  timeMode: "point" | "range";
  nodeType: "goal" | "milestone" | "turning" | "habit";
  status: "planned" | "active" | "complete" | "paused";
  progress: number;
  trackId: string | null;
  linkedEntryId: string | null;
  locationName: string;
  createdAt: string;
};

export type LifeDomain = {
  id: string;
  label: string;
  description: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LifeGoalEdge = {
  id: string;
  fromGoalId: string;
  toGoalId: string;
  relation: "depends" | "extends";
  createdAt: string;
};
