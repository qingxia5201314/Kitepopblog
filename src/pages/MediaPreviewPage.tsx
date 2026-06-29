import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface MediaPreviewState {
  url: string;
  originalName: string;
  contentType: string;
}

function formatMediaKind(contentType: string) {
  if (contentType.startsWith('video/')) return '视频预览';
  if (contentType.startsWith('audio/')) return '音频预览';
  return '文件预览';
}

export function MediaPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || null) as MediaPreviewState | null;
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!state?.url) {
      navigate('/files', { replace: true });
    }
  }, [navigate, state]);

  const isVideo = useMemo(() => Boolean(state?.contentType?.startsWith('video/')), [state?.contentType]);
  const isAudio = useMemo(() => Boolean(state?.contentType?.startsWith('audio/')), [state?.contentType]);

  if (!state?.url) return null;

  return (
    <section className="media-preview-page">
      <div className="media-preview-shell accounting-card">
        <div className="media-preview-header">
          <button className="ghost" onClick={() => navigate('/files')} type="button">
            返回文件仓库
          </button>
          <div>
            <p className="eyebrow">Signed Media</p>
            <h1>{state.originalName}</h1>
            <p>{formatMediaKind(state.contentType)}</p>
          </div>
        </div>

        <div className="media-preview-stage">
          {isVideo ? (
            <>
              <video
                className="media-preview-player"
                controls={activated}
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                draggable="false"
                playsInline
                preload="none"
                src={activated ? state.url : undefined}
              />
              {!activated ? (
                <div className="media-preview-overlay">
                  <button onClick={() => setActivated(true)} type="button">
                    播放视频
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {isAudio ? (
            <div className="media-preview-audio-card">
              <audio
                className="media-preview-player"
                controls
                controlsList="nodownload noplaybackrate"
                draggable="false"
                preload="none"
                src={activated ? state.url : undefined}
              />
              {!activated ? (
                <button onClick={() => setActivated(true)} type="button">
                  加载音频
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
