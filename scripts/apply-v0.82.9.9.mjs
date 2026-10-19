import fs from 'node:fs'

function edit(path, mutator) {
  const before = fs.readFileSync(path, 'utf8')
  const after = mutator(before)
  if (after === before) throw new Error(`${path}: no changes made`)
  fs.writeFileSync(path, after)
}

function replaceOne(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  return text.replace(from, to)
}

edit('src/teaching/TeachingMediaLaser.tsx', (source) => {
  const start = source.indexOf('export function TeachingMediaLaserCandidateLayer')
  const end = source.indexOf('export function TeachingMediaLaserInstructorModal')
  if (start < 0 || end < 0 || end <= start) throw new Error('Unable to locate media laser components')

  const candidate = `export function TeachingMediaLaserCandidateLayer({
  sessionId,
  mediaId,
  mediaUrl,
  mediaKind,
  title,
}: {
  sessionId: string
  mediaId: string
  mediaUrl: string
  mediaKind: 'image' | 'video'
  title: string
}) {
  const state = useMediaLaserCandidate(sessionId, mediaId)
  return (
    <div className="teaching-media-laser-image-frame candidate">
      {mediaKind === 'video'
        ? <video key={mediaUrl} src={mediaUrl} controls playsInline preload="metadata" aria-label={title} />
        : <img src={mediaUrl} alt={title} />}
      {state?.active && (
        <span className="teaching-media-laser-dot" style={{ left: \`${'${state.x * 100}'}%\`, top: \`${'${state.y * 100}'}%\` }} />
      )}
    </div>
  )
}

`
  source = source.slice(0, start) + candidate + source.slice(end)
  source = replaceOne(source,
    `  imageUrl,\n  onClose,\n}: {\n  sessionId: string\n  media: CaseMediaRow\n  imageUrl: string\n  onClose: () => void\n}) {`,
    `  mediaUrl,\n  onClose,\n}: {\n  sessionId: string\n  media: CaseMediaRow\n  mediaUrl: string\n  onClose: () => void\n}) {`,
    'media laser modal URL prop')
  source = replaceOne(source,
    `  const imageRef = useRef<HTMLImageElement | null>(null)`,
    `  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)`,
    'media element ref')
  source = replaceOne(source,
    `    const image = imageRef.current\n    if (!image) return\n    const rect = image.getBoundingClientRect()`,
    `    const mediaElement = mediaRef.current\n    if (!mediaElement) return\n    const rect = mediaElement.getBoundingClientRect()`,
    'pointer media rect')
  source = replaceOne(source,
    `          <div className="teaching-media-laser-image-frame instructor">\n            <img ref={imageRef} src={imageUrl} alt={media.title} draggable={false} />\n            {pointer.active && <span className="teaching-media-laser-dot" style={{ left: \`${'${pointer.x * 100}'}%\`, top: \`${'${pointer.y * 100}'}%\` }} />}\n          </div>`,
    `          <div className="teaching-media-laser-image-frame instructor">\n            {media.media_kind === 'video'\n              ? <video ref={mediaRef as React.RefObject<HTMLVideoElement>} key={mediaUrl} src={mediaUrl} controls playsInline preload="metadata" aria-label={media.title} />\n              : <img ref={mediaRef as React.RefObject<HTMLImageElement>} src={mediaUrl} alt={media.title} draggable={false} />}\n            {pointer.active && <span className="teaching-media-laser-dot" style={{ left: \`${'${pointer.x * 100}'}%\`, top: \`${'${pointer.y * 100}'}%\` }} />}\n          </div>`,
    'modal media render')
  return source
})

edit('src/teaching/TeachingMediaPresentation.tsx', (source) => {
  source = replaceOne(source,
    `{url && presentation.media.media_kind === 'video' && (\n            <video key={url} src={url} controls playsInline preload="metadata" />\n          )}\n          {url && presentation.media.media_kind === 'image' && (\n            <TeachingMediaLaserCandidateLayer sessionId={presentation.session_id} mediaId={presentation.media_id} imageUrl={url} title={presentation.media.title} />\n          )}`,
    `{url && (\n            <TeachingMediaLaserCandidateLayer\n              sessionId={presentation.session_id}\n              mediaId={presentation.media_id}\n              mediaUrl={url}\n              mediaKind={presentation.media.media_kind}\n              title={presentation.media.title}\n            />\n          )}`,
    'candidate media laser render')
  return source
})

edit('src/teaching/TeachingMediaPanel.tsx', (source) => {
  source = replaceOne(source,
    `    if (!selectedLive || selected?.media_kind !== 'image') setMediaLaserOpen(false)\n  }, [selectedLive, selected?.media_kind])`,
    `    if (!selectedLive) setMediaLaserOpen(false)\n  }, [selectedLive])`,
    'laser close effect')
  source = replaceOne(source,
    `{selectedLive && selected.media_kind === 'image' && (\n                <button type="button" disabled={working || !previewUrl || !sessionId} onClick={() => setMediaLaserOpen(true)}>Laser pointer</button>\n              )}`,
    `{selectedLive && (\n                <button type="button" disabled={working || !previewUrl || !sessionId} onClick={() => setMediaLaserOpen(true)}>Laser pointer</button>\n              )}`,
    'laser action availability')
  source = replaceOne(source,
    `{mediaLaserOpen && selected && selectedLive && selected.media_kind === 'image' && previewUrl && sessionId && (\n        <TeachingMediaLaserInstructorModal\n          sessionId={sessionId}\n          media={selected}\n          imageUrl={previewUrl}\n          onClose={() => setMediaLaserOpen(false)}\n        />\n      )}`,
    `{mediaLaserOpen && selected && selectedLive && previewUrl && sessionId && (\n        <TeachingMediaLaserInstructorModal\n          sessionId={sessionId}\n          media={selected}\n          mediaUrl={previewUrl}\n          onClose={() => setMediaLaserOpen(false)}\n        />\n      )}`,
    'laser modal availability')
  return source
})

edit('src/App.tsx', (source) => {
  const mediaStart = source.indexOf('                <TeachingMediaInstructorPanel\n')
  const runtimeHost = source.indexOf('                <div ref={setDynamicScenarioRuntimeHost}', mediaStart)
  if (mediaStart < 0 || runtimeHost < 0) throw new Error('Unable to locate Media/Questions teaching sections')
  const existing = source.slice(mediaStart, runtimeHost)
  const replacement = `                {teachingSession.role !== 'candidate' && !instructorAccountConnected ? (\n                  <div className="teaching-more-features-note">Instructor account needed for more features</div>\n                ) : (\n                  <>\n${existing.replace(/^ {16}/gm, '                    ')}                  </>\n                )}\n`
  source = source.slice(0, mediaStart) + replacement + source.slice(runtimeHost)
  return source
})

edit('src/teaching/teaching.css', (source) => {
  if (!source.includes('.teaching-media-laser-image-frame video')) {
    source += `\n\n/* Video laser overlay and compact instructor-account gating */\n.teaching-media-laser-image-frame video { display:block; max-width:100%; max-height:78vh; width:auto !important; height:auto !important; object-fit:contain; background:#000; }\n.teaching-media-laser-image-frame.candidate video { max-height:70vh; }\n.teaching-more-features-note { margin:12px 0; padding:10px 12px; border:1px dashed #465860; border-radius:8px; background:#0d171c; color:#98a9b0; font-size:.78rem; line-height:1.4; text-align:center; }\n`
  }
  return source
})

edit('src/appVersion.ts', (source) => replaceOne(source, "export const APP_VERSION = '0.82.9.8'", "export const APP_VERSION = '0.82.9.9'", 'version bump'))

console.log('Applied v0.82.9.9 video laser and account gating')
