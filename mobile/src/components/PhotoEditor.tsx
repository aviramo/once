import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, Image, ActivityIndicator } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Path, Line } from 'react-native-svg'
import * as DocumentPicker from 'expo-document-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useUserStore } from '../stores/userStore'
import { tap, tapMedium, tapSuccess } from '../lib/haptics'
import { t } from '../i18n'
import { SINGLE } from '../fonts'
import { TEXT, WHITE } from '../colors'
import { ConfirmDialog } from './ConfirmDialog'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// Cached set of URIs we've already seen load once. React Native Image
// caches bytes to disk, but the component still runs a load cycle on
// re-mount which shows a spinner. Tracking loaded URIs here lets us skip
// the spinner entirely when the user navigates back to the screen.
const loadedUris = new Set<string>()

function PhotoCell({
  uri, localUri, onRemove, onLoaded, canRemove, dragging, highlighted, onLayout,
}: {
  uri: string
  localUri?: string
  onRemove: () => void
  onLoaded?: () => void
  canRemove: boolean
  dragging?: boolean
  highlighted?: boolean
  onLayout?: (e: any) => void
}) {
  const [loaded, setLoaded] = useState(() => loadedUris.has(uri))
  return (
    <View
      style={photoStyles.cell}
      onLayout={onLayout}
    >
      {localUri && !loaded && (
        <Image source={{ uri: localUri }} style={[photoStyles.img, { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 }]} />
      )}
      <Image
        source={{ uri }}
        style={[photoStyles.img, !loaded && { opacity: 0 }]}
        onLoad={() => { loadedUris.add(uri); setLoaded(true); onLoaded?.() }}
      />
      {!loaded && (
        <View style={photoStyles.spinnerBadge}>
          <ActivityIndicator size="small" color={WHITE} />
        </View>
      )}
      {(dragging || highlighted) && <View pointerEvents="none" style={photoStyles.dropTarget} />}
      {loaded && canRemove && (
        <Pressable style={photoStyles.remove} onPress={() => { tap(); onRemove() }}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.5} strokeLinecap="round">
            <Line x1="18" y1="6" x2="6" y2="18" />
            <Line x1="6" y1="6" x2="18" y2="18" />
          </Svg>
        </Pressable>
      )}
    </View>
  )
}

// Draggable photo grid — drag to reorder, X to remove.
function PhotoGrid({
  photos, urlFor, onRemove, onLoaded, onReorder, canRemove, uploads, additionalChildren, onDragStateChange,
}: {
  photos: string[]
  urlFor: (f: string) => string
  onRemove: (f: string) => void
  onLoaded: (f: string) => void
  onReorder: (from: number, to: number) => void
  canRemove: boolean
  uploads: { id: string; uri: string; filename?: string }[]
  additionalChildren?: React.ReactNode
  onDragStateChange?: (dragging: boolean) => void
}) {
  const layouts = useRef<Array<{ x: number; y: number; w: number; h: number }>>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const hoverIdxRef = useRef<number | null>(null)

  const photosLenRef = useRef(photos.length)
  const onReorderRef = useRef(onReorder)
  const onDragStateChangeRef = useRef(onDragStateChange)
  useEffect(() => { photosLenRef.current = photos.length }, [photos.length])
  useEffect(() => { onReorderRef.current = onReorder }, [onReorder])
  useEffect(() => { onDragStateChangeRef.current = onDragStateChange }, [onDragStateChange])

  const sourceIdxRef = useRef<number | null>(null)

  const dragPan = useMemo(() =>
    Gesture.Pan()
      .minDistance(3)
      .onBegin(e => {
        let hit = -1
        for (let i = 0; i < layouts.current.length; i++) {
          const l = layouts.current[i]
          if (!l) continue
          if (e.x >= l.x && e.x <= l.x + l.w && e.y >= l.y && e.y <= l.y + l.h) {
            hit = i
            break
          }
        }
        sourceIdxRef.current = hit >= 0 ? hit : null
      })
      .onStart(() => {
        const idx = sourceIdxRef.current
        if (idx == null) return
        tapMedium()
        setDragIdx(idx)
        onDragStateChangeRef.current?.(true)
      })
      .onUpdate(e => {
        const idx = sourceIdxRef.current
        if (idx == null) return
        const l = layouts.current[idx]
        if (!l) return
        const cx = l.x + l.w / 2 + e.translationX
        const cy = l.y + l.h / 2 + e.translationY
        let best = -1
        let bestDist = Infinity
        for (let i = 0; i < layouts.current.length; i++) {
          const li = layouts.current[i]
          if (!li) continue
          const dx = (li.x + li.w / 2) - cx
          const dy = (li.y + li.h / 2) - cy
          const d = dx * dx + dy * dy
          if (d < bestDist) { bestDist = d; best = i }
        }
        const normalized = best < 0 || best === idx ? null : best
        if (normalized !== hoverIdxRef.current) {
          hoverIdxRef.current = normalized
          setHoverIdx(normalized)
        }
      })
      .onEnd(() => {
        const idx = sourceIdxRef.current
        const target = hoverIdxRef.current
        if (idx != null && target !== null && target >= 0 && target < photosLenRef.current && target !== idx) {
          tapSuccess()
          onReorderRef.current(idx, target)
        }
      })
      .onFinalize(() => {
        sourceIdxRef.current = null
        setDragIdx(null)
        setHoverIdx(null)
        hoverIdxRef.current = null
        onDragStateChangeRef.current?.(false)
      })
      .runOnJS(true)
  , [])

  return (
    <GestureDetector gesture={dragPan}>
    <View style={photoStyles.grid} pointerEvents="box-none">
      {photos.map((filename, i) => {
        const matchingUpload = uploads.find(u => u.filename === filename)
        return (
          <PhotoCell
            key={`${i}-${filename}`}
            uri={urlFor(filename)}
            localUri={matchingUpload?.uri}
            onRemove={() => onRemove(filename)}
            onLoaded={() => onLoaded(filename)}
            canRemove={canRemove}
            dragging={dragIdx === i}
            highlighted={hoverIdx === i}
            onLayout={(e) => { layouts.current[i] = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height } }}
          />
        )
      })}
      {uploads.filter(u => !u.filename).map(u => (
        <View key={u.id} style={photoStyles.cell}>
          <Image source={{ uri: u.uri }} style={photoStyles.img} />
          <View style={photoStyles.spinnerBadge}>
            <ActivityIndicator size="small" color={WHITE} />
          </View>
        </View>
      ))}
      {additionalChildren}
      {(() => {
        const pendingCount = uploads.filter(u => !u.filename).length
        const addCount = additionalChildren ? 1 : 0
        const total = photos.length + pendingCount + addCount
        const fillers = (3 - (total % 3)) % 3
        return Array.from({ length: fillers }).map((_, i) => (
          <View
            key={`filler-${i}`}
            style={[photoStyles.cell, photoStyles.filler]}
            pointerEvents="none"
          />
        ))
      })()}
    </View>
    </GestureDetector>
  )
}

// ── Public editor ─────────────────────────────────────────────────────────
// Full photo-management surface used by both the photo sub-page (settings)
// and onboarding step 4. Owns the upload queue, dedupe signature map, and
// the duplicate-detected dialog. Remove/reorder changes are applied to the
// store immediately (no deferred flush).
export function PhotoEditor({
  onDragStateChange,
  onUploadingChange,
}: {
  onDragStateChange?: (dragging: boolean) => void
  // Fires when the in-flight upload count toggles between zero and non-zero.
  // Onboarding uses this to disable the "Confirm & Continue" button until
  // every picked image is committed to storage and the user row has its
  // filename, so the next-step save can't race a pending upload.
  onUploadingChange?: (uploading: boolean) => void
}) {
  const { user } = useAuthStore()
  const { profile, update } = useUserStore()
  const [uploads, setUploads] = useState<{ id: string; uri: string; filename?: string; sig: string }[]>([])

  useEffect(() => {
    onUploadingChange?.(uploads.some(u => !u.filename))
  }, [uploads, onUploadingChange])
  // filename → signature map, persists across the session even after the
  // upload cell has disappeared, so re-picking the same asset still dedupes.
  const sigByFilename = useRef<Map<string, string>>(new Map())
  const [duplicateDialog, setDuplicateDialog] = useState(false)

  const storeImages = profile?.images ?? { normal: [], blur: [] }
  const photos = storeImages.normal

  const uploadFile = async (uri: string, filename: string, contentType: string, variant: 'normal' | 'blur', token: string) => {
    const formData = new FormData()
    formData.append('', { uri, name: filename, type: contentType } as any)
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/users/${user!.id}/${variant}/${filename}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-upsert': 'true' },
        body: formData,
      }
    )
    if (!res.ok) throw new Error(await res.text())
  }

  const compressUnder200K = async (uri: string): Promise<string> => {
    const MAX_BYTES = 200 * 1024
    const widths = [1080, 900, 720, 540]
    const qualities = [0.8, 0.6, 0.45, 0.3]
    for (const w of widths) {
      for (const q of qualities) {
        const out = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: w } }],
          { compress: q, format: ImageManipulator.SaveFormat.WEBP }
        )
        const size = (await (await fetch(out.uri)).blob()).size
        if (size <= MAX_BYTES) return out.uri
      }
    }
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 480 } }],
      { compress: 0.25, format: ImageManipulator.SaveFormat.WEBP }
    )
    return out.uri
  }

  const compressBlur = async (uri: string): Promise<string> => {
    const tiny = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 8 } }],
      { format: ImageManipulator.SaveFormat.PNG }
    )
    return (await ImageManipulator.manipulateAsync(
      tiny.uri,
      [{ resize: { width: 200 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.WEBP }
    )).uri
  }

  const uploadOne = async (asset: DocumentPicker.DocumentPickerAsset) => {
    if (!user) return null
    const normalFilename = `${uuidv4()}.webp`
    const blurFilename = `${uuidv4()}.webp`
    const [normalUri, blurred] = await Promise.all([
      compressUnder200K(asset.uri),
      compressBlur(asset.uri),
    ])
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''
    await uploadFile(normalUri, normalFilename, 'image/webp', 'normal', token)
    await uploadFile(blurred, blurFilename, 'image/webp', 'blur', token)
    return { normal: normalFilename, blur: blurFilename }
  }

  const pickPhoto = async () => {
    if (!user || photos.length >= 6) return
    const maxPick = 6 - photos.length
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: true,
    })
    if (result.canceled || !result.assets?.length) return

    const sigs = await Promise.all(result.assets.map(async a => {
      try {
        const info = await FileSystem.getInfoAsync(a.uri, { md5: true })
        if (info.exists && info.md5) return info.md5
      } catch {}
      return `${a.name ?? ''}|${a.size ?? 0}`
    }))

    const existingSigs = new Set<string>([
      ...Array.from(sigByFilename.current.values()),
      ...uploads.map(u => u.sig),
    ])

    const seenThisBatch = new Set<string>()
    const kept: number[] = []
    result.assets.forEach((_, idx) => {
      const s = sigs[idx]
      if (existingSigs.has(s) || seenThisBatch.has(s)) return
      seenThisBatch.add(s)
      kept.push(idx)
    })
    const filtered = kept.map(i => result.assets[i])
    const filteredSigs = kept.map(i => sigs[i])

    const skipped = result.assets.length - filtered.length
    if (skipped > 0) setDuplicateDialog(true)
    if (filtered.length === 0) return

    const assets = filtered.slice(0, maxPick)
    const newUploads = assets.map((a, i) => ({
      id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      uri: a.uri,
      sig: filteredSigs[i],
    }))
    setUploads(prev => [...prev, ...newUploads])

    for (let i = 0; i < assets.length; i++) {
      try {
        const result = await uploadOne(assets[i])
        if (result) {
          sigByFilename.current.set(result.normal, newUploads[i].sig)
          setUploads(prev => prev.map(u => u.id === newUploads[i].id ? { ...u, filename: result.normal } : u))
          const currentImages = useUserStore.getState().profile?.images ?? { normal: [], blur: [] }
          update({ images: {
            normal: [...currentImages.normal, result.normal],
            blur: [...currentImages.blur, result.blur],
          } })
        } else {
          setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
        }
      } catch (e: any) {
        console.error('Photo upload error:', e)
        setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
      }
    }
  }

  const removePhoto = async (filename: string) => {
    if (!user) return
    if (photos.length <= 1) return
    const idx = storeImages.normal.indexOf(filename)
    if (idx < 0) return
    const blurFilename = storeImages.blur[idx]
    await supabase.storage.from('users').remove([
      `${user.id}/normal/${filename}`,
      `${user.id}/blur/${blurFilename}`,
    ])
    sigByFilename.current.delete(filename)
    update({ images: {
      normal: storeImages.normal.filter((_, i) => i !== idx),
      blur: storeImages.blur.filter((_, i) => i !== idx),
    } })
  }

  const reorderPhotos = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return
    const nextNormal = [...storeImages.normal]
    const nextBlur = [...storeImages.blur]
    ;[nextNormal[from], nextNormal[to]] = [nextNormal[to], nextNormal[from]]
    ;[nextBlur[from], nextBlur[to]] = [nextBlur[to], nextBlur[from]]
    update({ images: { normal: nextNormal, blur: nextBlur } })
  }

  const onPhotoLoaded = (filename: string) => {
    setUploads(prev => prev.filter(u => u.filename !== filename))
  }

  return (
    <>
      <PhotoGrid
        photos={photos}
        urlFor={(f) => `${SUPABASE_URL}/storage/v1/object/public/users/${user!.id}/normal/${f}`}
        onRemove={removePhoto}
        onLoaded={onPhotoLoaded}
        onReorder={reorderPhotos}
        canRemove={photos.length > 1}
        uploads={uploads}
        onDragStateChange={onDragStateChange}
        additionalChildren={
          photos.length + uploads.filter(u => !u.filename).length < 6 ? (
            <View style={photoStyles.add}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => { tap(); pickPhoto() }}
              />
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} strokeLinecap="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
            </View>
          ) : null
        }
      />
      <ConfirmDialog
        visible={duplicateDialog}
        title={t('settings.duplicatePhotoTitle')}
        description={t('settings.duplicatePhotoBody')}
        confirmLabel={t('common.gotIt')}
        soft
        onConfirm={() => setDuplicateDialog(false)}
      />
    </>
  )
}

const photoStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    rowGap: 8,
    marginTop: 12,
    overflow: 'visible',
  },
  cell: { width: '31.5%', aspectRatio: 3 / 4, borderRadius: SINGLE, overflow: 'hidden' },
  filler: { backgroundColor: 'transparent', borderWidth: 0, height: 0 },
  img: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute', top: 8, end: 8,
    width: 28, height: 28, borderRadius: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  add: {
    width: '31.5%', aspectRatio: 3 / 4, borderRadius: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)', borderStyle: 'dashed',
  },
  dropTarget: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: TEXT,
    borderRadius: SINGLE,
  },
  spinnerBadge: {
    position: 'absolute',
    top: '50%', start: '50%',
    width: 36, height: 36, marginStart: -18, marginTop: -18,
    borderRadius: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
})
