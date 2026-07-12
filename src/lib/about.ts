export interface AboutProfile {
  avatarUrl: string;
  displayName: string;
  identityTags: string[];
  intro: string;
  githubUrl: string;
  content: string;
  updatedAt: string;
}

export const EMPTY_ABOUT_PROFILE: Readonly<AboutProfile> = Object.freeze({
  avatarUrl: '',
  displayName: '',
  identityTags: Object.freeze([]) as unknown as string[],
  intro: '',
  githubUrl: '',
  content: '',
  updatedAt: ''
});

export function emptyAboutProfile(): AboutProfile {
  return { ...EMPTY_ABOUT_PROFILE, identityTags: [] };
}

export function isAboutProfileEmpty(profile: AboutProfile): boolean {
  return !profile.displayName.trim() && !profile.content.trim();
}
