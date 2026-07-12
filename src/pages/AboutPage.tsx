import { useCallback, useEffect, useMemo, useState } from 'react';
import brandAvatar from '../assets/haruhi-avatar.png';
import { MarkdownContent } from '../components/MarkdownContent';
import { ImageWithFallback } from '../components/shared';
import { usePageMetadata } from '../hooks/usePageMetadata';
import { AboutProfile, isAboutProfileEmpty } from '../lib/about';
import { getAboutProfile } from '../lib/aboutApi';

function BrandAvatar({ name }: { name: string }) {
  return <img alt={name ? `${name} 的头像` : 'Kitepop 品牌头像'} className="about-avatar" src={brandAvatar} />;
}

export function AboutPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<AboutProfile | null>(null);
  const metadata = useMemo(
    () => ({
      title: '关于我 | Kitepop SOS',
      description: profile?.intro.trim() || '了解 Kitepop 的个人介绍、身份与创作记录。',
      path: '/about' as const,
      schemaType: 'ProfilePage' as const,
      subjectName: profile?.displayName.trim() || 'Kitepop'
    }),
    [profile?.displayName, profile?.intro]
  );
  usePageMetadata(null, metadata);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProfile(await getAboutProfile());
    } catch (loadError) {
      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : '获取个人资料失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (loading) {
    return <main className="about-page"><p role="status">正在加载个人资料…</p></main>;
  }

  if (error) {
    return (
      <main className="about-page">
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => void loadProfile()} type="button">重试</button>
        </div>
      </main>
    );
  }

  if (!profile || isAboutProfileEmpty(profile)) {
    return <main className="about-page"><p role="status">个人资料还在准备中，晚些时候再来看看吧。</p></main>;
  }

  return (
    <main className="about-page">
      <section className="about-hero about-reveal">
        <span aria-hidden="true" className="about-sos-watermark">SOS</span>
        <div className="about-avatar-ring">
          <ImageWithFallback
            alt={profile.displayName ? `${profile.displayName} 的头像` : '个人头像'}
            className="about-avatar"
            fallback={<BrandAvatar name={profile.displayName} />}
            src={profile.avatarUrl}
          />
        </div>
        {profile.displayName ? <h1 className="about-profile-name">{profile.displayName}</h1> : null}
        {profile.identityTags.length ? (
          <div className="about-identity-tags" aria-label="身份标签">
            {profile.identityTags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : null}
        {profile.intro ? <p>{profile.intro}</p> : null}
        {profile.githubUrl ? (
          <a className="about-social-link" href={profile.githubUrl} rel="noopener noreferrer" target="_blank">GitHub</a>
        ) : null}
      </section>
      {profile.content ? (
        <article className="about-content about-reveal">
          <MarkdownContent content={profile.content} />
        </article>
      ) : null}
    </main>
  );
}
