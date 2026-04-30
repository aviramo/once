import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import type { Image as ImageData } from '../stores/userStore'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Path, Line, Circle } from 'react-native-svg'
import * as DocumentPicker from 'expo-document-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import { encode as encodeBlurhash } from 'blurhash'
// @ts-expect-error upng-js ships no type definitions
import UPNG from 'upng-js'
import { supabase } from '../lib/supabase'
import { invoke } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useUserStore } from '../stores/userStore'
import { tap, tapMedium, tapSuccess } from '../lib/haptics'
import { t } from '../i18n'
import { SINGLE } from '../fonts'
import { TEXT_PRIMARY, WHITE, PRIMARY } from '../colors'
import { ConfirmDialog } from './ConfirmDialog'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

function uuidv4(): string {
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Module-level cache of local URIs for photos whose upload is still in
// flight. Keyed by the normal-variant filename that is already committed to
// the user store. Components outside the editor (e.g. the thumbnail strip
// on the profile tab) read from this map so they can show the image from
// the device cache while the background upload runs.
export const localPhotoUriCache = new Map<string, string>()

// Filenames committed to the store but not yet uploaded to storage.
// useDataSave in settings.tsx filters these out so the DB never receives a
// filename that has no corresponding file in storage, preventing empty slots
// if the app is closed before flush() runs.
export const pendingDeferred = new Set<string>()

async function uploadFileToStorage(uri: string, filename: string, contentType: string, variant: 'normal' | 'blur', token: string, userId: string) {
  const formData = new FormData()
  formData.append('', { uri, name: filename, type: contentType } as any)
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/users/${userId}/${variant}/${filename}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-upsert': 'true' },
      body: formData,
    }
  )
  if (!res.ok) throw new Error(await res.text())
}

export interface PhotoEditorRef {
  flush: () => Promise<void>
}

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
  return (
    <View
      style={photoStyles.cell}
      onLayout={onLayout}
    >
      <ExpoImage
        source={uri}
        placeholder={localUri ? { uri: localUri } : undefined}
        style={photoStyles.img}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={200}
        onLoad={() => onLoaded?.()}
      />
      {(dragging || highlighted) && <View pointerEvents="none" style={photoStyles.dropTarget} />}
      {canRemove && (
        <Pressable style={photoStyles.remove} onPress={() => { tap(); onRemove() }}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={TEXT_PRIMARY} strokeWidth={3} strokeLinecap="round">
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
  photos, urlFor, onRemove, onLoaded, onReorder, canRemove, uploads,
  additionalChildren, onDragStateChange,
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

  const totalDraggable = photos.length
  const totalDraggableRef = useRef(totalDraggable)
  const onReorderRef = useRef(onReorder)
  const onDragStateChangeRef = useRef(onDragStateChange)
  useEffect(() => { totalDraggableRef.current = totalDraggable; layouts.current.length = totalDraggable }, [totalDraggable])
  useEffect(() => { onReorderRef.current = onReorder }, [onReorder])
  useEffect(() => { onDragStateChangeRef.current = onDragStateChange }, [onDragStateChange])

  const sourceIdxRef = useRef<number | null>(null)

  const dragPan = useMemo(() =>
    Gesture.Pan()
      .activateAfterLongPress(300)
      .activeOffsetX([-8, 8])
      .activeOffsetY([-8, 8])
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
        if (hit >= 0) setDragIdx(hit)
      })
      .onStart(() => {
        const idx = sourceIdxRef.current
        if (idx == null) return
        tapMedium()
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
        if (idx != null && target !== null && target >= 0 && target < totalDraggableRef.current && target !== idx) {
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
            localUri={matchingUpload?.uri ?? localPhotoUriCache.get(filename)}
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
          {u.uri ? (
            <ExpoImage source={u.uri} style={photoStyles.img} cachePolicy="disk" />
          ) : (
            <View style={photoStyles.placeholderBg}>
              <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
                <Circle cx="12" cy="8" r="4" fill="rgba(0,0,0,0.10)" />
                <Path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" fill="rgba(0,0,0,0.10)" />
              </Svg>
            </View>
          )}
          <ActivityIndicator size="small" color={PRIMARY} style={photoStyles.placeholderSpinner} />
        </View>
      ))}
      {additionalChildren}
      {(() => {
        const pendingCount = uploads.filter(u => !u.filename).length
        const addCount = Array.isArray(additionalChildren)
          ? additionalChildren.length
          : additionalChildren ? 1 : 0
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
// the duplicate-detected dialog.
//
// When `deferUpload` is true, picked photos are only compressed locally —
// nothing is sent to storage until the caller invokes `flush()` via the
// forwarded ref. Removes never touch storage; they only drop the reference
// from the images array (the DB update happens on flush / auto-save).
//
// `flush()` first commits filenames to the store and caches local URIs in
// `localPhotoUriCache` (both synchronous), then uploads in the background.
// This lets sibling components (e.g. the thumbnail strip on the profile
// tab) show the photos immediately from the device cache while the upload
// is still in flight.
export const PhotoEditor = forwardRef<PhotoEditorRef, {
  onDragStateChange?: (dragging: boolean) => void
  onUploadingChange?: (uploading: boolean) => void
  deferUpload?: boolean
  onTotalCountChange?: (count: number) => void
}>(function PhotoEditor({
  onDragStateChange,
  onUploadingChange,
  deferUpload,
  onTotalCountChange,
}, ref) {
  const { user } = useAuthStore()
  const { profile, update } = useUserStore()
  const [uploads, setUploads] = useState<{ id: string; uri: string; filename?: string; sig: string }[]>([])
  // Deferred uploads: photos NOT yet in the store, waiting for flush().
  // Keyed by normalFilename. flush() uploads and then commits to the store.
  const pendingUploads = useRef<Map<string, {
    normalFilename: string
    normalUri: string
    hash: string
  }>>(new Map())

  useEffect(() => {
    onUploadingChange?.(uploads.some(u => !u.filename))
  }, [uploads, onUploadingChange])
  // filename → signature map, persists across the session even after the
  // upload cell has disappeared, so re-picking the same asset still dedupes.
  const sigByFilename = useRef<Map<string, string>>(new Map())
  const [duplicateDialog, setDuplicateDialog] = useState(false)

  const storeImages = profile?.images ?? []
  const photos = storeImages.map(e => e.normal ?? '')

  useEffect(() => { onTotalCountChange?.(photos.length) }, [photos.length, onTotalCountChange])

  // ── Flush: upload pending deferred photos and persist to the server ──
  // Photos in pendingUploads are committed to the local store but excluded
  // from useDataSave via pendingDeferred until upload succeeds. flush()
  // uploads each file, patches the hash, then calls invoke('app/images')
  // directly so the save is not lost if the parent unmounts before the
  // useDataSave debounce timer can fire.
  const flushRef = useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    const entries = Array.from(pendingUploads.current.values())
    if (entries.length === 0) return

    const userId = user?.id
    if (!userId) return

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    for (const lp of entries) {
      try {
        await uploadFileToStorage(lp.normalUri, lp.normalFilename, 'image/webp', 'normal', token, userId)
        pendingDeferred.delete(lp.normalFilename)
        const imgs = useUserStore.getState().profile?.images
        if (imgs) {
          const idx = imgs.findIndex(e => e.normal === lp.normalFilename)
          if (idx >= 0) {
            const next = [...imgs]
            next[idx] = { ...next[idx], hash: lp.hash }
            useUserStore.getState().update({ images: next })
          }
        }
      } catch (e) {
        console.error('Deferred upload error:', e)
        pendingDeferred.delete(lp.normalFilename)
        const imgs = useUserStore.getState().profile?.images
        if (imgs) {
          useUserStore.getState().update({ images: imgs.filter(img => img.normal !== lp.normalFilename) })
        }
      }
      pendingUploads.current.delete(lp.normalFilename)
      localPhotoUriCache.delete(lp.normalFilename)
    }

    const finalImgs = useUserStore.getState().profile?.images
    if (finalImgs) await invoke('app/images', { images: finalImgs }).catch(console.error)
  }

  useImperativeHandle(ref, () => ({ flush: () => flushRef.current() }), [])

  // Safety net: if PhotoEditor unmounts via a path that bypasses the parent's
  // explicit flush() call (swipe-back, hardware-back, etc.), still upload and
  // persist any pending photos. Fire-and-forget — the global store survives
  // even after the parent component is gone.
  useEffect(() => {
    return () => {
      if (pendingUploads.current.size > 0) flushRef.current().catch(console.error)
    }
  }, [])

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

  // Encodes a blurhash string (~30 chars) from the source image. Pure-JS:
  // resize to 32px PNG, decode to RGBA, feed to blurhash encoder. Runs in
  // the background alongside compression; returns '' on failure so the
  // caller can still proceed (rendering falls back to a flat placeholder).
  const computeBlurhash = async (uri: string): Promise<string> => {
    try {
      const small = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 32 } }],
        { format: ImageManipulator.SaveFormat.PNG, base64: true }
      )
      const base64 = small.base64
      if (!base64) return ''
      const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const png = UPNG.decode(binary.buffer)
      const rgba = new Uint8ClampedArray(UPNG.toRGBA8(png)[0])
      return encodeBlurhash(rgba, png.width, png.height, 4, 3)
    } catch (e) {
      console.error('blurhash encode failed', e)
      return ''
    }
  }

  const uploadOne = async (asset: DocumentPicker.DocumentPickerAsset): Promise<ImageData | null> => {
    if (!user) return null
    const normalFilename = `${uuidv4()}.webp`
    const [normalUri, hash] = await Promise.all([
      compressUnder200K(asset.uri),
      computeBlurhash(asset.uri),
    ])
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''
    await uploadFileToStorage(normalUri, normalFilename, 'image/webp', 'normal', token, user.id)
    return { normal: normalFilename, hash }
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

    if (deferUpload) {
      const entries = assets.map((a, i) => {
        const normalFilename = `${uuidv4()}.webp`
        sigByFilename.current.set(normalFilename, filteredSigs[i])
        return { normalFilename, originalUri: a.uri }
      })

      // Commit to the store immediately so the image is visible and reorderable.
      // Also add to pendingDeferred so useDataSave skips it until flush() succeeds,
      // preventing a dangling DB reference if the app closes before the upload runs.
      const currentImages = useUserStore.getState().profile?.images ?? []
      useUserStore.getState().update({
        images: [
          ...currentImages,
          ...entries.map(e => ({ normal: e.normalFilename, hash: '' }) satisfies ImageData),
        ],
      })
      for (const e of entries) {
        localPhotoUriCache.set(e.normalFilename, e.originalUri)
        pendingUploads.current.set(e.normalFilename, { normalFilename: e.normalFilename, normalUri: e.originalUri, hash: '' })
        pendingDeferred.add(e.normalFilename)
      }

      // Compress in the background; results go into pendingUploads for flush().
      for (const e of entries) {
        try {
          const [normalUri, hash] = await Promise.all([
            compressUnder200K(e.originalUri),
            computeBlurhash(e.originalUri),
          ])
          const pending = pendingUploads.current.get(e.normalFilename)
          if (pending) { pending.normalUri = normalUri; if (hash) pending.hash = hash }
        } catch (err) {
          console.error('Photo compress error:', err)
        }
      }
      return
    }

    // Immediate upload path (original behaviour).
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
          sigByFilename.current.set(result.normal!, newUploads[i].sig)
          setUploads(prev => prev.map(u => u.id === newUploads[i].id ? { ...u, filename: result.normal } : u))
          const currentImages = useUserStore.getState().profile?.images ?? []
          update({ images: [...currentImages, result] })
        } else {
          setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
        }
      } catch (e: any) {
        console.error('Photo upload error:', e)
        setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
      }
    }
  }

  const removePhoto = (filename: string) => {
    if (photos.length <= 1) return
    const idx = storeImages.findIndex(e => e.normal === filename)
    if (idx < 0) return
    sigByFilename.current.delete(filename)
    localPhotoUriCache.delete(filename)
    pendingUploads.current.delete(filename)
    pendingDeferred.delete(filename)
    update({ images: storeImages.filter((_, i) => i !== idx) })
  }

  const reorderPhotos = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return
    const next = [...storeImages]
    ;[next[from], next[to]] = [next[to], next[from]]
    update({ images: next })
  }

  const onPhotoLoaded = (filename: string) => {
    setUploads(prev => prev.filter(u => u.filename !== filename))
  }

  return (
    <>
      <PhotoGrid
        photos={photos}
        urlFor={(f) => localPhotoUriCache.get(f) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${user!.id}/normal/${f}`}
        onRemove={removePhoto}
        onLoaded={onPhotoLoaded}
        onReorder={reorderPhotos}
        canRemove={photos.length > 1}
        uploads={uploads}
        onDragStateChange={onDragStateChange}
        additionalChildren={
          (() => {
            const filledCount = photos.length + uploads.filter(u => !u.filename).length
            const emptySlots = Math.max(0, 6 - filledCount)
            return Array.from({ length: emptySlots }).map((_, i) => (
              <Pressable
                key={`add-${i}`}
                style={photoStyles.add}
                onPress={() => { tap(); pickPhoto() }}
              >
                <Svg pointerEvents="none" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} strokeLinecap="round">
                  <Path d="M12 5v14M5 12h14" />
                </Svg>
              </Pressable>
            ))
          })()
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
})

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
  cell: { width: '31.5%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden' },
  filler: { backgroundColor: 'transparent', borderWidth: 0, height: 0 },
  img: { width: '100%', height: '100%' },
  placeholderBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderSpinner: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
  },
  remove: {
    position: 'absolute', top: 6, end: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 3,
  },
  add: {
    width: '31.5%', aspectRatio: 3 / 4, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)', borderStyle: 'dashed',
  },
  dropTarget: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 16,
  },
  spinnerBadge: {
    position: 'absolute',
    top: '50%', start: '50%',
    width: 36, height: 36, marginStart: -18, marginTop: -18,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
})
